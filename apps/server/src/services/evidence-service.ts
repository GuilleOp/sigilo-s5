// Recepción de pruebas cifradas de extremo a extremo: verificación del formato del contenedor (el
// nodo no puede abrirlo), reparto de la cuota de almacenamiento (pendientes y por denuncia),
// retención de las pruebas de denuncias sin atender o archivadas, descarte por la autoridad, purga
// de las pendientes que nunca se asociaron, anclaje de sus digestos en la bitácora al recibirlas,
// llaves re-cifradas hacia otras autoridades del nodo y entrega de la custodia al turnar.
import type {
  EvidenceDescriptor,
  EvidenceKeyGrant,
  EvidenceMediaType,
  TransferReceiptRequest,
} from '@sigilo/contracts';
import { MAX_EVIDENCE_BYTES } from '@sigilo/contracts';
import {
  evidenceReceivedPayload,
  parseEvidenceContainer,
  randomBytes,
  sha256Hex,
  toDayDate,
  toHex,
} from '@sigilo/core';
import type { AppContext } from '../context.ts';
import { withTransaction } from '../db/database.ts';
import type { EvidenceRepository } from '../db/evidence-repository.ts';
import { ApiFailure } from '../http/errors.ts';
import type { PowReceipt } from '../security/proof-of-work.ts';
import type { EvidenceStore } from '../storage/evidence-store.ts';

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

/**
 * Margen tras el vencimiento de un reto para purgar las pruebas que subió y siguen sin denuncia:
 * cubre la renovación del reto y el reintento del envío, que reutiliza los descriptores.
 */
export const CHALLENGE_UPLOADS_GRACE_MS = 30 * 60 * 1000;

/** Máximo de retos cuyas subidas se recuerdan; al llenarse se olvidan los más viejos. */
export const MAX_TRACKED_CHALLENGES = 100_000;

const CHALLENGE_SWEEP_INTERVAL_MS = 60 * 1000;

/**
 * Pruebas que subió cada reto, solo en memoria y hasta que el reto vence más el margen.
 * Seguridad: no se guarda nada en disco que ligue pruebas entre sí; reiniciar el proceso las
 * olvida y entonces solo queda la purga diaria de pendientes como respaldo.
 */
export interface ChallengeUploads {
  record(receipt: PowReceipt, evidenceId: string): void;
  /**
   * Saca y devuelve las pruebas de los retos vencidos hace más del margen. Barre a lo más una vez
   * por minuto.
   */
  takeExpired(time: number): string[];
}

/** Crea el registro en memoria de las pruebas por reto. */
export function createChallengeUploads(
  graceMs: number = CHALLENGE_UPLOADS_GRACE_MS,
  maxChallenges: number = MAX_TRACKED_CHALLENGES,
): ChallengeUploads {
  const byChallenge = new Map<string, { purgeAt: number; evidenceIds: string[] }>();
  let lastSweepAt = Number.NEGATIVE_INFINITY;
  return {
    record: (receipt, evidenceId) => {
      let entry = byChallenge.get(receipt.challengeId);
      if (entry === undefined) {
        // El mapa conserva el orden de inserción: se olvida primero el reto más viejo.
        if (byChallenge.size >= maxChallenges) {
          const oldest = byChallenge.keys().next();
          if (oldest.done !== true) byChallenge.delete(oldest.value);
        }
        entry = { purgeAt: receipt.expiresAt + graceMs, evidenceIds: [] };
        byChallenge.set(receipt.challengeId, entry);
      }
      entry.evidenceIds.push(evidenceId);
    },
    takeExpired: (time) => {
      if (time - lastSweepAt < CHALLENGE_SWEEP_INTERVAL_MS) return [];
      lastSweepAt = time;
      const expired: string[] = [];
      for (const [challengeId, entry] of byChallenge) {
        if (entry.purgeAt > time) continue;
        byChallenge.delete(challengeId);
        expired.push(...entry.evidenceIds);
      }
      return expired;
    },
  };
}

