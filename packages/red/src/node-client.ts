// Interfaz de un nodo con la red: registrarse y publicar su cabeza ante el enrutador, y recibir
// sobres de red en su buzón (`NETWORK_ROUTES.nodeInbox`) traducidos a sus propias rutas v1.
import {
  API_ERROR_MESSAGES,
  NETWORK_ROUTES,
  NodeHeadAcceptanceSchema,
  NodeRegistrationReceiptSchema,
  POW_HEADER,
  RelayRequestSchema,
  ROUTES,
  SignedLedgerHeadSchema,
} from '@sigilo/contracts';
import type {
  NetworkTrustAnchor,
  NodeHeadAcceptance,
  NodeRegistrationReceipt,
  RoutedBody,
  RoutedReply,
  RoutedRequest,
  SignedLedgerHead,
} from '@sigilo/contracts';
import { fromBase64Url, toBase64Url } from '@sigilo/core';
import { verifySignedDirectory } from './directory.ts';
import type { DirectoryVerification } from './directory.ts';
import { openRoutedRequest, sealRoutedReply } from './relay-envelope.ts';
import { signNodeRegistration } from './registration.ts';
import { RELAY_AUTH_HEADER, createRelayNonceCache, verifyRelayAuthHeader } from './relay-auth.ts';

/** Función `fetch` compatible con la de la plataforma (inyectable en pruebas). */
export type FetchLike = (input: string | Request, init?: RequestInit) => Promise<Response>;

/** Opciones del cliente de red de un nodo. */
export interface NodeNetworkClientOptions {
  /** Origen del enrutador, sin ruta (`http://enrutador:8790`). */
  routerUrl: string;
  nodeId: string;
  /** Semilla Ed25519 del nodo: la misma que firma la cabeza de su bitácora (`keys.json`). */
  signingPrivateKey: Uint8Array;
  fetch?: FetchLike;
}

/** Cliente que usa un nodo para hablar con el enrutador. */
export interface NodeNetworkClient {
  /** Registra el nodo; `sequence` debe crecer en cada registro (por ejemplo, segundos Unix). */
  register(input: {
    sequence: number;
    standardVersion: string;
    acceptsRelay: boolean;
  }): Promise<NodeRegistrationReceipt>;
  /** Publica la cabeza firmada de la bitácora del nodo en la bitácora nacional. */
  publishHead(head: SignedLedgerHead): Promise<NodeHeadAcceptance>;
  /** Descarga el directorio y lo verifica con la raíz de confianza. */
  fetchDirectory(trust: NetworkTrustAnchor): Promise<DirectoryVerification>;
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`El enrutador respondió ${response.status}.`);
  return response.json();
}

