// Bitácora de solo agregar: eventos encadenados por hash y cabeza firmada por el servidor.
import { ed25519 } from '@noble/curves/ed25519.js';
import {
  Base64UrlSchema,
  DayDateSchema,
  FolioSchema,
  LEDGER_GENESIS_HASH,
  LedgerEventSchema,
  SignedLedgerHeadSchema,
} from '@sigilo/contracts';
import type {
  IdentityAccessEntry,
  LedgerAnchor,
  LedgerEvent,
  LedgerEventType,
  SignedLedgerHead,
  SignedReceipt,
} from '@sigilo/contracts';
import { canonicalize, sha256Hex } from './canonical-json.ts';
import { fromBase64Url, toBase64Url, utf8Encode } from './encoding.ts';
import { keyIdFor } from './keys.ts';
import { sign, verify } from './signing.ts';

/** Datos para crear un evento nuevo; el resto de campos se calcula. */
export interface LedgerEventInput {
  type: LedgerEventType;
  folio: string;
  at: string;
  actorRole: LedgerEvent['actorRole'];
  payload: unknown;
  /** Solo en `identity.opened`: `receiptTagFor(authVerifier)`, que también va en `payload`. */
  receiptTag?: string;
}

/**
 * Evento registrado pero todavía sin lugar en la cadena: aún no tiene `seq`, `prevHash` ni
 * `hash`. Se encadena al cerrar su día (`chainEvent`).
 */
export type PendingLedgerEvent = Omit<LedgerEvent, 'seq' | 'prevHash' | 'hash'>;

/**
 * Motivo de ruptura de la cadena. `date`: la fecha de un evento es anterior a la del evento previo
 * (cada día se encadena completo y en orden, así que `at` nunca retrocede).
 */
export type ChainFailureReason = 'malformed' | 'sequence' | 'link' | 'hash' | 'date';

/** Resultado de verificar una cadena de eventos. */
export type ChainVerification =
  { valid: true } | { valid: false; failedAtSeq: number; reason: ChainFailureReason };

/** Cabeza de la bitácora antes de firmarse. */
export type UnsignedLedgerHead = Omit<SignedLedgerHead, 'signature'>;

/**
 * Digesto del folio para la bitácora pública.
 * Seguridad: el folio nunca se publica; con 60 bits aleatorios el digesto no es reversible por fuerza bruta.
 */
export function folioDigest(folio: string): string {
  return sha256Hex(`sigilo/ledger/folio:${FolioSchema.parse(folio)}`);
}

/**
 * Etiqueta pública de las aperturas de identidad ligadas a un recibo:
 * `sha256Hex("sigilo/ledger/receipt:" + authVerifier)`.
 * Seguridad: no revela el `authVerifier` (que a su vez es un digesto de `authKey`), pero la
 * persona denunciante la recalcula desde su recibo y busca sus aperturas en toda la bitácora.
 */
export function receiptTagFor(authVerifier: string): string {
  return sha256Hex(`sigilo/ledger/receipt:${Base64UrlSchema.parse(authVerifier)}`);
}

/** SHA-256 de la forma canónica del evento sin el campo `hash` (se ignora si viene). */
export function computeEventHash(event: Omit<LedgerEvent, 'hash'>): string {
  const {
    seq,
    type,
    folioDigest: digest,
    at,
    actorRole,
    payloadDigest,
    receiptTag,
    prevHash,
  } = event;
  // `receiptTag` solo existe en `identity.opened`; `canonicalize` omite el campo si no viene.
  return sha256Hex(
    canonicalize({
      seq,
      type,
      folioDigest: digest,
      at,
      actorRole,
      payloadDigest,
      receiptTag,
      prevHash,
    }),
  );
}

/**
 * Calcula la parte pública de un evento que todavía no se encadena: digesto del folio, digesto
 * de los datos y, en `identity.opened`, la etiqueta del recibo.
 * Lanza error si el folio, la fecha o los datos no son válidos.
 */
export function pendingEventFor(input: LedgerEventInput): PendingLedgerEvent {
  const pending: PendingLedgerEvent = {
    type: input.type,
    folioDigest: folioDigest(input.folio),
    at: DayDateSchema.parse(input.at),
    actorRole: input.actorRole,
    payloadDigest: sha256Hex(canonicalize(input.payload)),
    ...(input.receiptTag === undefined ? {} : { receiptTag: input.receiptTag }),
  };
  return pending;
}