/**
 * Purga las pruebas pendientes de los retos que vencieron sin denuncia (más el margen) y devuelve
 * cuántas borró. Las que ya se asociaron a una denuncia no se tocan.
 */
export function purgeExpiredChallengeUploads(ctx: AppContext): number {
  let purged = 0;
  for (const evidenceId of ctx.challengeUploads.takeExpired(ctx.deps.now().getTime())) {
    if (ctx.evidence.deletePending(evidenceId)) {
      ctx.deps.evidenceStore.remove(evidenceId);
      purged += 1;
    }
  }
  return purged;
}

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

/**
 * Compromiso del contenido de un contenedor cifrado, o `null` si los bytes no tienen el formato.
 * El nodo no puede comprobar el tipo real de la imagen (va cifrada): lo comprueba el navegador de
 * la autoridad al abrirla, antes de mostrarla.
 */
export function evidenceCommitmentOf(bytes: Uint8Array): string | null {
  return parseEvidenceContainer(bytes)?.commitment ?? null;
}

/** Dependencias de la retención. */
export interface EvidenceRetentionStoreDeps {
  evidence: EvidenceRepository;
  evidenceStore: EvidenceStore;
}

/**
 * Guarda una prueba pendiente (sin denuncia asociada) y devuelve su descriptor. `consumeProof`
 * gasta el uso del reto solo cuando la prueba ya es válida y cabe; si devuelve un reto, la prueba
 * se anota en `challengeUploads` para purgarla si el reto vence sin denuncia.
 * Seguridad: solo se aceptan contenedores cifrados en el navegador hacia la autoridad (ver
 * `sealEvidence`); el nodo guarda el contenedor, su tipo declarado, su tamaño, su digesto y el
 * compromiso de su cabecera, y nunca ve la imagen. Nunca se borran pruebas ya asociadas a una
 * denuncia para hacer sitio: si no cabe, se rechaza la subida, porque no aceptar más es
 * preferible a perder pruebas de corrupción. Antes de medir la cuota se purgan las pendientes de
 * retos vencidos. Lanza `unsupported_media_type` si no es un contenedor cifrado y `storage_full`
 * si las pendientes ya ocupan su parte o si la cuota total se excedería.
 */
