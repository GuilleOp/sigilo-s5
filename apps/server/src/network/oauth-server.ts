// Servidor de autorización OAuth 2.0 del nodo, con la metodología de las APIs de la PDN: el nodo es
// el proveedor y emite tokens a la SESNA (`POST /oauth/token`) con los flujos `password` (el de la
// PDN), `client_credentials` (el recomendado) y `refresh_token`. El mismo nodo verifica los tokens
// en sus recursos (buzón de red y estadística), así que se firman con HMAC (JWT HS256) y una llave
// que nunca sale del proceso.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import {
  PDN_ACCESS_TOKEN_TTL_SECONDS,
  PDN_REFRESH_TOKEN_TTL_SECONDS,
  PdnGrantTypeSchema,
  PdnScopeSchema,
  Sha256HexSchema,
} from '@sigilo/contracts';
import type { PdnScope, PdnTokenError, PdnTokenResponse } from '@sigilo/contracts';
import { fromBase64Url, randomBytes, toBase64Url } from '@sigilo/core';
import { hashPassword, parsePasswordHash, verifyPassword } from '../security/passwords.ts';
import { createRateLimiter } from '../security/rate-limiter.ts';
import type { RateLimitRule } from '../security/rate-limiter.ts';

/** Nombre del archivo de clientes en el directorio de datos (lo genera `npm run red:demo`). */
export const OAUTH_CLIENTS_FILE_NAME = 'oauth-clients.json';

const ClientIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/u, 'Cliente inválido');

/**
 * Archivo `oauth-clients.json`: cada cliente con el digesto SHA-256 de su secreto (aleatorio, de
 * 32 bytes), sus permisos, sus flujos y, para `password`, su usuario con digesto scrypt.
 * Seguridad: el archivo no guarda ningún secreto en claro; los secretos solo los tiene la SESNA.
 */
export const OAuthClientsFileSchema = z
  .object({
    version: z.literal(1),
    clients: z
      .array(
        z
          .object({
            clientId: ClientIdSchema,
            clientSecretDigest: Sha256HexSchema,
            scopes: z.array(PdnScopeSchema).min(1),
            grantTypes: z.array(PdnGrantTypeSchema).min(1),
            user: z
              .object({ username: z.string().min(3).max(128), passwordHash: z.string() })
              .strict()
              .optional(),
          })
          .strict(),
      )
      .max(32),
  })
  .strict();
export type OAuthClient = z.infer<typeof OAuthClientsFileSchema>['clients'][number];

/** SHA-256 en hexadecimal del secreto de un cliente, como se guarda en `oauth-clients.json`. */
export function clientSecretDigest(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/**
 * Lee `oauth-clients.json`; sin archivo, ningún cliente (el nodo no emite tokens y sus recursos
 * protegidos responden `401`). Lanza error si el archivo no cumple el esquema, si un cliente con
 * `password` no tiene usuario o su digesto no es scrypt válido, o si un identificador se repite.
 */
export function loadOAuthClients(path: string): OAuthClient[] {
  if (!existsSync(path)) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`No se pudo leer ${OAUTH_CLIENTS_FILE_NAME}.`);
  }
  const parsed = OAuthClientsFileSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`${OAUTH_CLIENTS_FILE_NAME} no tiene el formato esperado.`);
  const ids = new Set<string>();
  for (const client of parsed.data.clients) {
    if (ids.has(client.clientId)) throw new Error('Un cliente OAuth está repetido.');
    ids.add(client.clientId);
    const needsUser = client.grantTypes.includes('password');
    if (needsUser !== (client.user !== undefined)) {
      throw new Error('Un cliente OAuth con el flujo password debe tener usuario (y solo ese).');
    }
    if (client.user !== undefined && parsePasswordHash(client.user.passwordHash) === null) {
      throw new Error('El digesto de la contraseña de un cliente OAuth no es válido.');
    }
  }
  return parsed.data.clients;
}

/** Resultado del punto de emisión: estatus HTTP y cuerpo (RFC 6749, secciones 5.1 y 5.2). */
export type TokenOutcome =
  | { status: 200; body: PdnTokenResponse }
  | { status: 400 | 401 | 429; body: PdnTokenError; basicChallenge: boolean };

/** Parámetros de la petición de token ya leídos del cuerpo y de la cabecera. */
export interface TokenInput {
  /** Valor de la cabecera `Authorization`, si vino. */
  authorization: string | undefined;
  /** Parámetros del cuerpo (cada uno una sola vez). */
  params: Readonly<Record<string, string>>;
}

/** Resultado de verificar un token de acceso. */
export type BearerCheck =
  | { ok: true; clientId: string; scopes: readonly PdnScope[] }
  | { ok: false; error: 'invalid_token' | 'insufficient_scope' };