/**
 * Encadena un evento pendiente después de `previous` (o como el primero si es `null`).
 * Lanza error si el evento resultante no cumple el esquema o si su fecha es anterior a la de
 * `previous` (la cadena exige fechas no decrecientes, ver `verifyChain`).
 */
export function chainEvent(previous: LedgerEvent | null, pending: PendingLedgerEvent): LedgerEvent {
  if (previous !== null && pending.at < previous.at) {
    throw new Error('La fecha del evento es anterior a la del último evento encadenado.');
  }
  const unhashed = {
    seq: previous === null ? 0 : previous.seq + 1,
    type: pending.type,
    folioDigest: pending.folioDigest,
    at: pending.at,
    actorRole: pending.actorRole,
    payloadDigest: pending.payloadDigest,
    ...(pending.receiptTag === undefined ? {} : { receiptTag: pending.receiptTag }),
    prevHash: previous === null ? LEDGER_GENESIS_HASH : previous.hash,
  };
  return LedgerEventSchema.parse({ ...unhashed, hash: computeEventHash(unhashed) });
}

/**
 * Construye el evento que sigue a `previous` (o el primero si es `null`) a partir de sus datos.
 * Lanza error si algún campo resultante no cumple el esquema.
 */
export function buildEvent(previous: LedgerEvent | null, input: LedgerEventInput): LedgerEvent {
  return chainEvent(previous, pendingEventFor(input));
}

/**
 * Verifica secuencia, enlaces, hashes y fechas no decrecientes de `events`. Por omisión la cadena
 * debe empezar en el génesis; con `previous` se verifica un tramo que continúa a ese evento ya
 * confiable (y cuya fecha es la mínima del tramo).
 * Seguridad: las fechas no decrecientes permiten a un cliente acotar dónde empieza un día y
 * descargar solo desde ahí (ver `verifyEventInChain` y el seguimiento de aperturas).
 */
export function verifyChain(
  events: readonly LedgerEvent[],
  previous: LedgerEvent | null = null,
): ChainVerification {
  let expectedSeq = previous === null ? 0 : previous.seq + 1;
  let expectedPrevHash = previous === null ? LEDGER_GENESIS_HASH : previous.hash;
  let minimumAt = previous === null ? '' : previous.at;
  for (const candidate of events) {
    const parsed = LedgerEventSchema.safeParse(candidate);
    if (!parsed.success) return { valid: false, failedAtSeq: expectedSeq, reason: 'malformed' };
    const event = parsed.data;
    if (event.seq !== expectedSeq) {
      return { valid: false, failedAtSeq: expectedSeq, reason: 'sequence' };
    }
    if (event.prevHash !== expectedPrevHash) {
      return { valid: false, failedAtSeq: expectedSeq, reason: 'link' };
    }
    if (event.hash !== computeEventHash(event)) {
      return { valid: false, failedAtSeq: expectedSeq, reason: 'hash' };
    }
    if (event.at < minimumAt) return { valid: false, failedAtSeq: expectedSeq, reason: 'date' };
    expectedSeq += 1;
    expectedPrevHash = event.hash;
    minimumAt = event.at;
  }
  return { valid: true };
}

function headMessage(head: UnsignedLedgerHead): Uint8Array {
  const { seq, hash, at, serverKeyId } = head;
  return utf8Encode(canonicalize({ seq, hash, at, serverKeyId }));
}

/**
 * Firma la cabeza de la bitácora con la llave Ed25519 del servidor.
 * Lanza error si la cabeza es inválida o `serverKeyId` no corresponde a la llave.
 */
export function signLedgerHead(head: UnsignedLedgerHead, privateKey: Uint8Array): SignedLedgerHead {
  const parsed = SignedLedgerHeadSchema.omit({ signature: true }).parse(head);
  if (parsed.serverKeyId !== keyIdFor(ed25519.getPublicKey(privateKey))) {
    throw new Error('El identificador de llave no corresponde a la llave del servidor.');
  }
  return { ...parsed, signature: toBase64Url(sign(headMessage(parsed), privateKey)) };
}

