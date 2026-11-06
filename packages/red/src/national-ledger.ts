// Bitácora nacional: encadena las cabezas firmadas de cada nodo y las versiones del directorio, y
// publica una cabeza firmada por la operación que vale solo con m de n cofirmas de testigos.
import {
  CosignedNationalHeadSchema,
  LEDGER_GENESIS_HASH,
  NationalHeadSchema,
  NationalInclusionProofSchema,
  NationalLedgerEntrySchema,
  SignedLedgerHeadSchema,
} from '@sigilo/contracts';
import type {
  AuthorityDirectory,
  CosignedNationalHead,
  DirectoryNode,
  NationalHead,
  NationalLedgerEntry,
  NetworkTrustAnchor,
  SignedAuthorityDirectory,
  SignedLedgerHead,
  WitnessSignature,
} from '@sigilo/contracts';
import { canonicalize, fromBase64Url, keyIdFor, sha256Hex, verifyLedgerHead } from '@sigilo/core';
import { directoryDigest, findNode } from './directory.ts';
import {
  signWithDomain,
  signingPublicKeyOf,
  validWitnesses,
  verifyWithDomain,
} from './signatures.ts';

/** `prevHash` de la primera entrada: 64 ceros. */
export const NATIONAL_GENESIS_HASH = '0'.repeat(64);
/** Dominio de la firma de la operación sobre la cabeza nacional. */
export const NATIONAL_HEAD_OPERATOR_DOMAIN = 'sigilo/red/national-head/operator/v1:';
/** Dominio de la cofirma de un testigo sobre la cabeza nacional. */
export const NATIONAL_HEAD_WITNESS_DOMAIN = 'sigilo/red/national-head/witness/v1:';

/** Entrada antes de calcular su hash. */
export type UnhashedNationalEntry = NationalLedgerEntry extends infer Entry
  ? Entry extends unknown
    ? Omit<Entry, 'hash'>
    : never
  : never;

/** SHA-256 de la forma canónica de la entrada sin el campo `hash` (se ignora si viene). */
export function computeNationalEntryHash(
  entry: UnhashedNationalEntry | NationalLedgerEntry,
): string {
  const rest: Record<string, unknown> = { ...entry };
  delete rest.hash;
  return sha256Hex(canonicalize(rest));
}

function link(previous: NationalLedgerEntry | null): { seq: number; prevHash: string } {
  return previous === null
    ? { seq: 0, prevHash: NATIONAL_GENESIS_HASH }
    : { seq: previous.seq + 1, prevHash: previous.hash };
}

function finish(unhashed: UnhashedNationalEntry): NationalLedgerEntry {
  return NationalLedgerEntrySchema.parse({ ...unhashed, hash: computeNationalEntryHash(unhashed) });
}

/**
 * Entrada con la cabeza firmada de un nodo, después de `previous`.
 * Lanza error si la fecha retrocede o la cabeza no cumple su esquema.
 */
export function buildNodeHeadEntry(
  previous: NationalLedgerEntry | null,
  nodeId: string,
  nodeHead: SignedLedgerHead,
  at: string,
): NationalLedgerEntry {
  if (previous !== null && at < previous.at) throw new Error('La fecha retrocede.');
  return finish({
    v: 1,
    ...link(previous),
    type: 'node.head',
    at,
    nodeId,
    nodeHead: SignedLedgerHeadSchema.parse(nodeHead),
  });
}

/** Entrada con una versión del directorio, después de `previous`. */
export function buildDirectoryEntry(
  previous: NationalLedgerEntry | null,
  signed: SignedAuthorityDirectory,
  at: string,
): NationalLedgerEntry {
  if (previous !== null && at < previous.at) throw new Error('La fecha retrocede.');
  return finish({
    v: 1,
    ...link(previous),
    type: 'directory.version',
    at,
    directorySerial: signed.directory.serial,
    directoryDigest: directoryDigest(signed.directory),
  });
}