/** Servidor de autorización del nodo. */
export interface NodeOAuthServer {
  /** Atiende una petición de token. Nunca lanza por datos de la petición. */
  token(input: TokenInput): Promise<TokenOutcome>;
  /** Verifica `Authorization: Bearer <token>` y que conceda `scope`. */
  verify(authorization: string | undefined, scope: PdnScope): BearerCheck;
}

/** Opciones del servidor de autorización. */
export interface NodeOAuthOptions {
  /** Emisor y audiencia de los tokens: el identificador del nodo. */
  issuer: string;
  clients: readonly OAuthClient[];
  /**
   * Reloj en milisegundos. Por omisión, el real: los tokens no siguen el reloj simulado de la
   * demostración, para que adelantarlo no los venza a medias.
   */
  clock?: () => number;
  /** Llave HMAC de los tokens; por omisión, aleatoria por proceso. */
  signingKey?: Uint8Array;
  /**
   * Fallos del flujo `password` permitidos por cliente autenticado antes de responder `429` (10 cada
   * 15 minutos). Los secretos de cliente equivocados nunca bloquean (H01).
   */
  failuresPerClient?: RateLimitRule;
  accessTokenTtlSeconds?: number;
  refreshTokenTtlSeconds?: number;
}

const DEFAULT_FAILURES: RateLimitRule = { limit: 10, windowMs: 15 * 60 * 1000 };
const MAX_REFRESH_TOKENS = 1000;
const MAX_TOKEN_LENGTH = 2048;
const CLOCK_SKEW_SECONDS = 60;

const ERROR_DESCRIPTIONS: Readonly<Record<PdnTokenError['error'], string>> = {
  invalid_request: 'La petición no tiene los parámetros esperados.',
  invalid_client: 'No se pudo autenticar al cliente.',
  invalid_grant: 'La autorización no es válida.',
  unauthorized_client: 'El cliente no puede usar este flujo.',
  unsupported_grant_type: 'Flujo no soportado.',
  invalid_scope: 'Permiso no válido.',
};

const RATE_LIMITED_DESCRIPTION = 'Demasiados intentos; espera unos minutos.';

const JWT_HEADER = toBase64Url(
  new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'at+jwt' })),
);

const ClaimsSchema = z
  .object({
    iss: z.string(),
    aud: z.string(),
    sub: z.string(),
    client_id: z.string(),
    scope: z.string(),
    iat: z.number().int(),
    exp: z.number().int(),
    jti: z.string(),
  })
  .strict();

function failure(
  error: PdnTokenError['error'],
  status: 400 | 401 = 400,
  basicChallenge = false,
): TokenOutcome {
  return { status, body: { error, error_description: ERROR_DESCRIPTIONS[error] }, basicChallenge };
}

