// Recepción de pruebas: verificación del tipo real por bytes mágicos y almacenamiento pendiente.
import type { EvidenceDescriptor, EvidenceMediaType } from '@sigilo/contracts';
import { randomBytes, sha256Hex, toDayDate, toHex } from '@sigilo/core';
import type { AppContext } from '../context.ts';
import { ApiFailure } from '../http/errors.ts';

const MAGIC_BYTES: Record<EvidenceMediaType, readonly number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

/** Indica si los primeros bytes corresponden a la firma del tipo declarado. */
export function hasMagicBytes(bytes: Uint8Array, mediaType: EvidenceMediaType): boolean {
  const magic = MAGIC_BYTES[mediaType];
  return bytes.length > magic.length && magic.every((byte, index) => bytes[index] === byte);
}

/**
 * Guarda una prueba pendiente (sin denuncia asociada) y devuelve su descriptor.
 * Seguridad: el tipo declarado debe coincidir con los bytes reales; así el visor de la autoridad
 * solo recibe imágenes. Lanza `unsupported_media_type` si no coinciden.
 */
export function storeEvidence(
  ctx: AppContext,
  bytes: Uint8Array,
  mediaType: EvidenceMediaType,
): EvidenceDescriptor {
  if (!hasMagicBytes(bytes, mediaType)) throw new ApiFailure('unsupported_media_type');
  const descriptor: EvidenceDescriptor = {
    evidenceId: toHex(randomBytes(16)),
    mediaType,
    sha256: sha256Hex(bytes),
    sizeBytes: bytes.length,
  };
  ctx.deps.evidenceStore.write(descriptor.evidenceId, bytes);
  try {
    ctx.evidence.insertPending(descriptor, toDayDate(ctx.deps.now()));
  } catch (error) {
    ctx.deps.evidenceStore.remove(descriptor.evidenceId);
    throw error;
  }
  return descriptor;
}
