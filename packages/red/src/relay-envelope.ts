// Sobres del enrutador ciego, al estilo de Oblivious HTTP (RFC 9458) con el HPKE de SIGILO: el
// navegador cifra la petición hacia la llave del nodo y el nodo responde hacia una llave efímera.
// Formato v2: el encabezado externo nombra solo el nodo destino; la autoridad va cifrada adentro.
import {
  HPKE_SUITE_V1,
  RELAY_ENVELOPE_VERSION,
  RELAY_PLAINTEXT_BUCKETS,
  RelayRequestSchema,
  RelayResponseSchema,
  RoutedReplySchema,
  RoutedRequestSchema,
} from '@sigilo/contracts';
import type {
  DirectoryNode,
  HpkeEnvelope,
  RelayRequest,
  RelayResponse,
  RoutedReply,
  RoutedRequest,
} from '@sigilo/contracts';
import {
  envelopePlaintextLength,
  fromBase64Url,
  generateBoxKeyPair,
  keyIdFor,
  openEnvelope,
  padToBlock,
  randomBytes,
  sealToPublicKey,
  toBase64Url,
  unpad,
  utf8Decode,
  utf8Encode,
} from '@sigilo/core';

const REQUEST_AAD_PREFIX = 'sigilo/red/relay/request/v2:';
const REPLY_AAD_PREFIX = 'sigilo/red/relay/reply/v1:';
const LENGTH_PREFIX_BYTES = 4;
const AEAD_TAG_LENGTH = 16;
const ENCAPSULATED_KEY_LENGTH = 32;

/** Tramo más pequeño en el que cabe `length` bytes más el prefijo de longitud del relleno. */
export function relayBucketFor(length: number): number {
  const bucket = RELAY_PLAINTEXT_BUCKETS.find((size) => size >= length + LENGTH_PREFIX_BYTES);
  if (bucket === undefined) throw new Error('El contenido excede el tamaño máximo de la red.');
  return bucket;
}

/** Indica si el texto en claro de un sobre mide exactamente uno de los tramos permitidos. */
export function hasRelayBucketSize(envelope: HpkeEnvelope): boolean {
  const length = envelopePlaintextLength(envelope);
  return length !== null && RELAY_PLAINTEXT_BUCKETS.includes(length);
}

function padJson(value: unknown): Uint8Array {
  const bytes = utf8Encode(JSON.stringify(value));
  return padToBlock(bytes, relayBucketFor(bytes.length));
}

function requestAad(nodeId: string): Uint8Array {
  return utf8Encode(`${REQUEST_AAD_PREFIX}${nodeId}`);
}

function replyAad(to: string): Uint8Array {
  return utf8Encode(`${REPLY_AAD_PREFIX}${to}`);
}

/** Petición que arma el navegador, sin la llave de respuesta (se genera aquí). */
export type RoutedRequestInput = Omit<RoutedRequest, 'v' | 'replyPublicKey'>;

/** Sobre listo para el enrutador y la llave privada efímera para abrir la respuesta. */
export interface SealedRelayRequest {
  relay: RelayRequest;
  replyPrivateKey: Uint8Array;
}

/**
 * Indica si el valor parece un sobre de red v1 (con `to` en el encabezado externo), para
 * rechazarlo con `RELAY_V1_REJECTION_MESSAGE` en lugar de un error genérico.
 */
export function isLegacyRelayRequest(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'v' in value &&
    (value as { v: unknown }).v === 1 &&
    'to' in value
  );
}

/**
 * Cifra la petición hacia la llave del nodo que aloja a la autoridad destino, rellenada al tramo
 * más pequeño en que cabe. El encabezado externo lleva solo el nodo; la autoridad va adentro.
 * El AAD liga el sobre al nodo: el enrutador no puede desviarlo a otro nodo sin que lo note.
 * Lanza error si la petición no cumple su esquema o excede el tramo mayor.
 */