/** Resultado de verificar un tramo de la bitácora nacional. */
export type NationalChainVerification =
  | { valid: true }
  | {
      valid: false;
      failedAtSeq: number;
      reason: 'malformed' | 'sequence' | 'link' | 'hash' | 'date';
    };

/**
 * Verifica secuencia, enlaces, hashes y fechas no decrecientes, desde el génesis o desde
 * `previous`, una entrada ya confiable.
 */
export function verifyNationalChain(
  entries: readonly unknown[],
  previous: NationalLedgerEntry | null = null,
): NationalChainVerification {
  let expected = link(previous);
  let minimumAt = previous?.at ?? '';
  for (const candidate of entries) {
    const parsed = NationalLedgerEntrySchema.safeParse(candidate);
    if (!parsed.success) return { valid: false, failedAtSeq: expected.seq, reason: 'malformed' };
    const entry = parsed.data;
    if (entry.seq !== expected.seq) {
      return { valid: false, failedAtSeq: expected.seq, reason: 'sequence' };
    }
    if (entry.prevHash !== expected.prevHash) {
      return { valid: false, failedAtSeq: expected.seq, reason: 'link' };
    }
    if (entry.hash !== computeNationalEntryHash(entry)) {
      return { valid: false, failedAtSeq: expected.seq, reason: 'hash' };
    }
    if (entry.at < minimumAt) return { valid: false, failedAtSeq: expected.seq, reason: 'date' };
    expected = link(entry);
    minimumAt = entry.at;
  }
  return { valid: true };
}

function headText(head: NationalHead): string {
  return canonicalize(NationalHeadSchema.parse(head));
}

/**
 * Firma la cabeza nacional con la llave de la operación; las cofirmas empiezan vacías.
 * Lanza error si `operatorKeyId` no corresponde a la llave.
 */
export function signNationalHead(
  head: NationalHead,
  operatorPrivateKey: Uint8Array,
): CosignedNationalHead {
  const parsed = NationalHeadSchema.parse(head);
  if (keyIdFor(signingPublicKeyOf(operatorPrivateKey)) !== parsed.operatorKeyId) {
    throw new Error('La llave no es la de la operación de la cabeza.');
  }
  return {
    head: parsed,
    operatorSignature: signWithDomain(
      NATIONAL_HEAD_OPERATOR_DOMAIN,
      headText(parsed),
      operatorPrivateKey,
    ),
    cosignatures: [],
  };
}

/** Cofirma de un testigo sobre una cabeza nacional (que antes debe haber verificado). */
export function cosignNationalHead(
  head: NationalHead,
  witnessId: string,
  witnessPrivateKey: Uint8Array,
): WitnessSignature {
  return {
    witnessId,
    keyId: keyIdFor(signingPublicKeyOf(witnessPrivateKey)),
    signature: signWithDomain(NATIONAL_HEAD_WITNESS_DOMAIN, headText(head), witnessPrivateKey),
  };
}

/** Indica si una cofirma es válida para la cabeza con la raíz de confianza dada. */
export function isValidNationalCosignature(
  head: NationalHead,
  cosignature: WitnessSignature,
  trust: NetworkTrustAnchor,
): boolean {
  return (
    validWitnesses(NATIONAL_HEAD_WITNESS_DOMAIN, headText(head), [cosignature], trust).length === 1
  );
}

/** Resultado de verificar una cabeza nacional. */
export type NationalHeadVerification =
  | { valid: true; head: NationalHead; witnesses: string[] }
  | { valid: false; reason: 'malformed' | 'operator' | 'witnesses' };

/**
 * Verifica la firma de la operación y que al menos `trust.threshold` testigos fijados distintos
 * cofirmen la cabeza.
 */
