// Pruebas cifradas de extremo a extremo en el navegador: quien denuncia cifra cada imagen limpia
// hacia la autoridad competente; la autoridad (o la supervisora, con la llave del archivo del sobre
// de escalamiento) la abre aquí, comprueba su cadena de custodia contra lo anclado en la bitácora y,
// al turnar, la vuelve a cifrar hacia la autoridad destino. El nodo nunca ve la imagen.
import { NODE_KEY_AUTHORITY_ID } from '@sigilo/contracts';
import type {
  ComplaintDetail,
  EvidenceCustodyItem,
  EvidenceDescriptor,
  EvidenceKeyGrant,
  EvidenceMediaType,
  LedgerPage,
} from '@sigilo/contracts';
import {
  evidenceReceivedPayloadDigest,
  folioDigest,
  grantEvidenceKey,
  openEvidenceBody,
  openEvidenceGrant,
  openEvidenceKey,
  parseEvidenceContainer,
  sealEvidence,
  sha256Hex,
  verifyEventInChain,
} from '@sigilo/core';
import type { EnvelopeRecipient, SealedEvidence } from '@sigilo/core';
import type { PinnedKeys } from '../config/pinned-keys.ts';
import type { AuthorityKeys } from './authority.ts';
import { downloadSegment, LEDGER_PAGE_SIZE } from './ledger-verification.ts';

const MAGIC_BYTES: Record<EvidenceMediaType, readonly number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

/** Indica si los primeros bytes son la firma del tipo de imagen declarado. */
export function hasImageMagic(bytes: Uint8Array, mediaType: EvidenceMediaType): boolean {
  const magic = MAGIC_BYTES[mediaType];
  return bytes.length > magic.length && magic.every((byte, index) => bytes[index] === byte);
}

/** La prueba no se pudo abrir o no coincide con su descriptor; el mensaje es para mostrarse. */
export class EvidenceUnreadableError extends Error {
  constructor(message = 'No pudimos abrir esta prueba con tu llave.') {
    super(message);
    this.name = 'EvidenceUnreadableError';
  }
}

/** Prueba abierta en este navegador. */
export interface OpenedEvidence {
  descriptor: EvidenceDescriptor;
  /** Imagen limpia con el tipo declarado ya comprobado por sus bytes. */
  blob: Blob;
  plaintext: Uint8Array;
  /** Sal del compromiso (vacía en una prueba anterior en claro). */
  salt: Uint8Array;
  /** Llave del archivo (vacía en una prueba anterior en claro). */
  fileKey: Uint8Array;
  /** Compromiso del contenido, o `null` si es una prueba anterior sin cifrar. */
  commitment: string | null;
  /**
   * `true` si el digesto del contenedor y el compromiso recalculado coinciden con lo anclado al
   * recibirla, `false` si no, `null` si no se comparó (sin anclaje a la mano).
   */
  matchesAnchor: boolean | null;
  /** Prueba anterior al cifrado, guardada en claro. */
  isLegacy: boolean;
}

/** Destinatario y contexto de una prueba al cifrarla. */
export interface EvidenceTarget {
  recipient: EnvelopeRecipient;
  folio: string;
  /** Autoridad destinataria (o `NODE_KEY_AUTHORITY_ID` con la llave fijada del nodo). */
  authorityId: string;
}

/** Cifra una imagen limpia hacia la autoridad (en el navegador de quien denuncia). */
export async function sealEvidenceBlob(
  blob: Blob,
  mediaType: EvidenceMediaType,
  target: EvidenceTarget,
): Promise<SealedEvidence> {
  const plaintext = new Uint8Array(await blob.arrayBuffer());
  return sealEvidence(plaintext, target.recipient, {
    folio: target.folio,
    authorityId: target.authorityId,
    mediaType,
  });
}

/**
 * Llave del archivo para la autoridad de la sesión: la de la cabecera (sellada hacia su propia
 * llave con su identificador o con el de la llave del nodo) o una llave re-cifrada hacia ella.
 * Lanza `EvidenceUnreadableError` si ninguna abre.
 */
