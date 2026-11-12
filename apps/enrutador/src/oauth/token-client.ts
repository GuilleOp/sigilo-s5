// Cliente OAuth 2.0 de la SESNA ante el servidor de autorización de cada nodo (`POST /oauth/token`,
// RFC 6749): pide el token con `client_credentials` o `password` (el flujo de las APIs de la PDN),
// lo guarda en memoria hasta poco antes de vencer y, con `password`, lo renueva con su
// `refresh_token`.
import { PDN_ROUTES, PdnTokenResponseSchema } from '@sigilo/contracts';
import type { DirectoryNode, PdnScope } from '@sigilo/contracts';
import type { FetchLike } from '@sigilo/red';
import type { NodeCredential } from './node-credentials.ts';

/** Cliente de tokens por nodo y permiso. */
export interface NodeTokenClient {
  /** Si la SESNA tiene credenciales de ese nodo. */
  hasCredentials(node: DirectoryNode): boolean;
  /** Token de acceso vigente para el permiso, o `null` si el nodo no lo dio. */
  token(node: DirectoryNode, scope: PdnScope): Promise<string | null>;
  /** Olvida el token guardado (por ejemplo, si el nodo lo rechazó con `401`). */
  invalidate(node: DirectoryNode, scope: PdnScope): void;
}

/** Dependencias del cliente. */
export interface NodeTokenClientDeps {
  credentials: ReadonlyMap<string, NodeCredential>;
  nodeUrl: (node: DirectoryNode) => string;
  fetch: FetchLike;
  /** Reloj en milisegundos (por omisión, el real). */
  clock?: () => number;
  timeoutMs?: number;
}

/** Margen antes del vencimiento en que se pide otro token, en segundos. */
const RENEW_MARGIN_SECONDS = 30;

interface CachedToken {
  accessToken: string;
  expiresAt: number;
  refreshToken: string | null;
}

/** Codificación de `client_secret_basic` (RFC 6749, sección 2.3.1: formulario y luego Base64). */
function basicAuthorization(credential: NodeCredential): string {
  const encode = (value: string): string => encodeURIComponent(value).replaceAll('%20', '+');
  const pair = `${encode(credential.clientId)}:${encode(credential.clientSecret)}`;
  return `Basic ${Buffer.from(pair, 'utf8').toString('base64')}`;
}

/** Crea el cliente de tokens. Las peticiones simultáneas por el mismo token comparten una sola. */
export function createNodeTokenClient(deps: NodeTokenClientDeps): NodeTokenClient {
  const clock = deps.clock ?? (() => Date.now());
  const cache = new Map<string, CachedToken>();
  const pending = new Map<string, Promise<string | null>>();

  const request = async (
    node: DirectoryNode,
    credential: NodeCredential,
    body: URLSearchParams,
  ): Promise<CachedToken | null> => {
    try {
      // Seguridad: la petición se arma desde cero; el secreto va solo en `Authorization` y la
      // contraseña solo en el cuerpo. Nada de esto se registra.
      const response = await deps.fetch(`${deps.nodeUrl(node)}${PDN_ROUTES.token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: basicAuthorization(credential),
        },
        body: body.toString(),
        redirect: 'error',
        signal: AbortSignal.timeout(deps.timeoutMs ?? 10_000),
      });
      if (response.status !== 200) return null;
      const parsed = PdnTokenResponseSchema.safeParse(await response.json());
      if (!parsed.success) return null;
      return {
        accessToken: parsed.data.access_token,
        expiresAt: clock() + Math.max(parsed.data.expires_in - RENEW_MARGIN_SECONDS, 1) * 1000,
        refreshToken: parsed.data.refresh_token ?? null,
      };
    } catch {
      return null;
    }
  };

  const obtain = async (node: DirectoryNode, scope: PdnScope, key: string) => {
    const credential = deps.credentials.get(node.id);
    if (credential === undefined) return null;
    const previous = cache.get(key);
    let fresh: CachedToken | null = null;
    if (previous?.refreshToken != null) {
      fresh = await request(
        node,
        credential,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: previous.refreshToken,
          scope,
        }),
      );
    }
    if (fresh === null) {
      const body = new URLSearchParams({ grant_type: credential.grantType, scope });
      if (credential.grantType === 'password') {
        body.set('username', credential.username ?? '');
        body.set('password', credential.password ?? '');
      }
      fresh = await request(node, credential, body);
    }
    if (fresh === null) {
      cache.delete(key);
      return null;
    }
    cache.set(key, fresh);
    return fresh.accessToken;
  };

  return {
    hasCredentials: (node) => deps.credentials.has(node.id),
    async token(node, scope) {
      const key = `${node.id} ${scope}`;
      const cached = cache.get(key);
      if (cached !== undefined && cached.expiresAt > clock()) return cached.accessToken;
      const inFlight = pending.get(key);
      if (inFlight !== undefined) return inFlight;
      const promise = obtain(node, scope, key).finally(() => pending.delete(key));
      pending.set(key, promise);
      return promise;
    },
    invalidate(node, scope) {
      const key = `${node.id} ${scope}`;
      const cached = cache.get(key);
      // Se conserva el token de renovación: el siguiente intento lo usa antes que la contraseña.
      if (cached !== undefined) cache.set(key, { ...cached, expiresAt: 0 });
    },
  };
}