export function verifyNationalHead(
  cosigned: unknown,
  trust: NetworkTrustAnchor,
): NationalHeadVerification {
  const parsed = CosignedNationalHeadSchema.safeParse(cosigned);
  if (!parsed.success) return { valid: false, reason: 'malformed' };
  const { head, operatorSignature, cosignatures } = parsed.data;
  const text = headText(head);
  const isOperator =
    head.operatorKeyId === trust.operatorKeyId &&
    verifyWithDomain(
      NATIONAL_HEAD_OPERATOR_DOMAIN,
      text,
      operatorSignature,
      trust.operatorSigningPublicKey,
    );
  if (!isOperator) return { valid: false, reason: 'operator' };
  const witnesses = validWitnesses(NATIONAL_HEAD_WITNESS_DOMAIN, text, cosignatures, trust);
  if (witnesses.length < trust.threshold) return { valid: false, reason: 'witnesses' };
  return { valid: true, head, witnesses };
}

/** Indica si la cabeza de nodo está firmada por la llave de ese nodo en el directorio. */
export function verifyNodeHeadSignature(head: SignedLedgerHead, node: DirectoryNode): boolean {
  try {
    return (
      head.serverKeyId === node.signingKeyId &&
      verifyLedgerHead(head, fromBase64Url(node.signingPublicKey))
    );
  } catch {
    return false;
  }
}

/**
 * Cómo se relaciona una cabeza de nodo nueva con la última registrada: `new` avanza, `unchanged`
 * es la misma (aunque cambie la fecha del génesis), `rollback` retrocede y `fork` repite una
 * secuencia con otro hash (prueba de una bifurcación).
 */
export function compareNodeHeads(
  previous: SignedLedgerHead | null,
  next: SignedLedgerHead,
): 'new' | 'unchanged' | 'rollback' | 'fork' {
  if (previous === null) return 'new';
  if (previous.seq === next.seq && previous.hash === next.hash) return 'unchanged';
  // Del génesis (hash de ceros, secuencia 0) se puede pasar a cualquier primer evento.
  if (previous.hash === LEDGER_GENESIS_HASH) return 'new';
  if (next.seq < previous.seq) return 'rollback';
  if (next.seq === previous.seq) return 'fork';
  return 'new';
}

/** Motivo por el que una cabeza de nodo no queda probada en la bitácora nacional. */
export type InclusionFailure = 'malformed' | 'head' | 'entry' | 'chain' | 'head-mismatch';

/**
 * Verifica que la cabeza `expected` del nodo `nodeId` está en la bitácora nacional: la prueba
 * trae la entrada exacta, el tramo sin huecos hasta la entrada de la cabeza nacional y la cabeza
 * con m cofirmas válidas.
 */
export function verifyNodeHeadInclusion(
  proof: unknown,
  trust: NetworkTrustAnchor,
  expected: { nodeId: string; seq: number; hash: string },
): { valid: true; nationalSeq: number } | { valid: false; reason: InclusionFailure } {
  const parsed = NationalInclusionProofSchema.safeParse(proof);
  if (!parsed.success) return { valid: false, reason: 'malformed' };
  const { entry, chain, head } = parsed.data;
  const headCheck = verifyNationalHead(head, trust);
  if (!headCheck.valid) return { valid: false, reason: 'head' };
  const isExpected =
    entry.type === 'node.head' &&
    entry.nodeId === expected.nodeId &&
    entry.nodeHead.seq === expected.seq &&
    entry.nodeHead.hash === expected.hash;
  const first = chain[0];
  if (!isExpected || first === undefined || canonicalize(first) !== canonicalize(entry)) {
    return { valid: false, reason: 'entry' };
  }
  if (entry.hash !== computeNationalEntryHash(entry)) return { valid: false, reason: 'entry' };
  if (!verifyNationalChain(chain.slice(1), first).valid) return { valid: false, reason: 'chain' };
  const last = chain.at(-1) ?? first;
  if (last.seq !== head.head.seq || last.hash !== head.head.hash) {
    return { valid: false, reason: 'head-mismatch' };
  }
  return { valid: true, nationalSeq: entry.seq };
}