export async function fileKeyFor(
  container: Uint8Array,
  descriptor: EvidenceDescriptor,
  detail: ComplaintDetail,
  keys: AuthorityKeys,
  authorityId: string,
): Promise<Uint8Array> {
  const folio = detail.summary.folio;
  const header = parseEvidenceContainer(container);
  if (header === null) throw new EvidenceUnreadableError();
  for (const recipientId of new Set([authorityId, NODE_KEY_AUTHORITY_ID])) {
    try {
      return await openEvidenceKey(container, keys.boxPrivateKey, keys.keyId, {
        folio,
        authorityId: recipientId,
      });
    } catch {
      // Se prueba el siguiente destinatario o una llave re-cifrada.
    }
  }
  const grants = (detail.evidenceCustody?.keyGrants ?? []).filter(
    (grant) => grant.evidenceId === descriptor.evidenceId && grant.envelope.keyId === keys.keyId,
  );
  for (const grant of grants) {
    try {
      return await openEvidenceGrant(
        grant.envelope,
        keys.boxPrivateKey,
        { folio, authorityId: grant.authorityId },
        header.commitment,
      );
    } catch {
      // Otra llave re-cifrada podría abrir.
    }
  }
  throw new EvidenceUnreadableError(
    'Esta prueba se cifró hacia otra llave y nadie la ha compartido con tu autoridad. Pide a quien te la turnó que comparta las llaves de las pruebas.',
  );
}

/**
 * Abre el contenedor con la llave del archivo y comprueba, antes de mostrar nada: que su digesto
 * sea el del descriptor (que va en el comprobante firmado), que el compromiso recalculado sea el de
 * la cabecera, que los bytes sean de una imagen del tipo declarado y si coincide con lo anclado.
 */
export async function openEvidenceWithKey(
  container: Uint8Array,
  descriptor: EvidenceDescriptor,
  folio: string,
  fileKey: Uint8Array,
  anchored?: readonly EvidenceCustodyItem[],
): Promise<OpenedEvidence> {
  if (sha256Hex(container) !== descriptor.sha256) {
    throw new EvidenceUnreadableError('El archivo no coincide con su digesto.');
  }
  let opened;
  try {
    opened = await openEvidenceBody(container, fileKey, folio, descriptor.mediaType);
  } catch {
    throw new EvidenceUnreadableError();
  }
  if (!hasImageMagic(opened.plaintext, descriptor.mediaType)) {
    throw new EvidenceUnreadableError('El archivo descifrado no es una imagen del tipo declarado.');
  }
  const anchor = anchored?.find((item) => item.evidenceId === descriptor.evidenceId);
  return {
    descriptor,
    blob: new Blob([new Uint8Array(opened.plaintext)], { type: descriptor.mediaType }),
    plaintext: opened.plaintext,
    salt: opened.salt,
    fileKey,
    commitment: opened.commitment,
    matchesAnchor:
      anchored === undefined
        ? null
        : anchor !== undefined &&
          anchor.sha256 === descriptor.sha256 &&
          anchor.commitment === opened.commitment,
    isLegacy: false,
  };
}

/**
 * Abre una prueba para la autoridad de la sesión. Una prueba anterior al cifrado (en claro, sin
 * contenedor) solo se muestra si su digesto y su tipo coinciden, marcada sin anclaje.
 */
export async function openForAuthority(
  container: Uint8Array,
  descriptor: EvidenceDescriptor,
  detail: ComplaintDetail,
  keys: AuthorityKeys,
  authorityId: string,
): Promise<OpenedEvidence> {
  if (parseEvidenceContainer(container) === null) return openLegacy(container, descriptor);
  const fileKey = await fileKeyFor(container, descriptor, detail, keys, authorityId);
  return openEvidenceWithKey(
    container,
    descriptor,
    detail.summary.folio,
    fileKey,
    detail.evidenceCustody?.items ?? [],
  );
}