export function storeEvidence(
  ctx: AppContext,
  bytes: Uint8Array,
  mediaType: EvidenceMediaType,
  consumeProof: () => PowReceipt | null = () => null,
): EvidenceDescriptor {
  const commitment = evidenceCommitmentOf(bytes);
  if (commitment === null) throw new ApiFailure('unsupported_media_type');
  purgeExpiredChallengeUploads(ctx);
  const budget = budgetOf(ctx);
  if (ctx.evidence.pendingStoredBytes() + bytes.length > budget.pendingMax) {
    throw new ApiFailure('storage_full');
  }
  if (ctx.evidence.totalStoredBytes() + bytes.length > budget.quota) {
    throw new ApiFailure('storage_full');
  }
  const receipt = consumeProof();
  const descriptor: EvidenceDescriptor = {
    evidenceId: toHex(randomBytes(16)),
    mediaType,
    sha256: sha256Hex(bytes),
    sizeBytes: bytes.length,
  };
  ctx.deps.evidenceStore.write(descriptor.evidenceId, bytes);
  try {
    ctx.evidence.insertPending(descriptor, toDayDate(ctx.deps.now()), commitment);
  } catch (error) {
    ctx.deps.evidenceStore.remove(descriptor.evidenceId);
    throw error;
  }
  if (receipt !== null) ctx.challengeUploads.record(receipt, descriptor.evidenceId);
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
 * `retentionDays` días que la autoridad no ha atendido (siguen en `received`) o que archivó
 * (`archived`). Devuelve cuántos archivos borró. Con `retentionDays = 0` no hace nada.
 * Seguridad: protege el almacenamiento de envíos masivos que nadie atiende. Que la persona
 * denunciante consulte su seguimiento ya no exime, porque un atacante puede consultar las suyas.
 * Archivar el spam tampoco exime: si lo hiciera, la cuota quedaría ocupada para siempre. Las
 * pruebas se conservan mientras la denuncia está en trámite (`routing` en adelante, salvo
 * `archived`); para liberar el espacio antes, la autoridad usa `discardEvidence`. No toca la
 * denuncia, sus descriptores (con los que se recalculan los digestos) ni la bitácora: el registro
 * queda marcado como no guardado y la autoridad recibe `not_found` al pedir el archivo.
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
 * Descarta los archivos de las pruebas guardadas de una denuncia (acción de la autoridad, por
 * ejemplo ante spam) y devuelve cuántos borró; si no queda ninguno, devuelve 0 sin registrar nada.
 * En una sola transacción marca las pruebas como no guardadas, registra `evidence.discarded` en la
 * bitácora con el folio y la cantidad, y anota el descarte para el seguimiento; los archivos se
 * borran después de confirmarla.
 * Seguridad: los descriptores se conservan (los digestos siguen verificables) y el descarte queda
 * a la vista de la persona denunciante y en la bitácora pública: la autoridad no puede borrar
 * pruebas en silencio.
 */
export function discardEvidence(ctx: AppContext, folio: string, actorId: string): number {
  const discarded = withTransaction(ctx.deps.db, () => {
    const evidenceIds = ctx.evidence.listStoredIdsForFolio(folio);
    if (evidenceIds.length === 0) return evidenceIds;
    const { at: discardedOn } = ctx.ledger.record({
      type: 'evidence.discarded',
      folio,
      at: toDayDate(ctx.deps.now()),
      actorRole: 'authority',
      // Seguridad: como en los cambios de estatus, un identificador aleatorio hace único el
      // digesto y el folio impide adivinarlo probando cantidades.
      payload: {
        folio,
        count: evidenceIds.length,
        discardId: toHex(randomBytes(16)),
        actor: actorId,
      },
    });
    for (const evidenceId of evidenceIds) ctx.evidence.markUnstored(evidenceId);
    ctx.evidence.insertDiscard(folio, discardedOn, evidenceIds.length);
    return evidenceIds;
  });
  for (const evidenceId of discarded) ctx.deps.evidenceStore.remove(evidenceId);
  return discarded.length;
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

/**
 * Ancla en la bitácora las pruebas que la denuncia acaba de asociar: registra `evidence.received`
 * con el folio y, por prueba, el digesto del contenedor y el compromiso del contenido, y lo agrega
 * a la cadena de custodia. Sin pruebas no registra nada. Debe llamarse dentro de la transacción
 * de la recepción.
 * Seguridad: el evento solo publica el digesto de esos datos, que incluyen el folio (60 bits
 * secretos), así que nadie fuera puede adivinarlo; la autoridad lo recalcula desde el detalle y lo
 * compara con lo que descifra. El compromiso es salado: tampoco sirve para confirmar una imagen.
 */
export function anchorReceivedEvidence(ctx: AppContext, folio: string): void {
  const items = ctx.evidence.listCustodyItems(folio);
  if (items.length === 0) return;
  const event = ctx.ledger.record({
    type: 'evidence.received',
    folio,
    at: toDayDate(ctx.deps.now()),
    actorRole: 'system',
    payload: evidenceReceivedPayload(folio, items),
  });
  ctx.evidence.insertCustodyEvent(folio, {
    type: 'evidence.received',
    on: event.at,
    payloadDigest: event.payloadDigest,
  });
}

/**
 * Guarda las llaves de los archivos de prueba que el navegador de la autoridad competente
 * re-cifró hacia otra autoridad de este nodo (antes de turnarla o reasignarla) y devuelve
 * cuántas guardó. `keyIdOf` da el `keyId` publicado de una autoridad del nodo, o `null`.
 * Lanza `bad_request` si una prueba no es de la denuncia o ya no está guardada, si la autoridad
 * destino no es de este nodo o si el sobre no va hacia su llave.
 * Seguridad: el nodo no puede abrir las llaves; solo comprueba que el sobre vaya hacia la llave
 * publicada de la autoridad destino. El AAD liga el folio, la autoridad y el compromiso de cada
 * archivo, así que una llave no sirve para otra prueba ni para otra autoridad.
 */
export function grantEvidenceKeys(
  ctx: AppContext,
  folio: string,
  grants: readonly EvidenceKeyGrant[],
  keyIdOf: (authorityId: string) => string | null,
): number {
  const stored = new Set(ctx.evidence.listStoredIdsForFolio(folio));
  for (const grant of grants) {
    const expectedKeyId = keyIdOf(grant.authorityId);
    if (!stored.has(grant.evidenceId) || expectedKeyId !== grant.envelope.keyId) {
      throw new ApiFailure('bad_request');
    }
  }
  const on = toDayDate(ctx.deps.now());
  withTransaction(ctx.deps.db, () => {
    for (const grant of grants) ctx.evidence.upsertKeyGrant(grant, on);
  });
  return grants.length;
}

/** Turnado cuyo comprobante llegó: de qué nodo a qué nodo y autoridad pasó la denuncia. */
export interface CustodyHandover {
  transferId: string;
  fromNodeId: string;
  toNodeId: string;
  toAuthorityId: string;
  actorId: string;
}

/**
 * Entrega de custodia: cuando el nodo destino confirma con su comprobante firmado que recibió la
 * denuncia con sus pruebas (sus digestos van en el digesto del envío que firma), el origen
 * registra `evidence.custody_transferred` con los digestos de sus copias y de las del destino, y
 * marca sus copias como no guardadas. Devuelve los identificadores cuyos archivos hay que borrar
 * después de confirmar la transacción. Debe llamarse dentro de la transacción de la confirmación.
 * Seguridad: queda una sola copia viva, la del destino. Sin comprobante (el destino no respondió
 * o el turnado venció) nada se borra y el origen conserva sus copias. El evento nunca lleva el
 * contenido: solo digestos, compromisos y los nodos y autoridades.
 */
export function handOverEvidenceCustody(
  ctx: AppContext,
  folio: string,
  handover: CustodyHandover,
  receipt: TransferReceiptRequest,
): string[] {
  const storedIds = ctx.evidence.listStoredIdsForFolio(folio);
  if (storedIds.length === 0) return [];
  const items = ctx.evidence.listCustodyItems(folio).filter((item) => item.isStored);
  const event = ctx.ledger.record(
    {
      type: 'evidence.custody_transferred',
      folio,
      at: toDayDate(ctx.deps.now()),
      actorRole: 'authority',
      payload: {
        folio,
        transferId: handover.transferId,
        fromNodeId: handover.fromNodeId,
        toNodeId: handover.toNodeId,
        toAuthorityId: handover.toAuthorityId,
        targetFolio: receipt.receipt.folio,
        evidence: items.map(({ evidenceId, sha256, commitment }) => ({
          evidenceId,
          sha256,
          commitment,
        })),
        targetEvidence: receipt.request.evidence.map(({ sha256 }) => sha256),
        actor: handover.actorId,
      },
    },
    { isExemptFromDailyCap: true },
  );
  ctx.evidence.insertCustodyEvent(folio, {
    type: 'evidence.custody_transferred',
    on: event.at,
    payloadDigest: event.payloadDigest,
    toNodeId: handover.toNodeId,
    toAuthorityId: handover.toAuthorityId,
  });
  for (const evidenceId of storedIds) ctx.evidence.markUnstored(evidenceId);
  return storedIds;
}
