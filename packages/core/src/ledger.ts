// Bitácora de solo agregar: eventos encadenados por hash y cabeza firmada por el servidor.
import { ed25519 } from '@noble/curves/ed25519.js';
import {
  FolioSchema,
  LEDGER_GENESIS_HASH,
  LedgerEventSchema,
  SignedLedgerHeadSchema,
} from '@sigilo/contracts';
import type { LedgerEvent, LedgerEventType, SignedLedgerHead } from '@sigilo/contracts';
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
}

/** Motivo de ruptura de la cadena. */
export type ChainFailureReason = 'malformed' | 'sequence' | 'link' | 'hash';

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

/** SHA-256 de la forma canónica del evento sin el campo `hash` (se ignora si viene). */
export function computeEventHash(event: Omit<LedgerEvent, 'hash'>): string {
  const { seq, type, folioDigest: digest, at, actorRole, payloadDigest, prevHash } = event;
  return sha256Hex(
    canonicalize({ seq, type, folioDigest: digest, at, actorRole, payloadDigest, prevHash }),
  );
}

/**
 * Construye el evento que sigue a `previous` (o el primero si es `null`).
 * Lanza error si algún campo resultante no cumple el esquema.
 */
export function buildEvent(previous: LedgerEvent | null, input: LedgerEventInput): LedgerEvent {
  const unhashed = {
    seq: previous === null ? 0 : previous.seq + 1,
    type: input.type,
    folioDigest: folioDigest(input.folio),
    at: input.at,
    actorRole: input.actorRole,
    payloadDigest: sha256Hex(canonicalize(input.payload)),
    prevHash: previous === null ? LEDGER_GENESIS_HASH : previous.hash,
  };
  return LedgerEventSchema.parse({ ...unhashed, hash: computeEventHash(unhashed) });
}

/**
 * Verifica secuencia, enlaces y hashes de `events`. Por omisión la cadena debe empezar en el
 * génesis; con `previous` se verifica un tramo que continúa a ese evento ya confiable.
 */
export function verifyChain(
  events: readonly LedgerEvent[],
  previous: LedgerEvent | null = null,
): ChainVerification {
  let expectedSeq = previous === null ? 0 : previous.seq + 1;
  let expectedPrevHash = previous === null ? LEDGER_GENESIS_HASH : previous.hash;
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
    expectedSeq += 1;
    expectedPrevHash = event.hash;
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