export async function sealRoutedRequest(
  input: RoutedRequestInput,
  node: Pick<DirectoryNode, 'id' | 'boxKeyId' | 'boxPublicKey'>,
): Promise<SealedRelayRequest> {
  const reply = generateBoxKeyPair();
  const request = RoutedRequestSchema.parse({
    ...input,
    v: RELAY_ENVELOPE_VERSION,
    replyPublicKey: toBase64Url(reply.publicKey),
  });
  const sealed = await sealToPublicKey(
    padJson(request),
    { keyId: node.boxKeyId, publicKey: fromBase64Url(node.boxPublicKey) },
    requestAad(node.id),
  );
  return {
    relay: { v: RELAY_ENVELOPE_VERSION, node: node.id, sealed },
    replyPrivateKey: reply.privateKey,
  };
}

/** Opciones al abrir un sobre en el nodo. */
export interface OpenRoutedRequestOptions {
  /** Identificador de este nodo: un sobre con otro nodo en el encabezado no abre. */
  nodeId?: string;
}

/**
 * Abre en el nodo un sobre de red. Lanza el mismo error genérico si el sobre no abre, si es de
 * otro nodo, si es v1 o si su contenido no cumple el esquema.
 */
export async function openRoutedRequest(
  relay: unknown,
  nodeBoxPrivateKey: Uint8Array,
  options: OpenRoutedRequestOptions = {},
): Promise<RoutedRequest> {
  try {
    const outer = RelayRequestSchema.parse(relay);
    if (options.nodeId !== undefined && outer.node !== options.nodeId) throw new Error('nodo');
    if (!hasRelayBucketSize(outer.sealed)) throw new Error('tramo');
    const padded = await openEnvelope(outer.sealed, nodeBoxPrivateKey, requestAad(outer.node));
    return RoutedRequestSchema.parse(JSON.parse(utf8Decode(unpad(padded))));
  } catch {
    throw new Error('No se pudo abrir el sobre de red.');
  }
}

/** Cifra la respuesta del nodo hacia la llave efímera de la petición, rellenada a su tramo. */
export async function sealRoutedReply(
  reply: RoutedReply,
  request: RoutedRequest,
): Promise<RelayResponse> {
  const parsed = RoutedReplySchema.parse(reply);
  const publicKey = fromBase64Url(request.replyPublicKey);
  const sealed = await sealToPublicKey(
    padJson(parsed),
    { keyId: keyIdFor(publicKey), publicKey },
    replyAad(request.to),
  );
  return { v: RELAY_ENVELOPE_VERSION, sealed, queued: null };
}

/**
 * Abre en el navegador la respuesta del nodo. Lanza un error genérico si no abre: también es lo
 * que ocurre cuando el enrutador no pudo entregar el sobre y respondió con relleno.
 */
export async function openRoutedReply(
  response: unknown,
  replyPrivateKey: Uint8Array,
  to: string,
): Promise<RoutedReply> {
  try {
    const parsed = RelayResponseSchema.parse(response);
    const padded = await openEnvelope(parsed.sealed, replyPrivateKey, replyAad(to));
    return RoutedReplySchema.parse(JSON.parse(utf8Decode(unpad(padded))));
  } catch {
    throw new Error('No se pudo entregar o abrir la respuesta; intenta de nuevo.');
  }
}

/**
 * Respuesta de relleno que da el enrutador cuando no pudo entregar: misma forma y mismo tamaño que
 * una respuesta real del tramo más pequeño, con bytes aleatorios.
 * Seguridad: así la respuesta no revela si el nodo de destino estaba disponible.
 */
export function relayDecoyResponse(keyId: string): RelayResponse {
  const bucket = RELAY_PLAINTEXT_BUCKETS[0] ?? 4096;
  return {
    v: RELAY_ENVELOPE_VERSION,
    sealed: {
      v: 1,
      suite: HPKE_SUITE_V1,
      keyId,
      enc: toBase64Url(randomBytes(ENCAPSULATED_KEY_LENGTH)),
      ct: toBase64Url(randomBytes(bucket + AEAD_TAG_LENGTH)),
    },
    queued: null,
  };
}
