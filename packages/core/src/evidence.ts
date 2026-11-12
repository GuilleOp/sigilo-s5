// Pruebas cifradas de extremo a extremo hacia la autoridad competente (cifrado híbrido con HPKE):
// cada imagen limpia se cifra con una llave de archivo aleatoria (ChaCha20-Poly1305) y esa llave se
// sella con HPKE hacia la llave pública de la autoridad, con el folio y la autoridad en el AAD. El
// nodo solo guarda el contenedor cifrado; la sal del compromiso del contenido viaja cifrada.
//
// Contenedor (versión 1):
//   "SGEV" ‖ 0x01                     5 bytes, formato y versión
//   compromiso                        32 bytes, SHA-256(dominio ‖ sal ‖ imagen)
//   enc                               32 bytes, llave efímera encapsulada de HPKE
//   llave del archivo sellada         48 bytes, 32 de llave + 16 de etiqueta
//   cuerpo                            ChaCha20-Poly1305(llave, nonce 0, sal ‖ imagen) + 16 de etiqueta
import { Chacha20Poly1305 } from '@hpke/chacha20poly1305';
import { sha256 } from '@noble/hashes/sha2.js';
import { EVIDENCE_CONTAINER_OVERHEAD, HPKE_SUITE_V1, Sha256HexSchema } from '@sigilo/contracts';
import type { EvidenceMediaType, HpkeEnvelope } from '@sigilo/contracts';
import { canonicalize, sha256Hex } from './canonical-json.ts';
import { equalBytes, fromBase64Url, fromHex, toBase64Url, toHex, utf8Encode } from './encoding.ts';
import type { EnvelopeRecipient } from './envelope.ts';
import { openEnvelope, sealToPublicKey } from './envelope.ts';
import { randomBytes } from './random.ts';

/** Prefijo del contenedor: "SGEV" y la versión 1 del formato. */
export const EVIDENCE_CONTAINER_MAGIC = new Uint8Array([0x53, 0x47, 0x45, 0x56, 0x01]);

const COMMITMENT_LENGTH = 32;
const ENC_LENGTH = 32;
const FILE_KEY_LENGTH = 32;
const TAG_LENGTH = 16;
const WRAPPED_KEY_LENGTH = FILE_KEY_LENGTH + TAG_LENGTH;
const SALT_LENGTH = 32;

/** Bytes de la cabecera del contenedor, antes del cuerpo cifrado. */
export const EVIDENCE_HEADER_LENGTH =
  EVIDENCE_CONTAINER_MAGIC.length + COMMITMENT_LENGTH + ENC_LENGTH + WRAPPED_KEY_LENGTH;

if (EVIDENCE_HEADER_LENGTH + SALT_LENGTH + TAG_LENGTH !== EVIDENCE_CONTAINER_OVERHEAD) {
  throw new Error('El tamaño de la cabecera de las pruebas no coincide con el contrato.');
}

const COMMITMENT_DOMAIN = utf8Encode('sigilo/v1/evidence-commitment:');
const ZERO_NONCE = new Uint8Array(12);
const OPEN_ERROR = 'No se pudo abrir la prueba.';
const aead = new Chacha20Poly1305();

/** Contexto al que queda ligada la llave de un archivo: forma el AAD de su sobre HPKE. */
export interface EvidenceKeyContext {
  folio: string;
  /** Autoridad destinataria (o `NODE_KEY_AUTHORITY_ID` si se cifró hacia la llave fijada). */
  authorityId: string;
}

/** Contexto del cifrado de una prueba. */
export interface EvidenceSealContext extends EvidenceKeyContext {
  mediaType: EvidenceMediaType;
}

/** Prueba recién cifrada. */
export interface SealedEvidence {
  /** Contenedor que se sube al nodo. */
  container: Uint8Array;
  /** Llave del archivo: va en el sobre de escalamiento para la supervisora. Se borra al usarla. */
  fileKey: Uint8Array;
  /** Compromiso del contenido (hexadecimal). */
  commitment: string;
  /** Digesto del contenedor (hexadecimal): el `sha256` de su descriptor. */
  sha256: string;
}

/** Prueba abierta en el navegador de la autoridad. */
export interface OpenedEvidence {
  plaintext: Uint8Array;
  salt: Uint8Array;
  /** Compromiso de la cabecera, que ya se comprobó contra el recalculado. */
  commitment: string;
}

/**
 * Compromiso del contenido: `SHA-256("sigilo/v1/evidence-commitment:" ‖ sal ‖ imagen)`.
 * Seguridad: con una sal secreta de 32 bytes, quien tenga una imagen candidata (por ejemplo, la
 * persona denunciada con el documento original) no puede confirmar con la bitácora que es la
 * prueba; con el SHA-256 simple sí podría.
 */