function openLegacy(bytes: Uint8Array, descriptor: EvidenceDescriptor): OpenedEvidence {
  if (sha256Hex(bytes) !== descriptor.sha256 || !hasImageMagic(bytes, descriptor.mediaType)) {
    throw new EvidenceUnreadableError('El archivo no coincide con su digesto.');
  }
  return {
    descriptor,
    blob: new Blob([new Uint8Array(bytes)], { type: descriptor.mediaType }),
    plaintext: bytes,
    salt: new Uint8Array(0),
    fileKey: new Uint8Array(0),
    commitment: null,
    matchesAnchor: null,
    isLegacy: true,
  };
}

/**
 * Re-cifra hacia otra autoridad de este nodo la llave de cada prueba guardada (antes de turnar o
 * reasignar dentro del nodo). Devuelve las llaves re-cifradas; vacío si no hay pruebas cifradas.
 * Seguridad: el contenedor no cambia; el nodo guarda las llaves sin poder abrirlas.
 */
export async function grantEvidenceKeysTo(
  detail: ComplaintDetail,
  keys: AuthorityKeys,
  authorityId: string,
  target: { authorityId: string; recipient: EnvelopeRecipient },
  fetchContainer: (evidenceId: string) => Promise<Uint8Array>,
): Promise<EvidenceKeyGrant[]> {
  const items = (detail.evidenceCustody?.items ?? []).filter((item) => item.isStored);
  const grants: EvidenceKeyGrant[] = [];
  for (const item of items) {
    const descriptor = detail.evidence.find((entry) => entry.evidenceId === item.evidenceId);
    if (descriptor === undefined) continue;
    const container = await fetchContainer(item.evidenceId);
    const fileKey = await fileKeyFor(container, descriptor, detail, keys, authorityId);
    grants.push({
      evidenceId: item.evidenceId,
      authorityId: target.authorityId,
      envelope: await grantEvidenceKey(
        fileKey,
        target.recipient,
        { folio: detail.summary.folio, authorityId: target.authorityId },
        item.commitment,
      ),
    });
    fileKey.fill(0);
  }
  return grants;
}

/** Resultado de comparar el anclaje de las pruebas con la bitácora pública. */
export type EvidenceAnchorVerification = 'verified' | 'pending' | 'mismatch';

/**
 * Comprueba la cadena de custodia contra la bitácora: recalcula el digesto del evento
 * `evidence.received` con el folio y lo anclado, exige que lo anclado sean las mismas pruebas del
 * detalle (cuyos descriptores van en el comprobante firmado) y, si ya se publicó, que el evento esté
 * en la cadena hasta la cabeza firmada por la llave FIJADA del servidor.
 */
export async function verifyEvidenceAnchor(
  detail: ComplaintDetail,
  fetchPage: (from: number, limit: number) => Promise<LedgerPage>,
  pinned: PinnedKeys,
): Promise<EvidenceAnchorVerification> {
  const custody = detail.evidenceCustody;
  const folio = detail.summary.folio;
  const received = custody?.events.find((event) => event.type === 'evidence.received');
  if (custody === undefined || received === undefined) return 'mismatch';
  const isSameEvidence =
    custody.items.length === detail.evidence.length &&
    custody.items.every(
      (item, index) =>
        item.evidenceId === detail.evidence[index]?.evidenceId &&
        item.sha256 === detail.evidence[index]?.sha256,
    );
  const expected = evidenceReceivedPayloadDigest(folio, custody.items);
  if (!isSameEvidence || received.payloadDigest !== expected) return 'mismatch';
  const seq = received.seq;
  if (seq === undefined) return 'pending';
  const first = await fetchPage(seq, LEDGER_PAGE_SIZE);
  const event = first.events[0];
  if (event === undefined || event.seq !== seq || first.head.seq < seq) return 'mismatch';
  const chain = await downloadSegment(fetchPage, seq, first.head, first.events);
  const inChain = verifyEventInChain(event, chain, first.head, pinned.serverSigningPublicKey);
  const isAuthentic =
    inChain.valid &&
    event.type === 'evidence.received' &&
    event.folioDigest === folioDigest(folio) &&
    event.payloadDigest === expected;
  return isAuthentic ? 'verified' : 'mismatch';
}