/** Indica si la cabeza es válida y está firmada por la llave pública dada (con su `keyId`). */
export function verifyLedgerHead(head: SignedLedgerHead, publicKey: Uint8Array): boolean {
  const parsed = SignedLedgerHeadSchema.safeParse(head);
  if (!parsed.success || parsed.data.serverKeyId !== keyIdFor(publicKey)) return false;
  try {
    return verify(fromBase64Url(parsed.data.signature), headMessage(parsed.data), publicKey);
  } catch {
    return false;
  }
}

/** Motivo por el que un evento no queda probado dentro de la cadena publicada. */
export type EventInChainFailure = 'head-signature' | 'event' | 'chain' | 'head-mismatch' | 'anchor';

/** Resultado de `verifyEventInChain`. */
export type EventInChainVerification =
  { valid: true } | { valid: false; reason: EventInChainFailure };

/** Opciones de `verifyEventInChain`. */
export interface EventInChainOptions {
  /**
   * Anclajes conocidos (configurados o pegados). Los que caen dentro del tramo deben coincidir con
   * su evento; uno posterior a la cabeza indica que la bitácora retrocedió. Los anteriores al
   * evento no se pueden comparar con este tramo y se ignoran.
   */
  anchors?: readonly LedgerAnchor[];
}

/**
 * Prueba que `event` pertenece a la bitácora cuya cabeza firmada es `head`: `chain` debe ser el
 * tramo completo desde ese evento (idéntico, en la primera posición) hasta la cabeza, con hashes,
 * enlaces, secuencia y fechas válidos, y su último eslabón debe ser exactamente el de la cabeza,
 * firmada con `serverPublicKey`.
 * Seguridad: un evento con un hash coherente consigo mismo no prueba nada; solo el encadenamiento
 * hasta la cabeza firmada lo liga a la bitácora que ven todos (y a los anclajes publicados).
 */
export function verifyEventInChain(
  event: LedgerEvent,
  chain: readonly LedgerEvent[],
  head: SignedLedgerHead,
  serverPublicKey: Uint8Array,
  options: EventInChainOptions = {},
): EventInChainVerification {
  if (!verifyLedgerHead(head, serverPublicKey)) return { valid: false, reason: 'head-signature' };
  const first = chain[0];
  const isSameEvent =
    first !== undefined &&
    LedgerEventSchema.safeParse(first).success &&
    canonicalize(first) === canonicalize(event) &&
    first.hash === computeEventHash(first);
  if (first === undefined || !isSameEvent) return { valid: false, reason: 'event' };
  if (!verifyChain(chain.slice(1), first).valid) return { valid: false, reason: 'chain' };
  const last = chain.at(-1) ?? first;
  if (last.seq !== head.seq || last.hash !== head.hash) {
    return { valid: false, reason: 'head-mismatch' };
  }
  for (const anchor of options.anchors ?? []) {
    if (!verifyLedgerHead(anchor.head, serverPublicKey)) return { valid: false, reason: 'anchor' };
    if (anchor.head.hash === LEDGER_GENESIS_HASH || anchor.head.seq < first.seq) continue;
    const anchored = chain[anchor.head.seq - first.seq];
    if (anchored === undefined || anchored.hash !== anchor.head.hash) {
      return { valid: false, reason: 'anchor' };
    }
  }
  return { valid: true };
}

/**
 * `payloadDigest` del evento `complaint.received`:
 * `sha256Hex(canonicalize({ folio, submissionDigest }))`.
 */
export function receivedPayloadDigest(folio: string, submissionDigest: string): string {
  return sha256Hex(canonicalize({ folio, submissionDigest }));
}

/**
 * Indica si `event` es el `complaint.received` que corresponde al comprobante: misma fecha,
 * `folioDigest` del folio y `payloadDigest` firmado en el comprobante (que debe ser el del digesto
 * de la solicitud), con su hash recalculado. Junto con la verificación de la cadena, prueba que la
 * denuncia quedó registrada en la bitácora pública. No compara la secuencia: el comprobante no la
 * conoce, porque el evento se encadena hasta que cierra su día.
 */