export function computeEvidenceCommitment(salt: Uint8Array, plaintext: Uint8Array): string {
  if (salt.length !== SALT_LENGTH) throw new Error('La sal debe tener 32 bytes.');
  const input = new Uint8Array(COMMITMENT_DOMAIN.length + SALT_LENGTH + plaintext.length);
  input.set(COMMITMENT_DOMAIN, 0);
  input.set(salt, COMMITMENT_DOMAIN.length);
  input.set(plaintext, COMMITMENT_DOMAIN.length + SALT_LENGTH);
  return toHex(sha256(input));
}

function keyAad(context: EvidenceKeyContext, commitment: string): Uint8Array {
  const bound = canonicalize({
    folio: context.folio,
    authorityId: context.authorityId,
    commitment,
  });
  return utf8Encode(`sigilo/v1/evidence-key:${bound}`);
}

function bodyAad(folio: string, mediaType: EvidenceMediaType, commitment: string): Uint8Array {
  return utf8Encode(`sigilo/v1/evidence-body:${canonicalize({ folio, mediaType, commitment })}`);
}

/** Partes de la cabecera de un contenedor, sin abrir nada. */
export interface EvidenceHeader {
  commitment: string;
  enc: Uint8Array;
  wrappedKey: Uint8Array;
  body: Uint8Array;
}

/**
 * Lee la cabecera de un contenedor, o `null` si no tiene el formato (prefijo y versión, y al menos
 * un byte de imagen). Lo usa el nodo, que no puede abrir nada, para rechazar lo que no es una
 * prueba cifrada y anclar su compromiso.
 */
export function parseEvidenceContainer(container: Uint8Array): EvidenceHeader | null {
  if (container.length <= EVIDENCE_CONTAINER_OVERHEAD) return null;
  const magic = container.subarray(0, EVIDENCE_CONTAINER_MAGIC.length);
  if (!equalBytes(magic, EVIDENCE_CONTAINER_MAGIC)) return null;
  let offset = EVIDENCE_CONTAINER_MAGIC.length;
  const take = (length: number): Uint8Array => {
    const part = container.subarray(offset, offset + length);
    offset += length;
    return part;
  };
  const commitment = toHex(take(COMMITMENT_LENGTH));
  const enc = take(ENC_LENGTH);
  const wrappedKey = take(WRAPPED_KEY_LENGTH);
  return { commitment, enc, wrappedKey, body: container.subarray(offset) };
}

async function sealBody(
  fileKey: Uint8Array,
  salt: Uint8Array,
  plaintext: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  const input = new Uint8Array(SALT_LENGTH + plaintext.length);
  input.set(salt, 0);
  input.set(plaintext, SALT_LENGTH);
  const sealed = await aead.createEncryptionContext(fileKey).seal(ZERO_NONCE, input, aad);
  return new Uint8Array(sealed);
}

/**
 * Cifra una imagen limpia hacia la llave pública de la autoridad. `salt` solo se pasa al re-cifrar
 * una prueba ya abierta (turnado a otro nodo): conservarla mantiene el mismo compromiso, que es lo
 * que liga la copia nueva con la anclada en el origen.
 * Seguridad: la llave del archivo es aleatoria y de un solo uso, así que el nonce fijo en cero no
 * se repite nunca con la misma llave. El AAD del cuerpo liga el folio, el tipo y el compromiso; el
 * de la llave, el folio, la autoridad y el compromiso: una prueba no se puede trasplantar a otra
 * denuncia ni presentarse a otra autoridad.
 */
export async function sealEvidence(
  plaintext: Uint8Array,
  recipient: EnvelopeRecipient,
  context: EvidenceSealContext,
  salt: Uint8Array = randomBytes(SALT_LENGTH),
): Promise<SealedEvidence> {
  if (plaintext.length === 0) throw new Error('La prueba está vacía.');
  const commitment = computeEvidenceCommitment(salt, plaintext);
  const fileKey = randomBytes(FILE_KEY_LENGTH);
  const body = await sealBody(
    fileKey,
    salt,
    plaintext,
    bodyAad(context.folio, context.mediaType, commitment),
  );
  const envelope = await sealToPublicKey(fileKey, recipient, keyAad(context, commitment));
  const enc = fromBase64Url(envelope.enc);
  const wrappedKey = fromBase64Url(envelope.ct);
  const container = new Uint8Array(EVIDENCE_HEADER_LENGTH + body.length);
  let offset = 0;
  for (const part of [EVIDENCE_CONTAINER_MAGIC, fromHex(commitment), enc, wrappedKey, body]) {
    container.set(part, offset);
    offset += part.length;
  }
  return { container, fileKey, commitment, sha256: sha256Hex(container) };
}

