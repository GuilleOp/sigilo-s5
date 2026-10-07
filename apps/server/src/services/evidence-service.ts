// Recepción de pruebas: verificación del tipo real por bytes mágicos, cuota de subidas,
// almacenamiento pendiente y purga de las pendientes que nunca se asociaron a una denuncia.
import type { EvidenceDescriptor, EvidenceMediaType } from '@sigilo/contracts';
import { randomBytes, sha256Hex, toDayDate, toHex } from '@sigilo/core';
import type { AppContext } from '../context.ts';
import type { EvidenceRepository } from '../db/evidence-repository.ts';
import { ApiFailure } from '../http/errors.ts';
import type { EvidenceStore } from '../storage/evidence-store.ts';

const MAGIC_BYTES: Record<EvidenceMediaType, readonly number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

const UPLOADS_KEY = 'global';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Antigüedad mínima de una prueba pendiente para purgarla. */
export const PENDING_EVIDENCE_TTL_MS = DAY_MS;

/** Cada cuánto se purgan las pruebas pendientes vencidas. */
export const EVIDENCE_PURGE_INTERVAL_MS = 60 * 60 * 1000;

/** Indica si los primeros bytes corresponden a la firma del tipo declarado. */
export function hasMagicBytes(bytes: Uint8Array, mediaType: EvidenceMediaType): boolean {
  const magic = MAGIC_BYTES[mediaType];
  return bytes.length > magic.length && magic.every((byte, index) => bytes[index] === byte);
}

/**
 * Guarda una prueba pendiente (sin denuncia asociada) y devuelve su descriptor.
 * Seguridad: el tipo declarado debe coincidir con los bytes reales; así el visor de la autoridad
 * solo recibe imágenes. Lanza `unsupported_media_type` si no coinciden y `rate_limited` si se
 * agotó la cuota global de subidas de la ventana.
 */
export function storeEvidence(
  ctx: AppContext,
  bytes: Uint8Array,
  mediaType: EvidenceMediaType,
): EvidenceDescriptor {
  if (!hasMagicBytes(bytes, mediaType)) throw new ApiFailure('unsupported_media_type');
  if (!ctx.limiters.evidenceUploads.consume(UPLOADS_KEY)) throw new ApiFailure('rate_limited');
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

/** Dependencias de la purga de pruebas pendientes. */
export interface EvidencePurgeDeps {
  evidence: EvidenceRepository;
  evidenceStore: EvidenceStore;
  now: () => Date;
}

/**
 * Borra las pruebas pendientes con más de 24 h y devuelve cuántas borró.
 * Seguridad: la fecha de subida solo se guarda por día; se purgan las de días anteriores al de
 * hace 24 h, así toda prueba borrada tiene más de 24 h (y a lo más 48 h) sin guardar la hora.
 */
export function purgeStalePendingEvidence(deps: EvidencePurgeDeps): number {
  const cutoffDay = toDayDate(new Date(deps.now().getTime() - PENDING_EVIDENCE_TTL_MS));
  let purged = 0;
  for (const evidenceId of deps.evidence.listPendingBefore(cutoffDay)) {
    // Se borra primero el registro: si una denuncia la asoció entretanto, no se toca el archivo.
    if (deps.evidence.deletePending(evidenceId)) {
      deps.evidenceStore.remove(evidenceId);
      purged += 1;
    }
  }
  return purged;
}

/** Programador de tareas periódicas; se inyecta para probar sin esperar. */
export interface Scheduler {
  every(intervalMs: number, task: () => void): () => void;
}

/** Programador con `setInterval` que no impide terminar el proceso. */
export const intervalScheduler: Scheduler = {
  every: (intervalMs, task) => {
    const timer = setInterval(task, intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  },
};

/**
 * Purga al arrancar y después cada `EVIDENCE_PURGE_INTERVAL_MS`. Devuelve la función que detiene
 * la purga periódica. `onError` recibe los fallos de las corridas programadas.
 */
export function startEvidencePurge(
  deps: EvidencePurgeDeps,
  scheduler: Scheduler = intervalScheduler,
  onError: (error: unknown) => void = () => undefined,
): () => void {
  purgeStalePendingEvidence(deps);
  return scheduler.every(EVIDENCE_PURGE_INTERVAL_MS, () => {
    try {
      purgeStalePendingEvidence(deps);
    } catch (error) {
      onError(error);
    }
  });
}
