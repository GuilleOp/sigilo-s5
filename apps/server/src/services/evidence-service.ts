// Recepción de pruebas: verificación del tipo real por bytes mágicos, cuotas de subidas y de
// almacenamiento, almacenamiento pendiente, purga de las pendientes que nunca se asociaron a una
// denuncia y retención de las pruebas de denuncias sin ningún seguimiento.
import type { EvidenceDescriptor, EvidenceMediaType } from '@sigilo/contracts';
import { randomBytes, sha256Hex, toDayDate, toHex } from '@sigilo/core';
import type { AppContext } from '../context.ts';
import type { ComplaintsRepository } from '../db/complaints-repository.ts';
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

/** Cuota total de almacenamiento de pruebas por omisión: 5 GiB. */
export const DEFAULT_EVIDENCE_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;

/** Indica si los primeros bytes corresponden a la firma del tipo declarado. */
export function hasMagicBytes(bytes: Uint8Array, mediaType: EvidenceMediaType): boolean {
  const magic = MAGIC_BYTES[mediaType];
  return bytes.length > magic.length && magic.every((byte, index) => bytes[index] === byte);
}

/**
 * Guarda una prueba pendiente (sin denuncia asociada) y devuelve su descriptor.
 * Seguridad: el tipo declarado debe coincidir con los bytes reales; así el visor de la autoridad
 * solo recibe imágenes. Lanza `unsupported_media_type` si no coinciden, `storage_full` si la
 * prueba excedería la cuota total de almacenamiento y `rate_limited` si se agotó la cuota global
 * de subidas de la ventana (último recurso, después de la prueba de trabajo).
 */
export function storeEvidence(
  ctx: AppContext,
  bytes: Uint8Array,
  mediaType: EvidenceMediaType,
): EvidenceDescriptor {
  if (!hasMagicBytes(bytes, mediaType)) throw new ApiFailure('unsupported_media_type');
  const quota = ctx.deps.evidenceQuotaBytes ?? DEFAULT_EVIDENCE_QUOTA_BYTES;
  if (ctx.evidence.totalStoredBytes() + bytes.length > quota) throw new ApiFailure('storage_full');
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

/** Dependencias de la retención de pruebas de denuncias sin seguimiento. */
export interface UntrackedRetentionDeps {
  complaints: ComplaintsRepository;
  evidence: EvidenceRepository;
  evidenceStore: EvidenceStore;
  now: () => Date;
  /** Días tras la recepción; 0 desactiva la retención. */
  retentionDays: number;
}

/**
 * Política de retención: borra los archivos de las pruebas de denuncias recibidas hace más de
 * `retentionDays` días que nunca tuvieron seguimiento y que la autoridad no ha atendido (siguen
 * en `received`). Devuelve cuántos archivos borró. Con `retentionDays = 0` no hace nada.
 * Seguridad: protege el almacenamiento de envíos masivos que nadie sigue, sin tocar la denuncia,
 * sus descriptores (con los que se recalculan los digestos) ni la bitácora. El registro de la
 * prueba queda marcado como no guardado y la autoridad recibe `not_found` al pedirla.
 */
export function purgeUntrackedEvidence(deps: UntrackedRetentionDeps): number {
  if (deps.retentionDays <= 0) return 0;
  const cutoffDay = toDayDate(new Date(deps.now().getTime() - deps.retentionDays * DAY_MS));
  let purged = 0;
  for (const folio of deps.complaints.listUntrackedBefore(cutoffDay)) {
    for (const evidenceId of deps.evidence.listStoredByFolio(folio)) {
      deps.evidence.markUnstored(evidenceId);
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