/** Sobre HPKE de la llave del archivo, tal como va en la cabecera del contenedor. */
function headerEnvelope(header: EvidenceHeader, keyId: string): HpkeEnvelope {
  return {
    v: 1,
    suite: HPKE_SUITE_V1,
    keyId,
    enc: toBase64Url(header.enc),
    ct: toBase64Url(header.wrappedKey),
  };
}

/**
 * Abre la llave del archivo de la cabecera con la llave privada de la autoridad (`keyId` es el de
 * su llave pública). Lanza un error genérico si no es para esa llave o ese contexto.
 */
export async function openEvidenceKey(
  container: Uint8Array,
  privateKey: Uint8Array,
  keyId: string,
  context: EvidenceKeyContext,
): Promise<Uint8Array> {
  const header = parseEvidenceContainer(container);
  if (header === null) throw new Error(OPEN_ERROR);
  try {
    return await openEnvelope(
      headerEnvelope(header, keyId),
      privateKey,
      keyAad(context, header.commitment),
    );
  } catch {
    throw new Error(OPEN_ERROR);
  }
}

/**
 * Re-cifra la llave de un archivo hacia otra autoridad del mismo nodo (turnado o reasignación
 * dentro del nodo). El contenedor no cambia, así que su digesto y su compromiso tampoco.
 */
export function grantEvidenceKey(
  fileKey: Uint8Array,
  recipient: EnvelopeRecipient,
  context: EvidenceKeyContext,
  commitment: string,
): Promise<HpkeEnvelope> {
  if (!Sha256HexSchema.safeParse(commitment).success) {
    return Promise.reject(new Error('El compromiso no es válido.'));
  }
  return sealToPublicKey(fileKey, recipient, keyAad(context, commitment));
}

/** Abre una llave re-cifrada (`grantEvidenceKey`) con la llave privada de la autoridad. */
export async function openEvidenceGrant(
  envelope: HpkeEnvelope,
  privateKey: Uint8Array,
  context: EvidenceKeyContext,
  commitment: string,
): Promise<Uint8Array> {
  try {
    return await openEnvelope(envelope, privateKey, keyAad(context, commitment));
  } catch {
    throw new Error(OPEN_ERROR);
  }
}

/**
 * Descifra el cuerpo con la llave del archivo y comprueba que el compromiso recalculado con la sal
 * y la imagen sea el de la cabecera. Lanza un error genérico si algo no coincide.
 */
export async function openEvidenceBody(
  container: Uint8Array,
  fileKey: Uint8Array,
  folio: string,
  mediaType: EvidenceMediaType,
): Promise<OpenedEvidence> {
  const header = parseEvidenceContainer(container);
  if (header === null || fileKey.length !== FILE_KEY_LENGTH) throw new Error(OPEN_ERROR);
  let opened: Uint8Array;
  try {
    opened = new Uint8Array(
      await aead
        .createEncryptionContext(fileKey)
        .open(ZERO_NONCE, header.body, bodyAad(folio, mediaType, header.commitment)),
    );
  } catch {
    throw new Error(OPEN_ERROR);
  }
  const salt = opened.slice(0, SALT_LENGTH);
  const plaintext = opened.slice(SALT_LENGTH);
  if (computeEvidenceCommitment(salt, plaintext) !== header.commitment) {
    throw new Error(OPEN_ERROR);
  }
  return { plaintext, salt, commitment: header.commitment };
}

/** Llave del archivo en Base64URL, como va en el sobre de escalamiento. */
export function encodeFileKey(fileKey: Uint8Array): string {
  return toBase64Url(fileKey);
}

/** Llave del archivo desde el sobre de escalamiento. */
export function decodeFileKey(encoded: string): Uint8Array {
  const key = fromBase64Url(encoded);
  if (key.length !== FILE_KEY_LENGTH) throw new Error(OPEN_ERROR);
  return key;
}

/** Prueba anclada en el evento `evidence.received`. */
export interface AnchoredEvidence {
  evidenceId: string;
  sha256: string;
  commitment: string;
}

/**
 * Datos del evento `evidence.received`: el folio y, por prueba en el orden de la denuncia, su
 * identificador, el digesto del contenedor y el compromiso del contenido.
 */
export function evidenceReceivedPayload(
  folio: string,
  items: readonly AnchoredEvidence[],
): { folio: string; evidence: AnchoredEvidence[] } {
  return {
    folio,
    evidence: items.map(({ evidenceId, sha256: digest, commitment }) => ({
      evidenceId,
      sha256: digest,
      commitment,
    })),
  };
}

/** `payloadDigest` del evento `evidence.received`, para compararlo con la bitácora publicada. */
export function evidenceReceivedPayloadDigest(
  folio: string,
  items: readonly AnchoredEvidence[],
): string {
  return sha256Hex(canonicalize(evidenceReceivedPayload(folio, items)));
}
