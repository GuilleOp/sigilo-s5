// Recepción de pruebas: verificación del tipo real por bytes mágicos, reparto de la cuota de
// almacenamiento (pendientes y por denuncia), retención de las pruebas de denuncias sin atender y
// purga de las pendientes que nunca se asociaron.
import type { EvidenceDescriptor, EvidenceMediaType } from '@sigilo/contracts';
import { MAX_EVIDENCE_BYTES } from '@sigilo/contracts';
import { randomBytes, sha256Hex, toDayDate, toHex } from '@sigilo/core';
import type { AppContext } from '../context.ts';
import type { EvidenceRepository } from '../db/evidence-repository.ts';
import { ApiFailure } from '../http/errors.ts';
import type { EvidenceStore } from '../storage/evidence-store.ts';

const MAGIC_BYTES: Record<EvidenceMediaType, readonly number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_BATCH = 100;

/** Antigüedad mínima de una prueba pendiente para purgarla. */
export const PENDING_EVIDENCE_TTL_MS = DAY_MS;

/** Cada cuánto se purgan las pruebas pendientes vencidas. */
export const EVIDENCE_PURGE_INTERVAL_MS = 60 * 60 * 1000;

/** Cuota total de almacenamiento de pruebas por omisión: 5 GiB. */
export const DEFAULT_EVIDENCE_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;

/** Días que se conservan las pruebas de una denuncia que la autoridad no ha atendido. */
export const DEFAULT_EVIDENCE_RETENTION_DAYS = 30;

/** Parte de la cuota que pueden ocupar las pruebas pendientes (subidas sin denuncia). */
export const PENDING_EVIDENCE_SHARE = 0.25;

/** Divisor de la cuota por denuncia: cada una puede ocupar a lo más 1/100 de la cuota. */
export const COMPLAINT_EVIDENCE_DIVISOR = 100;

/** Reparto de la cuota de pruebas en bytes. */
export interface EvidenceBudget {
  quota: number;
  /** Máximo de bytes pendientes en total. */
  pendingMax: number;
  /** Máximo de bytes por denuncia (nunca menos que una prueba de tamaño máximo). */
  perComplaint: number;
}

/** Calcula el reparto de una cuota total. */
export function evidenceBudget(quota: number): EvidenceBudget {
  return {
    quota,
    pendingMax: Math.floor(quota * PENDING_EVIDENCE_SHARE),
    perComplaint: Math.max(MAX_EVIDENCE_BYTES, Math.floor(quota / COMPLAINT_EVIDENCE_DIVISOR)),
  };
}

/** Reparto vigente según la configuración de la aplicación. */
export function budgetOf(ctx: AppContext): EvidenceBudget {
  return evidenceBudget(ctx.deps.evidenceQuotaBytes ?? DEFAULT_EVIDENCE_QUOTA_BYTES);
}

/** Indica si los primeros bytes corresponden a la firma del tipo declarado. */
export function hasMagicBytes(bytes: Uint8Array, mediaType: EvidenceMediaType): boolean {
  const magic = MAGIC_BYTES[mediaType];
  return bytes.length > magic.length && magic.every((byte, index) => bytes[index] === byte);
}

/** Dependencias de la retención. */
export interface EvidenceRetentionStoreDeps {
  evidence: EvidenceRepository;
  evidenceStore: EvidenceStore;
}

/**
 * Guarda una prueba pendiente (sin denuncia asociada) y devuelve su descriptor.
 * Seguridad: el tipo declarado debe coincidir con los bytes reales; así el visor de la autoridad
 * solo recibe imágenes. Nunca se borran pruebas ya asociadas a una denuncia para hacer sitio: si
 * no cabe, se rechaza la subida, porque no aceptar más es preferible a perder pruebas de
 * corrupción. Lanza `unsupported_media_type` si el tipo no coincide y `storage_full` si las
 * pendientes ya ocupan su parte o si la cuota total se excedería.
 */
export function storeEvidence(
  ctx: AppContext,
  bytes: Uint8Array,
  mediaType: EvidenceMediaType,
): EvidenceDescriptor {
  if (!hasMagicBytes(bytes, mediaType)) throw new ApiFailure('unsupported_media_type');
  const budget = budgetOf(ctx);
  if (ctx.evidence.pendingStoredBytes() + bytes.length > budget.pendingMax) {
    throw new ApiFailure('storage_full');
  }
  if (ctx.evidence.totalStoredBytes() + bytes.length > budget.quota) {
    throw new ApiFailure('storage_full');
  }
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

/** Dependencias de la retención de pruebas de denuncias sin atender. */
export interface UnattendedRetentionDeps extends EvidenceRetentionStoreDeps {
  now: () => Date;
  /** Días tras la recepción (`DEFAULT_EVIDENCE_RETENTION_DAYS`); 0 desactiva la retención. */
  retentionDays: number;
}

/**
 * Política de retención: borra los archivos de las pruebas de denuncias recibidas hace más de
 * `retentionDays` días que la autoridad no ha atendido (siguen en `received`). Devuelve cuántos
 * archivos borró. Con `retentionDays = 0` no hace nada.
 * Seguridad: protege el almacenamiento de envíos masivos que nadie atiende. Que la persona
 * denunciante consulte su seguimiento ya no exime, porque un atacante puede consultar las suyas.
 * Para conservar las pruebas, la autoridad debe atender la denuncia o moverla a `routing`. No
 * toca la denuncia, sus descriptores (con los que se recalculan los digestos) ni la bitácora: el
 * registro queda marcado como no guardado y la autoridad recibe `not_found` al pedir el archivo.
 */
export function purgeUnattendedEvidence(deps: UnattendedRetentionDeps): number {
  if (deps.retentionDays <= 0) return 0;
  const cutoffDay = toDayDate(new Date(deps.now().getTime() - deps.retentionDays * DAY_MS));
  let purged = 0;
  for (;;) {
    const batch = deps.evidence.listUnattendedStored(cutoffDay, RETENTION_BATCH);
    if (batch.length === 0) return purged;
    for (const item of batch) {
      deps.evidence.markUnstored(item.evidenceId);
      deps.evidenceStore.remove(item.evidenceId);
      purged += 1;
    }
  }
}

/**
 * Día en que la retención borra las pruebas de una denuncia recibida el `receivedOn` si sigue sin
 * atender: la purga borra las recibidas antes de hoy menos `retentionDays`, es decir, a partir de
 * `receivedOn + retentionDays + 1`. Devuelve `null` con la retención desactivada.
 */
export function evidenceDeletionDay(receivedOn: string, retentionDays: number): string | null {
  if (retentionDays <= 0) return null;
  return toDayDate(new Date(Date.parse(`${receivedOn}T00:00:00Z`) + (retentionDays + 1) * DAY_MS));
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
