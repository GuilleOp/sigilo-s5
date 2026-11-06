// Corroboración ciega en el nodo (ADR 0006 y 0010): al recibir una denuncia con etiqueta, el nodo
// (no el navegador) la registra firmada en el índice con un folio opaco; después consulta los avisos
// y guarda cuántas fuentes independientes coinciden, lo que sube la prioridad explicable. Si la
// denuncia está archivada cuando llega otra coincidencia, la marca como «posible nuevo indicio».
import {
  CorroborationStatusSchema,
  CORROBORATION_ROUTES,
  IndexNoticesPageSchema,
} from '@sigilo/contracts';
import type { SubmitComplaintRequest } from '@sigilo/contracts';
import {
  folioDigestFor,
  signIndexConfirmation,
  signIndexRegistration,
  signIndexWithdrawal,
  signNoticesRequest,
} from '@sigilo/corroboracion';
import { randomBytes, toDayDate, toHex } from '@sigilo/core';
import type { FetchLike } from '@sigilo/red';
import type { AppContext } from '../context.ts';
import { withTransaction } from '../db/database.ts';

/** Configuración del índice de coincidencias. */
export interface CorroborationConfig {
  /** Origen del índice (`http://indice:8792`). */
  indexUrl: string;
  /** Secreto del nodo (32 bytes o más) para el folio opaco; nunca sale del nodo. */
  nodeSecret: Uint8Array;
  fetch: FetchLike;
}

const REGISTRATION_BATCH = 100;

/** Motivo de la baja en el índice según el cierre, o `null` si el cierre no la pide. */
export function withdrawalReasonFor(reason: string): 'spam' | 'inadmissible' | 'duplicate' | null {
  if (reason === 'inadmissible') return 'inadmissible';
  if (reason === 'joined') return 'duplicate';
  return null;
}

/**
 * Pide al índice la baja firmada de la denuncia que se cerró como improcedente (spam incluido) o
 * acumulada (H3): deja de contar como fuente y el índice no acepta volver a registrarla. Si aún no
 * se registraba, ya no se registra. La baja se envía en la siguiente sincronización.
 */
export function requestIndexWithdrawal(
  ctx: AppContext,
  folio: string,
  reason: 'spam' | 'inadmissible' | 'duplicate',
): void {
  const registration = ctx.integration.findCorroborationRegistration(folio);
  if (registration === null) return;
  ctx.integration.requestCorroborationWithdrawal(folio, reason);
  if (!registration.registered) ctx.integration.markCorroborationWithdrawn(folio);
}

function isAccepted(ctx: AppContext, folio: string): boolean {
  return ctx.procedure.listSteps(folio).some((step) => step.action === 'accepted');
}

/** Hora redondeada hacia abajo a 10 minutos (`AAAA-MM-DDTHH:M0Z`), como la guarda el índice. */
export function tenMinuteDate(date: Date): string {
  const iso = date.toISOString();
  return `${iso.slice(0, 15)}0Z`;
}

/**
 * Deja pendiente el registro de la denuncia en el índice (dentro de la transacción de recepción).
 * No hace nada si la denuncia no trae etiqueta o si el nodo no tiene índice ni red configurados.
 */
export function queueCorroboration(
  ctx: AppContext,
  folio: string,
  request: SubmitComplaintRequest,
  entry: 'relay' | 'direct',
): void {
  const config = ctx.deps.corroboration;
  const corroboration = request.corroboration;
  if (config === undefined || corroboration === undefined || ctx.deps.network === undefined) {
    return;
  }
  ctx.integration.insertCorroborationRegistration({
    folio,
    epoch: corroboration.epoch,
    tag: corroboration.tag,
    similarity: corroboration.similarity,
    receivedAt: tenMinuteDate(ctx.deps.now()),
    entry,
    folioDigest: folioDigestFor(folio, config.nodeSecret),
    registered: false,
  });
}

function saveStatus(ctx: AppContext, raw: unknown): boolean {
  const status = CorroborationStatusSchema.parse(raw);
  const folio = ctx.integration.folioOfCorroborationDigest(status.folioDigest);
  if (folio === null) return false;
  const complaint = ctx.complaints.find(folio);
  if (complaint === null) return false;
  const previous = ctx.integration.lastCorroborationStatus(folio);
  const today = toDayDate(ctx.deps.now());
  const isArchived =
    complaint.managementState === 'closed' &&
    complaint.closureReason === 'insufficient_information';
  const grew = status.independentSources > (previous?.independentSources ?? 1);
  // LGRA, art. 100: una coincidencia nueva con una denuncia archivada es un posible nuevo indicio.
  const newIndicationOn = isArchived && grew ? today : (previous?.newIndicationOn ?? null);
  ctx.integration.insertCorroborationStatus(folio, {
    updatedOn: today,
    complaints: status.complaints,
    independentSources: status.independentSources,
    isPossibleCampaign: status.flags.includes('possible_campaign'),
    newIndicationOn,
  });
  return true;
}