function digestBytes(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Compara el secreto con el digesto guardado en tiempo constante.
 * Seguridad: con un cliente desconocido se compara contra un digesto de relleno, así que el tiempo
 * no revela qué identificadores existen.
 */
function secretMatches(secret: string, expectedDigestHex: string): boolean {
  const expected = Buffer.from(expectedDigestHex, 'hex');
  const actual = digestBytes(secret);
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

/** Lee `Authorization: Basic` (RFC 6749, sección 2.3.1: identificador y secreto codificados). */
function parseBasic(header: string): { id: string; secret: string } | null {
  const match = /^Basic ([A-Za-z0-9+/=]{1,700})$/u.exec(header.trim());
  if (match === null) return null;
  const decoded = Buffer.from(match[1] ?? '', 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator < 1) return null;
  try {
    return {
      id: decodeURIComponent(decoded.slice(0, separator).replaceAll('+', ' ')),
      secret: decodeURIComponent(decoded.slice(separator + 1).replaceAll('+', ' ')),
    };
  } catch {
    return null;
  }
}

/** Crea el servidor de autorización del nodo. */
export function createNodeOAuthServer(options: NodeOAuthOptions): NodeOAuthServer {
  const clock = options.clock ?? (() => Date.now());
  const key = options.signingKey ?? randomBytes(32);
  const accessTtl = options.accessTokenTtlSeconds ?? PDN_ACCESS_TOKEN_TTL_SECONDS;
  const refreshTtl = options.refreshTokenTtlSeconds ?? PDN_REFRESH_TOKEN_TTL_SECONDS;
  const clients = new Map(options.clients.map((client) => [client.clientId, client]));
  const failures = createRateLimiter(
    options.failuresPerClient ?? DEFAULT_FAILURES,
    () => new Date(clock()),
    { maxKeys: 10_000 },
  );
  // Seguridad: los tokens de renovación se guardan solo como digesto y en memoria; al reiniciar el
  // nodo la SESNA vuelve a pedir uno con sus credenciales.
  const refreshTokens = new Map<
    string,
    { clientId: string; scopes: readonly PdnScope[]; expiresAt: number }
  >();
  const decoyDigest = toBase64Url(randomBytes(32));
  const fillerDigest = createHash('sha256').update(decoyDigest).digest('hex');
  let decoyPasswordHash: string | null = null;
  // Digesto de relleno con el mismo costo que el de los usuarios, para que un usuario desconocido
  // tarde lo mismo que una contraseña equivocada.
  const decoyPassword = (like: string): string => {
    if (decoyPasswordHash === null) {
      decoyPasswordHash = hashPassword(decoyDigest, parsePasswordHash(like)?.logN ?? 14);
    }
    return decoyPasswordHash;
  };

  const sign = (input: string): string =>
    toBase64Url(createHmac('sha256', key).update(input, 'utf8').digest());

  const nowSeconds = (): number => Math.floor(clock() / 1000);

  const issueAccess = (clientId: string, scopes: readonly PdnScope[]) => {
    const iat = nowSeconds();
    const claims = {
      iss: options.issuer,
      aud: options.issuer,
      sub: clientId,
      client_id: clientId,
      scope: scopes.join(' '),
      iat,
      exp: iat + accessTtl,
      jti: toBase64Url(randomBytes(12)),
    };
    const body = `${JWT_HEADER}.${toBase64Url(new TextEncoder().encode(JSON.stringify(claims)))}`;
    return `${body}.${sign(body)}`;
  };

  const issueRefresh = (clientId: string, scopes: readonly PdnScope[]): string => {
    const now = clock();
    for (const [digest, entry] of refreshTokens) {
      if (entry.expiresAt <= now) refreshTokens.delete(digest);
    }
    while (refreshTokens.size >= MAX_REFRESH_TOKENS) {
      const oldest = refreshTokens.keys().next().value;
      if (oldest === undefined) break;
      refreshTokens.delete(oldest);
    }
    const token = toBase64Url(randomBytes(32));
    refreshTokens.set(digestBytes(token).toString('hex'), {
      clientId,
      scopes,
      expiresAt: now + refreshTtl * 1000,
    });
    return token;
  };

  /** Permisos pedidos: todos los del cliente si falta `scope`; `null` si alguno no le toca. */
  const grantedScopes = (
    requested: string | undefined,
    allowed: readonly PdnScope[],
  ): PdnScope[] | null => {
    if (requested === undefined || requested.trim() === '') return [...allowed];
    const items = [...new Set(requested.trim().split(/ +/u))];
    const result: PdnScope[] = [];
    for (const item of items) {
      const scope = PdnScopeSchema.safeParse(item);
      if (!scope.success || !allowed.includes(scope.data)) return null;
      result.push(scope.data);
    }
    return result;
  };

  const success = (
    clientId: string,
    scopes: readonly PdnScope[],
    withRefresh: boolean,
  ): TokenOutcome => ({
    status: 200,
    body: {
      access_token: issueAccess(clientId, scopes),
      token_type: 'Bearer',
      expires_in: accessTtl,
      scope: scopes.join(' '),
      ...(withRefresh
        ? {
            refresh_token: issueRefresh(clientId, scopes),
            refresh_token_expires_in: refreshTtl,
          }
        : {}),
    },
  });

  return {
    async token({ authorization, params }) {
      const basic = authorization === undefined ? null : parseBasic(authorization);
      if (authorization !== undefined && basic === null) {
        return failure('invalid_client', 401, true);
      }
      if (
        basic !== null &&
        (params.client_id !== undefined || params.client_secret !== undefined)
      ) {
        // RFC 6749, sección 2.3: un solo método de autenticación por petición.
        return failure('invalid_request');
      }
      const clientId = basic?.id ?? params.client_id;
      const secret = basic?.secret ?? params.client_secret;
      if (clientId === undefined || secret === undefined) {
        return failure('invalid_client', 401, basic !== null);
      }
      // Seguridad (H01): el secreto del cliente es aleatorio de 32 bytes, así que adivinarlo es
      // inviable y no hace falta un tope por identificador. Un tope aquí (antes de comparar) dejaba
      // que cualquiera, con el `client_id` predecible, bloqueara a la SESNA con 10 fallos y cortara
      // las entregas de la red. Siempre se compara, y un secreto equivocado solo recibe `401`.
      const client = clients.get(clientId);
      const isClient = secretMatches(secret, client?.clientSecretDigest ?? fillerDigest);
      if (client === undefined || !isClient) {
        return failure('invalid_client', 401, basic !== null);
      }
      // El tope de fallos queda solo para el flujo `password` (adivinable) y se indexa por un
      // cliente ya autenticado: solo quien tiene el secreto del cliente puede llegar a bloquearlo.
      const limiterKey = `password:${client.clientId}`;
      const grant = PdnGrantTypeSchema.safeParse(params.grant_type);
      if (!grant.success) {
        return failure(
          params.grant_type === undefined ? 'invalid_request' : 'unsupported_grant_type',
        );
      }
      if (!client.grantTypes.includes(grant.data)) return failure('unauthorized_client');
      switch (grant.data) {
        case 'client_credentials': {
          const scopes = grantedScopes(params.scope, client.scopes);
          if (scopes === null) return failure('invalid_scope');
          // RFC 6749, sección 4.4.3: sin token de renovación.
          return success(client.clientId, scopes, false);
        }
        case 'password': {
          const user = client.user;
          const { username, password } = params;
          if (user === undefined || username === undefined || password === undefined) {
            return failure('invalid_request');
          }
          // Con el usuario bloqueado no se compara la contraseña: no hay oráculo de aciertos.
          if (failures.isLimited(limiterKey)) {
            return {
              status: 429,
              body: { error: 'invalid_grant', error_description: RATE_LIMITED_DESCRIPTION },
              basicChallenge: false,
            };
          }
          const isUser = secretMatches(username, clientSecretDigest(user.username));
          const passwordHash = isUser ? user.passwordHash : decoyPassword(user.passwordHash);
          const isPassword = await verifyPassword(password, passwordHash);
          if (!isUser || !isPassword) {
            failures.consume(limiterKey);
            return failure('invalid_grant');
          }
          const scopes = grantedScopes(params.scope, client.scopes);
          if (scopes === null) return failure('invalid_scope');
          return success(client.clientId, scopes, client.grantTypes.includes('refresh_token'));
        }
        case 'refresh_token': {
          const token = params.refresh_token;
          if (token === undefined) return failure('invalid_request');
          const digest = digestBytes(token).toString('hex');
          const entry = refreshTokens.get(digest);
          // Seguridad: de un solo uso; se borra aunque falle la comprobación de cliente.
          refreshTokens.delete(digest);
          if (
            entry === undefined ||
            entry.clientId !== client.clientId ||
            entry.expiresAt <= clock()
          ) {
            // El token de renovación es aleatorio de 32 bytes: no se cuenta para el tope.
            return failure('invalid_grant');
          }
          const scopes = grantedScopes(params.scope, entry.scopes);
          if (scopes === null) return failure('invalid_scope');
          return success(client.clientId, scopes, true);
        }
      }
    },
    verify(authorization, scope) {
      const match = /^Bearer ([A-Za-z0-9_.-]{1,2048})$/u.exec(authorization?.trim() ?? '');
      const token = match?.[1];
      if (token === undefined || token.length > MAX_TOKEN_LENGTH) {
        return { ok: false, error: 'invalid_token' };
      }
      const parts = token.split('.');
      if (parts.length !== 3 || parts[0] !== JWT_HEADER) {
        return { ok: false, error: 'invalid_token' };
      }
      const body = `${parts[0]}.${parts[1]}`;
      let isSigned: boolean;
      try {
        const expected = fromBase64Url(sign(body));
        const actual = fromBase64Url(parts[2] ?? '');
        isSigned = actual.length === expected.length && timingSafeEqual(actual, expected);
      } catch {
        isSigned = false;
      }
      if (!isSigned) return { ok: false, error: 'invalid_token' };
      let claims: z.infer<typeof ClaimsSchema>;
      try {
        claims = ClaimsSchema.parse(
          JSON.parse(new TextDecoder().decode(fromBase64Url(parts[1] ?? ''))),
        );
      } catch {
        return { ok: false, error: 'invalid_token' };
      }
      const now = nowSeconds();
      const client = clients.get(claims.client_id);
      if (
        claims.iss !== options.issuer ||
        claims.aud !== options.issuer ||
        claims.sub !== claims.client_id ||
        claims.exp <= now ||
        claims.iat > now + CLOCK_SKEW_SECONDS ||
        client === undefined
      ) {
        return { ok: false, error: 'invalid_token' };
      }
      const scopes = claims.scope
        .split(' ')
        .filter((item): item is PdnScope => PdnScopeSchema.safeParse(item).success);
      // El cliente pudo perder un permiso al reiniciar con otro archivo: se vuelve a comprobar.
      if (!scopes.includes(scope) || !client.scopes.includes(scope)) {
        return { ok: false, error: 'insufficient_scope' };
      }
      return { ok: true, clientId: claims.client_id, scopes };
    },
  };
}