/** Estado que conserva un testigo entre cofirmas. */
export interface WitnessState {
  /** Última entrada cubierta por una cabeza que cofirmó, o `null` si nunca cofirmó. */
  lastEntry: NationalLedgerEntry | null;
  /** Última cabeza registrada de cada nodo, para detectar retrocesos y bifurcaciones. */
  nodeHeads: Record<string, SignedLedgerHead>;
  /** Último serial de directorio registrado. */
  directorySerial: number;
}

/** Motivo por el que un testigo se niega a cofirmar. */
export type ExtensionFailure =
  | 'operator'
  | 'regression'
  | 'chain'
  | 'head-mismatch'
  | 'node-head'
  | 'node-history'
  | 'directory';

/**
 * Lo que comprueba un testigo antes de cofirmar `pending`: la firma de la operación; que la
 * bitácora solo creció desde la última cabeza que cofirmó (`entries` empieza en esa entrada, o en
 * el génesis); que cada cabeza de nodo está firmada por su nodo del directorio verificado y no
 * retrocede ni se bifurca; y que el directorio solo avanza. Devuelve el estado nuevo.
 * Seguridad: nunca cofirma lo que no recalculó; un testigo honesto basta para que una reescritura
 * no junte m cofirmas. Es la parte pura: no descarga la bitácora de cada nodo, así que por sí sola
 * no detecta una historia reescrita con secuencia mayor (H4). `runWitnessOnce` la complementa con
 * `nodeHeadTransitions` y `checkNodeHistory`; quien la use fuera de él debe hacer lo mismo.
 */
export function verifyNationalExtension(
  state: WitnessState,
  entries: readonly NationalLedgerEntry[],
  pending: CosignedNationalHead,
  directory: AuthorityDirectory,
  trust: NetworkTrustAnchor,
): { valid: true; state: WitnessState } | { valid: false; reason: ExtensionFailure } {
  const head = pending.head;
  const isOperator =
    head.operatorKeyId === trust.operatorKeyId &&
    verifyWithDomain(
      NATIONAL_HEAD_OPERATOR_DOMAIN,
      headText(head),
      pending.operatorSignature,
      trust.operatorSigningPublicKey,
    );
  if (!isOperator) return { valid: false, reason: 'operator' };
  const anchor = state.lastEntry;
  if (anchor !== null && head.seq < anchor.seq) return { valid: false, reason: 'regression' };
  let fresh: readonly NationalLedgerEntry[] = entries;
  if (anchor !== null) {
    const [first, ...rest] = entries;
    if (first === undefined || first.seq !== anchor.seq || first.hash !== anchor.hash) {
      return { valid: false, reason: 'regression' };
    }
    fresh = rest;
  }
  if (!verifyNationalChain(fresh, anchor).valid) return { valid: false, reason: 'chain' };
  const last = fresh.at(-1) ?? anchor;
  if (last === null || last.seq !== head.seq || last.hash !== head.hash) {
    return { valid: false, reason: 'head-mismatch' };
  }
  const nodeHeads = { ...state.nodeHeads };
  let directorySerial = state.directorySerial;
  for (const entry of fresh) {
    if (entry.type === 'directory.version') {
      if (entry.directorySerial <= directorySerial) return { valid: false, reason: 'directory' };
      directorySerial = entry.directorySerial;
      continue;
    }
    const node = findNode(directory, entry.nodeId);
    if (node === undefined || !verifyNodeHeadSignature(entry.nodeHead, node)) {
      return { valid: false, reason: 'node-head' };
    }
    if (compareNodeHeads(nodeHeads[entry.nodeId] ?? null, entry.nodeHead) !== 'new') {
      return { valid: false, reason: 'node-history' };
    }
    nodeHeads[entry.nodeId] = entry.nodeHead;
  }
  if (head.directorySerial !== directorySerial) return { valid: false, reason: 'directory' };
  return { valid: true, state: { lastEntry: last, nodeHeads, directorySerial } };
}