/**
 * Registra en el índice las denuncias pendientes y consulta los avisos nuevos. Lo llama la tarea
 * periódica; si el índice no responde, lo intenta en la siguiente vuelta. Devuelve cuántos registros
 * y avisos procesó.
 * Seguridad: el índice recibe solo la etiqueta, el folio opaco (HMAC con el secreto del nodo), la
 * hora a 10 minutos, la entrada y el resumen difuso, firmados con la llave del nodo.
 */
export async function syncCorroboration(
  ctx: AppContext,
): Promise<{ registered: number; notices: number }> {
  const config = ctx.deps.corroboration;
  const network = ctx.deps.network;
  if (config === undefined || network === undefined) return { registered: 0, notices: 0 };
  const base = config.indexUrl.replace(/\/+$/u, '');
  const post = (path: string, body: unknown) =>
    config.fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  let registered = 0;
  for (const item of ctx.integration.listUnregisteredCorroborations(REGISTRATION_BATCH)) {
    const registration = signIndexRegistration(
      {
        nodeId: network.nodeId,
        epoch: item.epoch,
        tag: item.tag,
        folioDigest: item.folioDigest,
        receivedAt: item.receivedAt,
        entry: item.entry,
        similarity: item.similarity,
      },
      ctx.deps.keys.serverSigningPrivateKey,
    );
    const response = await post(CORROBORATION_ROUTES.indexRegistrations, registration);
    if (!response.ok) break;
    saveStatus(ctx, await response.json());
    ctx.integration.markCorroborationRegistered(item.folio);
    registered += 1;
  }
  const requestedAt = tenMinuteDate(ctx.deps.now());
  // Confirmación (H3): la denuncia cuenta para otras y ve su grupo solo cuando la autoridad la
  // aceptó; cada confirmación queda en la bitácora del nodo.
  for (const item of ctx.integration.listUnconfirmedCorroborations(REGISTRATION_BATCH)) {
    if (!isAccepted(ctx, item.folio)) continue;
    const confirmation = signIndexConfirmation(
      { nodeId: network.nodeId, folioDigest: item.folioDigest, requestedAt },
      ctx.deps.keys.serverSigningPrivateKey,
    );
    const response = await post(CORROBORATION_ROUTES.indexConfirmations, confirmation);
    if (!response.ok) break;
    withTransaction(ctx.deps.db, () => {
      ctx.integration.markCorroborationConfirmed(item.folio);
      ctx.ledger.record(
        {
          type: 'corroboration.confirmed',
          folio: item.folio,
          at: toDayDate(ctx.deps.now()),
          actorRole: 'system',
          payload: { folio: item.folio, confirmationId: toHex(randomBytes(16)) },
        },
        { isExemptFromDailyCap: true },
      );
    });
    saveStatus(ctx, await response.json());
  }
  // Bajas firmadas de las denuncias improcedentes o acumuladas.
  for (const item of ctx.integration.listPendingWithdrawals(REGISTRATION_BATCH)) {
    if (item.withdrawalReason === null || item.withdrawalReason === undefined) continue;
    const withdrawal = signIndexWithdrawal(
      {
        nodeId: network.nodeId,
        folioDigest: item.folioDigest,
        reason: item.withdrawalReason,
        requestedAt,
      },
      ctx.deps.keys.serverSigningPrivateKey,
    );
    const response = await post(CORROBORATION_ROUTES.indexWithdrawals, withdrawal);
    if (!response.ok) break;
    withTransaction(ctx.deps.db, () => {
      ctx.integration.markCorroborationWithdrawn(item.folio);
      ctx.ledger.record(
        {
          type: 'corroboration.withdrawn',
          folio: item.folio,
          at: toDayDate(ctx.deps.now()),
          actorRole: 'system',
          payload: {
            folio: item.folio,
            reason: item.withdrawalReason,
            withdrawalId: toHex(randomBytes(16)),
          },
        },
        { isExemptFromDailyCap: true },
      );
    });
  }
  const request = signNoticesRequest(
    {
      nodeId: network.nodeId,
      after: ctx.integration.corroborationCursor(),
      requestedAt,
    },
    ctx.deps.keys.serverSigningPrivateKey,
  );
  const response = await post(CORROBORATION_ROUTES.indexNotices, request);
  if (!response.ok) return { registered, notices: 0 };
  const page = IndexNoticesPageSchema.parse(await response.json());
  for (const notice of page.notices) saveStatus(ctx, notice.status);
  const last = page.notices.at(-1);
  if (last !== undefined) ctx.integration.setCorroborationCursor(last.seq);
  return { registered, notices: page.notices.length };
}