/** Crea el cliente de red del nodo. No guarda estado: el nodo lleva la secuencia del registro. */
export function createNodeNetworkClient(options: NodeNetworkClientOptions): NodeNetworkClient {
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const base = options.routerUrl.replace(/\/+$/u, '');
  const postJson = async (path: string, body: unknown): Promise<unknown> =>
    readJson(
      await doFetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  return {
    async register(input) {
      const registration = signNodeRegistration(
        { nodeId: options.nodeId, ...input },
        options.signingPrivateKey,
      );
      const raw = await postJson(NETWORK_ROUTES.nodeRegistration(options.nodeId), registration);
      return NodeRegistrationReceiptSchema.parse(raw);
    },
    async publishHead(head) {
      const raw = await postJson(
        NETWORK_ROUTES.nodeHeads(options.nodeId),
        SignedLedgerHeadSchema.parse(head),
      );
      return NodeHeadAcceptanceSchema.parse(raw);
    },
    async fetchDirectory(trust) {
      const raw = await readJson(await doFetch(`${base}${NETWORK_ROUTES.directory}`));
      return verifySignedDirectory(raw, trust);
    },
  };
}

const OPERATION_TARGETS: Readonly<
  Record<RoutedRequest['operationId'], { method: 'GET' | 'POST'; path: string }>
> = {
  getPowChallenge: { method: 'GET', path: ROUTES.powChallenge },
  uploadEvidence: { method: 'POST', path: ROUTES.evidenceUpload },
  submitComplaint: { method: 'POST', path: ROUTES.complaints },
  getTracking: { method: 'POST', path: ROUTES.tracking },
  sendReporterMessage: { method: 'POST', path: ROUTES.trackingMessages },
  fileAppeal: { method: 'POST', path: ROUTES.trackingAppeal },
};

/**
 * Traduce una petición de red a la petición equivalente de la API v1 del nodo, para pasarla a su
 * propia aplicación (por ejemplo, `app.request(...)` de Hono). Solo lleva el tipo de contenido y la
 * prueba de trabajo: ninguna cabecera del navegador ni del enrutador.
 */
export function routedRequestToFetch(
  request: RoutedRequest,
  origin = 'http://nodo.invalid',
): Request {
  const target = OPERATION_TARGETS[request.operationId];
  const url = new URL(target.path, origin);
  for (const [name, value] of Object.entries(request.query)) url.searchParams.set(name, value);
  const headers = new Headers();
  if (request.proofOfWork !== null) headers.set(POW_HEADER, request.proofOfWork);
  let body: RequestInit['body'] = null;
  if (request.body.kind === 'json') {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(request.body.value);
  } else if (request.body.kind === 'binary') {
    headers.set('Content-Type', request.body.mediaType);
    body = new Uint8Array(fromBase64Url(request.body.data));
  }
  return new Request(url, { method: target.method, headers, body });
}

/** Convierte la respuesta de la API v1 del nodo en la respuesta que viaja en el sobre de vuelta. */
export async function responseToRoutedReply(response: Response): Promise<RoutedReply> {
  const mediaType = (response.headers.get('Content-Type') ?? '').split(';')[0]?.trim() ?? '';
  const bytes = new Uint8Array(await response.arrayBuffer());
  let body: RoutedBody;
  if (bytes.length === 0) body = { kind: 'none' };
  else if (mediaType === 'application/json') {
    body = { kind: 'json', value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } else
    body = {
      kind: 'binary',
      mediaType: mediaType || 'application/octet-stream',
      data: toBase64Url(bytes),
    };
  return { v: 1, status: response.status, body };
}

/** Cómo llegó una petición de red al nodo. */
export interface RoutedDelivery {
  /**
   * `true` si el enrutador la entrega desde su cola (o con permiso de encolarla): la prueba de
   * trabajo la cobró el enrutador con su propio reto, no el nodo.
   */
  deferred: boolean;
}

/** Maneja una petición de red ya abierta y devuelve la respuesta del nodo. */
export type RoutedOperationHandler = (
  request: RoutedRequest,
  delivery: RoutedDelivery,
) => Promise<RoutedReply>;

/** Opciones del buzón de red del nodo. */
export interface NodeInboxOptions {
  /** Llave privada X25519 del nodo (la pública es `boxPublicKey` en el directorio). */
  nodeBoxPrivateKey: Uint8Array;
  handle: RoutedOperationHandler;
  /**
   * Secreto compartido con el enrutador. Si se da, el buzón solo acepta sobres con su etiqueta
   * HMAC (`RELAY_AUTH_HEADER`): nadie puede entregarle sobres sin pasar por el enrutador.
   */
  relaySecret?: Uint8Array;
  /** Identificador de este nodo: un sobre dirigido a otro nodo se rechaza. */
  nodeId?: string;
  /**
   * Indica si la autoridad destino (que viaja cifrada dentro del sobre) está alojada y vigente en
   * este nodo. Si se da y devuelve `false`, el sobre se rechaza como uno que no abre.
   */
  hostsAuthority?: (authorityId: string) => boolean;
  /**
   * Admite o no una entrega diferida más (por ejemplo, un tope por hora). Si devuelve `false`, el
   * buzón responde `503` sin abrir la operación y el enrutador la deja en su cola para después.
   * Sin esta opción se admiten todas.
   */
  admitDeferred?: () => boolean;
  /**
   * Si se acepta todavía la etiqueta HMAC v1, sin frescura (`true` por omisión, para la
   * transición). Con `false` solo vale la v2, con marca de tiempo y nonce (H13).
   */
  allowLegacyRelayAuth?: boolean;
  /** Reloj en milisegundos para la frescura de la etiqueta v2 (por omisión, el real). */
  now?: () => number;
}

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
} as const;

function inboxError(): Response {
  return new Response(
    JSON.stringify({ error: { code: 'bad_request', message: API_ERROR_MESSAGES.bad_request } }),
    { status: 400, headers: JSON_HEADERS },
  );
}

/** El nodo no puede atender la entrega diferida ahora: el enrutador la reintentará. */
function inboxBusy(): Response {
  return new Response(
    JSON.stringify({ error: { code: 'rate_limited', message: API_ERROR_MESSAGES.rate_limited } }),
    { status: 503, headers: JSON_HEADERS },
  );
}

/**
 * Indica si la combinación de entrega y operación es válida: una entrega diferida solo puede ser
 * una denuncia con folio elegido por el navegador, y un folio elegido solo viaja en una denuncia.
 */
function isAllowedRouting(routed: RoutedRequest, deferred: boolean): boolean {
  if (routed.folio !== undefined && routed.operationId !== 'submitComplaint') return false;
  return !deferred || (routed.operationId === 'submitComplaint' && routed.folio !== undefined);
}

/**
 * Crea el manejador del buzón de red (`POST NETWORK_ROUTES.nodeInbox`) con la API Fetch estándar:
 * abre el sobre, comprueba que la autoridad interna esté alojada en el nodo, entrega la operación
 * a `handle` y cifra la respuesta hacia la llave efímera del navegador. Un sobre que no abre, de
 * otro nodo o hacia una autoridad que el nodo no aloja responde `400 bad_request` sin decir por qué.
 * Entrega diferida (`deferral` en el sobre): solo se acepta si el buzón exige la etiqueta HMAC del
 * enrutador, porque el nodo confía en que el enrutador cobró la prueba de trabajo; y si la operación
 * falla del lado del nodo (estatus 5xx) responde `503` para que el enrutador la reintente en lugar
 * de darla por entregada.
 * Seguridad: el nodo no recibe ninguna cabecera de la persona; si `handle` falla, la respuesta
 * cifrada es un `500 internal` sin detalles.
 */
export function createNodeInboxHandler(
  options: NodeInboxOptions,
): (request: Request) => Promise<Response> {
  const nonces = createRelayNonceCache();
  const allowLegacy = options.allowLegacyRelayAuth ?? true;
  const now = options.now ?? (() => Date.now());
  return async (request) => {
    const mediaType = (request.headers.get('Content-Type') ?? '').split(';')[0]?.trim();
    if (request.method !== 'POST' || mediaType !== 'application/json') return inboxError();
    let routed: RoutedRequest;
    let deferred: boolean;
    try {
      const text = await request.text();
      const secret = options.relaySecret;
      if (
        secret !== undefined &&
        !verifyRelayAuthHeader(secret, text, request.headers.get(RELAY_AUTH_HEADER) ?? undefined, {
          now: now(),
          nonces,
          allowLegacy,
        })
      ) {
        return inboxError();
      }
      const raw: unknown = JSON.parse(text);
      deferred = RelayRequestSchema.safeParse(raw).data?.deferral !== undefined;
      // Seguridad: sin la etiqueta del enrutador nadie puede saltarse la prueba de trabajo del nodo.
      if (deferred && secret === undefined) return inboxError();
      routed = await openRoutedRequest(
        raw,
        options.nodeBoxPrivateKey,
        options.nodeId === undefined ? {} : { nodeId: options.nodeId },
      );
      // Seguridad: el enrutador ya no ve la autoridad; el nodo la entrega solo si la aloja.
      if (options.hostsAuthority !== undefined && !options.hostsAuthority(routed.to)) {
        return inboxError();
      }
      if (!isAllowedRouting(routed, deferred)) return inboxError();
    } catch {
      return inboxError();
    }
    if (deferred && options.admitDeferred !== undefined && !options.admitDeferred()) {
      return inboxBusy();
    }
    let reply: RoutedReply;
    try {
      reply = await options.handle(routed, { deferred });
    } catch {
      reply = {
        v: 1,
        status: 500,
        body: {
          kind: 'json',
          value: { error: { code: 'internal', message: API_ERROR_MESSAGES.internal } },
        },
      };
    }
    // Una entrega diferida que falló del lado del nodo se queda en la cola del enrutador.
    if (deferred && reply.status >= 500) return inboxBusy();
    const sealed = await sealRoutedReply(reply, routed);
    return new Response(JSON.stringify(sealed), { status: 200, headers: JSON_HEADERS });
  };
}