export function verifyReceiptEvent(event: LedgerEvent, receipt: SignedReceipt): boolean {
  try {
    return (
      LedgerEventSchema.safeParse(event).success &&
      event.type === 'complaint.received' &&
      event.actorRole === 'system' &&
      event.at === receipt.receivedOn &&
      event.folioDigest === folioDigest(receipt.folio) &&
      event.payloadDigest === receipt.payloadDigest &&
      event.payloadDigest === receivedPayloadDigest(receipt.folio, receipt.submissionDigest) &&
      event.hash === computeEventHash(event)
    );
  } catch {
    return false;
  }
}

/** Datos de una apertura de identidad con los que se calcula su evento `identity.opened`. */
export interface IdentityOpening {
  folio: string;
  /** Identificador aleatorio de la apertura (`OpeningIdSchema`). */
  openingId: string;
  legalBasis: string;
  /** `authVerifier` de la denuncia: de él sale `receiptTag`. */
  authVerifier: string;
}

/**
 * Datos del evento `identity.opened`: `{ folio, openingId, legalBasis, receiptTag }`.
 * Lanza error si el `authVerifier` no es Base64URL.
 */
export function identityOpenedPayload(opening: IdentityOpening): {
  folio: string;
  openingId: string;
  legalBasis: string;
  receiptTag: string;
} {
  return {
    folio: opening.folio,
    openingId: opening.openingId,
    legalBasis: opening.legalBasis,
    receiptTag: receiptTagFor(opening.authVerifier),
  };
}

/** `payloadDigest` del evento `identity.opened` de una apertura. */
export function identityOpenedPayloadDigest(opening: IdentityOpening): string {
  return sha256Hex(canonicalize(identityOpenedPayload(opening)));
}

/** Resultado de contrastar las aperturas publicadas con las que muestra el seguimiento. */
export interface IdentityOpeningsReconciliation {
  /**
   * Aperturas publicadas con la etiqueta del recibo que no corresponden a ninguna del
   * seguimiento (otro folio, otro fundamento u otra fecha): el servidor las ocultó.
   */
  unlisted: LedgerEvent[];
  /**
   * Aperturas del seguimiento cuyo día ya se publicó (`on` <= `publishedThrough`) pero que no
   * aparecen en la bitácora pública.
   */
  unpublished: IdentityAccessEntry[];
}

/**
 * Contrasta los eventos publicados (de toda la bitácora, sin filtrar por folio) con las aperturas
 * que entrega el seguimiento. `publishedThrough` es la fecha del último evento publicado (la de la
 * cabeza firmada) o `null` si todavía no hay ninguno: cada día se publica completo, así que toda
 * apertura de un día anterior o igual ya debe aparecer.
 * Seguridad: como `receiptTag` depende del recibo y no del folio, una apertura registrada con
 * otro folio también aparece aquí y se reporta en `unlisted`.
 */
export function reconcileIdentityOpenings(
  events: readonly LedgerEvent[],
  entries: readonly IdentityAccessEntry[],
  context: { folio: string; authVerifier: string; publishedThrough: string | null },
): IdentityOpeningsReconciliation {
  const tag = receiptTagFor(context.authVerifier);
  const expected = new Map(
    entries.map((entry) => [
      identityOpenedPayloadDigest({
        folio: context.folio,
        openingId: entry.openingId,
        legalBasis: entry.legalBasis,
        authVerifier: context.authVerifier,
      }),
      entry,
    ]),
  );
  const ownDigest = folioDigest(context.folio);
  const found = new Set<string>();
  const unlisted: LedgerEvent[] = [];
  for (const event of events) {
    if (event.type !== 'identity.opened' || event.receiptTag !== tag) continue;
    const entry = expected.get(event.payloadDigest);
    const isMatch =
      entry !== undefined &&
      event.folioDigest === ownDigest &&
      event.at === entry.on &&
      event.actorRole === 'authority';
    if (isMatch) found.add(event.payloadDigest);
    else unlisted.push(event);
  }
  const { publishedThrough } = context;
  const unpublished =
    publishedThrough === null
      ? []
      : [...expected].flatMap(([digest, entry]) =>
          entry.on <= publishedThrough && !found.has(digest) ? [entry] : [],
        );
  return { unlisted, unpublished };
}
