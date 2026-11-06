// Directorio de autoridades: consistencia, digesto canónico, firma de la operación, cofirmas de
// testigos y verificación contra la raíz de confianza fijada en el navegador.
import { AuthorityDirectorySchema, SignedAuthorityDirectorySchema } from '@sigilo/contracts';
import type {
  AuthorityDirectory,
  DirectoryAuthority,
  DirectoryNode,
  NetworkTrustAnchor,
  SignedAuthorityDirectory,
} from '@sigilo/contracts';
import { canonicalize, keyIdFor, sha256Hex, toBase64Url } from '@sigilo/core';
import {
  keyIdMatches,
  signWithDomain,
  signingPublicKeyOf,
  validWitnesses,
  verifyWithDomain,
} from './signatures.ts';

/** Dominio de la firma de la operación sobre el digesto del directorio. */
export const DIRECTORY_OPERATOR_DOMAIN = 'sigilo/red/directory/operator/v1:';
/** Dominio de la cofirma de un testigo sobre el digesto del directorio. */
export const DIRECTORY_WITNESS_DOMAIN = 'sigilo/red/directory/witness/v1:';
/** `previousDigest` de la primera versión: 64 ceros. */
export const DIRECTORY_GENESIS_DIGEST = '0'.repeat(64);

/** Motivo por el que un directorio no se acepta. */
export type DirectoryFailureReason =
  | 'malformed'
  | 'inconsistent'
  | 'digest'
  | 'trust'
  | 'operator'
  | 'witnesses'
  | 'sequence'
  | 'rollback'
  | 'stale'
  | 'expired';

/** Opciones de frescura de `verifySignedDirectory`. */
export interface DirectoryFreshnessOptions {
  /** Día de hoy (AAAA-MM-DD, UTC). Sin él no se comprueban `validUntil` ni la antigüedad. */
  today?: string;
}

const DAY_MS = 86_400_000;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Resultado de verificar un directorio publicado. */
export type DirectoryVerification =
  | { valid: true; directory: AuthorityDirectory; witnesses: string[] }
  | { valid: false; reason: DirectoryFailureReason };

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => (seen.has(value) ? true : (seen.add(value), false)));
}

/**
 * Comprueba la coherencia interna del directorio y devuelve los problemas en español (vacío si
 * no hay). No verifica firmas.
 */
export function directoryProblems(directory: AuthorityDirectory): string[] {
  const problems: string[] = [];
  const nodeIds = new Set(directory.nodes.map((node) => node.id));
  const authorityIds = new Set(directory.authorities.map((authority) => authority.id));
  const observerIds = new Set(directory.observers.map((observer) => observer.id));
  const ids = [
    ...directory.nodes.map((node) => node.id),
    ...directory.authorities.map((authority) => authority.id),
    ...directory.observers.map((observer) => observer.id),
  ];
  for (const id of duplicates(ids)) problems.push(`Identificador repetido: ${id}.`);
  if (!keyIdMatches(directory.operator.signingKeyId, directory.operator.signingPublicKey)) {
    problems.push('La llave de la operación no corresponde a su identificador.');
  }
  for (const node of directory.nodes) {
    if (!keyIdMatches(node.boxKeyId, node.boxPublicKey)) {
      problems.push(`La llave de cifrado de ${node.id} no corresponde a su identificador.`);
    }
    if (!keyIdMatches(node.signingKeyId, node.signingPublicKey)) {
      problems.push(`La llave de firma de ${node.id} no corresponde a su identificador.`);
    }
  }
  for (const authority of directory.authorities) {
    if (!nodeIds.has(authority.nodeId)) {
      problems.push(`${authority.id} apunta a un nodo inexistente.`);
    }
    if (authority.supervisorId !== null) {
      if (authority.supervisorId === authority.id) {
        problems.push(`${authority.id} no puede supervisarse a sí misma.`);
      } else if (!authorityIds.has(authority.supervisorId)) {
        problems.push(`${authority.id} apunta a una supervisora inexistente.`);
      }
    }
    if (!keyIdMatches(authority.keyId, authority.boxPublicKey)) {
      problems.push(`La llave de cifrado de ${authority.id} no corresponde a su identificador.`);
    }
    if (authority.validUntil !== null && authority.validUntil < authority.validFrom) {
      problems.push(`La vigencia de ${authority.id} termina antes de empezar.`);
    }
    if ((authority.governmentLevel === 'federal') !== (authority.stateCode === null)) {
      problems.push(`${authority.id}: solo las autoridades federales van sin entidad.`);
    }
  }
  for (const observer of directory.observers) {
    if (!keyIdMatches(observer.signingKeyId, observer.signingPublicKey)) {
      problems.push(`La llave de ${observer.id} no corresponde a su identificador.`);
    }
  }
  const { witnessIds, threshold } = directory.witnessPolicy;
  for (const id of duplicates(witnessIds)) problems.push(`Testigo repetido: ${id}.`);
  for (const id of witnessIds) {
    if (!observerIds.has(id) && !nodeIds.has(id)) problems.push(`Testigo inexistente: ${id}.`);
  }
  if (threshold > witnessIds.length) {
    problems.push('El umbral de testigos es mayor que el número de testigos.');
  }
  if (directory.validUntil !== undefined && directory.validUntil < directory.issuedOn) {
    problems.push('El directorio vence antes de emitirse.');
  }
  if (directory.serial === 1 && directory.previousDigest !== DIRECTORY_GENESIS_DIGEST) {
    problems.push('La primera versión debe tener el digesto anterior en ceros.');
  }
  return problems;
}

/** SHA-256 de la forma canónica del directorio. Lanza error si no cumple el esquema. */
export function directoryDigest(directory: AuthorityDirectory): string {
  return sha256Hex(canonicalize(AuthorityDirectorySchema.parse(directory)));
}

/**
 * Firma el directorio con la llave de la operación; las cofirmas empiezan vacías.
 * Lanza error si el directorio es incoherente o la llave no es la que declara.
 */
export function signDirectory(
  directory: AuthorityDirectory,
  operatorPrivateKey: Uint8Array,
): SignedAuthorityDirectory {
  const parsed = AuthorityDirectorySchema.parse(directory);
  const problems = directoryProblems(parsed);
  if (problems.length > 0) throw new Error(`Directorio incoherente: ${problems.join(' ')}`);
  if (keyIdFor(signingPublicKeyOf(operatorPrivateKey)) !== parsed.operator.signingKeyId) {
    throw new Error('La llave no es la de la operación declarada en el directorio.');
  }
  const digest = directoryDigest(parsed);
  return {
    directory: parsed,
    digest,
    operatorSignature: signWithDomain(DIRECTORY_OPERATOR_DOMAIN, digest, operatorPrivateKey),
    witnessSignatures: [],
  };
}

/** Llave pública de firma de un testigo del directorio (observador o nodo), o `null`. */
export function witnessKeyOf(
  directory: AuthorityDirectory,
  witnessId: string,
): { keyId: string; signingPublicKey: string } | null {
  const observer = directory.observers.find((candidate) => candidate.id === witnessId);
  if (observer !== undefined) {
    return { keyId: observer.signingKeyId, signingPublicKey: observer.signingPublicKey };
  }
  const node = directory.nodes.find((candidate) => candidate.id === witnessId);
  return node === undefined
    ? null
    : { keyId: node.signingKeyId, signingPublicKey: node.signingPublicKey };
}

/**
 * Agrega (o reemplaza) la cofirma de `witnessId` sobre el digesto del directorio.
 * Seguridad: el testigo cofirma lo que recalcula, no el digesto que le entregan. Lanza error si
 * el digesto no corresponde, si no es testigo del directorio o si la llave no es la suya.
 */
export function cosignDirectory(
  signed: SignedAuthorityDirectory,
  witnessId: string,
  witnessPrivateKey: Uint8Array,
): SignedAuthorityDirectory {
  const parsed = SignedAuthorityDirectorySchema.parse(signed);
  const digest = directoryDigest(parsed.directory);
  if (digest !== parsed.digest) throw new Error('El digesto del directorio no corresponde.');
  if (!parsed.directory.witnessPolicy.witnessIds.includes(witnessId)) {
    throw new Error('Quien cofirma no es testigo de este directorio.');
  }
  const key = witnessKeyOf(parsed.directory, witnessId);
  if (key === null || keyIdFor(signingPublicKeyOf(witnessPrivateKey)) !== key.keyId) {
    throw new Error('La llave no es la del testigo en el directorio.');
  }
  const others = parsed.witnessSignatures.filter((entry) => entry.witnessId !== witnessId);
  return {
    ...parsed,
    witnessSignatures: [
      ...others,
      {
        witnessId,
        keyId: key.keyId,
        signature: signWithDomain(DIRECTORY_WITNESS_DOMAIN, digest, witnessPrivateKey),
      },
    ].sort((left, right) => left.witnessId.localeCompare(right.witnessId)),
  };
}

/**
 * Verifica un directorio publicado contra la raíz de confianza fijada: esquema, coherencia,
 * digesto, llave y firma de la operación y al menos `trust.threshold` cofirmas válidas de testigos
 * fijados distintos. Además (H10): serial no menor que `trust.minDirectorySerial`; con `today`,
 * que no haya pasado `validUntil` y, si la raíz fija `maxDirectoryAgeDays`, que `issuedOn` no sea
 * más antiguo (sin `today` esa raíz no acepta ningún directorio).
 * Seguridad: los testigos que cuentan son los de la raíz fijada, no los que declara el directorio;
 * así un directorio no puede nombrar a sus propios testigos.
 */
export function verifySignedDirectory(
  signed: unknown,
  trust: NetworkTrustAnchor,
  options: DirectoryFreshnessOptions = {},
): DirectoryVerification {
  const parsed = SignedAuthorityDirectorySchema.safeParse(signed);
  if (!parsed.success) return { valid: false, reason: 'malformed' };
  const { directory, digest, operatorSignature, witnessSignatures } = parsed.data;
  if (directoryProblems(directory).length > 0) return { valid: false, reason: 'inconsistent' };
  if (directoryDigest(directory) !== digest) return { valid: false, reason: 'digest' };
  if (
    directory.operator.signingKeyId !== trust.operatorKeyId ||
    directory.operator.signingPublicKey !== trust.operatorSigningPublicKey
  ) {
    return { valid: false, reason: 'trust' };
  }
  if (
    !verifyWithDomain(
      DIRECTORY_OPERATOR_DOMAIN,
      digest,
      operatorSignature,
      trust.operatorSigningPublicKey,
    )
  ) {
    return { valid: false, reason: 'operator' };
  }
  const witnesses = validWitnesses(DIRECTORY_WITNESS_DOMAIN, digest, witnessSignatures, trust);
  if (witnesses.length < trust.threshold) return { valid: false, reason: 'witnesses' };
  // Seguridad (H10): una versión vieja sigue bien firmada; el serial mínimo fijado y la frescura
  // impiden servir una anterior que todavía trae llaves revocadas.
  if (trust.minDirectorySerial !== undefined && directory.serial < trust.minDirectorySerial) {
    return { valid: false, reason: 'rollback' };
  }
  const { today } = options;
  if (today !== undefined && directory.validUntil !== undefined && today > directory.validUntil) {
    return { valid: false, reason: 'expired' };
  }
  if (trust.maxDirectoryAgeDays !== undefined) {
    if (today === undefined || daysBetween(directory.issuedOn, today) > trust.maxDirectoryAgeDays) {
      return { valid: false, reason: 'stale' };
    }
  }
  return { valid: true, directory, witnesses };
}

/**
 * Raíz de confianza que define un directorio ya verificado: su operación y sus testigos. Sirve
 * para verificar la versión siguiente (`verifyDirectoryUpdate`).
 * Lanza error si un testigo no existe en el directorio.
 */
export function trustAnchorFromDirectory(directory: AuthorityDirectory): NetworkTrustAnchor {
  return {
    format: 1,
    operatorKeyId: directory.operator.signingKeyId,
    operatorSigningPublicKey: directory.operator.signingPublicKey,
    threshold: directory.witnessPolicy.threshold,
    witnesses: directory.witnessPolicy.witnessIds.map((id) => {
      const key = witnessKeyOf(directory, id);
      if (key === null) throw new Error(`Testigo inexistente: ${id}.`);
      return { id, keyId: key.keyId, signingPublicKey: key.signingPublicKey };
    }),
  };
}

/**
 * Verifica que `next` sea la versión siguiente de `previous` (ya verificado): serial más uno,
 * digesto anterior encadenado y firmas válidas con la operación y los testigos de `previous`.
 * Seguridad: un testigo se sustituye solo con una versión cofirmada por m de los actuales.
 */
export function verifyDirectoryUpdate(
  previous: SignedAuthorityDirectory,
  next: unknown,
): DirectoryVerification {
  const result = verifySignedDirectory(next, trustAnchorFromDirectory(previous.directory));
  if (!result.valid) return result;
  const isNext =
    result.directory.serial === previous.directory.serial + 1 &&
    result.directory.previousDigest === previous.digest;
  return isNext ? result : { valid: false, reason: 'sequence' };
}

/** Indica si las llaves de la autoridad están vigentes el día `on` (AAAA-MM-DD). */
export function isAuthorityValidOn(authority: DirectoryAuthority, on: string): boolean {
  return authority.validFrom <= on && (authority.validUntil === null || on <= authority.validUntil);
}

/** Autoridad por identificador, o `undefined`. */
export function findAuthority(
  directory: AuthorityDirectory,
  id: string,
): DirectoryAuthority | undefined {
  return directory.authorities.find((authority) => authority.id === id);
}

/** Nodo por identificador, o `undefined`. */
export function findNode(directory: AuthorityDirectory, id: string): DirectoryNode | undefined {
  return directory.nodes.find((node) => node.id === id);
}

/** Codifica una llave pública cruda para el directorio. */
export function encodePublicKey(publicKey: Uint8Array): { keyId: string; publicKey: string } {
  return { keyId: keyIdFor(publicKey), publicKey: toBase64Url(publicKey) };
}
