// Turnado a una autoridad de otro nodo (ADR 0005, SEC-19). El navegador de la autoridad que tiene
// la denuncia la descifra y la vuelve a cifrar hacia el nodo destino; el servidor solo transporta el
// sobre al enrutador ciego y registra el turnado en la bitácora. La competencia sigue en el origen
// hasta que llega el comprobante del destino ligado a esta misma denuncia (H1); entonces se cede y
// se avisa a quien denunció. Sin comprobante en 10 días hábiles, el turnado vence y se escala.
import { hasFunction, NETWORK_ROUTES, RelayResponseSchema } from '@sigilo/contracts';
import type {
  TransferComplaintRequest,
  TransferComplaintResponse,
  TransferReceiptRequest,
} from '@sigilo/contracts';
import {
  canonicalize,
  computeDueDate,
  computeSubmissionDigest,
  fromBase64Url,
  randomBytes,
  sha256Hex,
  toDayDate,
  toHex,
  toMexicoCentralDay,
  verifyReceipt,
} from '@sigilo/core';
import type { AppContext } from '../context.ts';
import type { ComplaintRecord } from '../db/complaints-repository.ts';
import type { StoredTransfer } from '../db/integration-repository.ts';
import { withTransaction } from '../db/database.ts';
import { ApiFailure } from '../http/errors.ts';
import { directoryAuthority } from '../network/network-context.ts';
import type { AuthorityAccount } from '../security/authority-registry.ts';
import { isCompetent } from './procedure-service.ts';

/**
 * Transporta al enrutador el sobre que la autoridad ya re-cifró hacia el nodo destino y registra
 * `complaint.transferred` con los digestos. La denuncia deja de estar en este nodo: nadie aquí la
 * ve después. Devuelve la respuesta del enrutador, que solo abre el navegador que turnó.
 * Lanza `conflict` si el nodo no está en una red con enrutador, `forbidden` si la cuenta no es de
 * recepción y turnado, `not_found` si la denuncia es de otra autoridad y `bad_request` si el
 * destino no es una autoridad de otro nodo o el sobre no va hacia ella.
 * Seguridad: el servidor no puede abrir el sobre; ni siquiera sabe qué contiene.
 */
export async function transferComplaint(
  ctx: AppContext,
  account: AuthorityAccount,
  folio: string,
  request: TransferComplaintRequest,
): Promise<TransferComplaintResponse> {
  const network = ctx.deps.network;
  if (network === undefined || network.routerUrl === null) throw new ApiFailure('conflict');
  if (!hasFunction(account, 'intake')) throw new ApiFailure('forbidden');
  const complaint = ctx.complaints.find(folio);
  if (complaint === null || !isCompetent(ctx, account, complaint)) {
    throw new ApiFailure('not_found');
  }
  if (complaint.managementState === 'closed') throw new ApiFailure('conflict');
  // Un turnado a la vez: mientras uno espera su comprobante, no se manda otro.
  if (pendingTransferOf(ctx, folio) !== null) throw new ApiFailure('conflict');
  const target = directoryAuthority(network, request.toAuthorityId);
  const isElsewhere = target !== undefined && target.nodeId !== network.nodeId;
  // El sobre v2 solo nombra el nodo; la autoridad va cifrada adentro hacia ese nodo.
  if (!isElsewhere || request.relay.node !== target.nodeId) {
    throw new ApiFailure('bad_request');
  }
  const response = await network.fetch(`${network.routerUrl}${NETWORK_ROUTES.relay}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request.relay),
  });
  if (!response.ok) throw new ApiFailure('internal');
  const relay = RelayResponseSchema.parse(await response.json());
  const transferId = toHex(randomBytes(16));
  const relayDigest = sha256Hex(canonicalize(request.relay.sealed));
  withTransaction(ctx.deps.db, () => {
    const now = ctx.deps.now();
    const { at: on } = ctx.ledger.record({
      type: 'complaint.transferred',
      folio,
      at: toDayDate(now),
      actorRole: 'authority',
      payload: {
        folio,
        transferId,
        toAuthorityId: target.id,
        toNodeId: target.nodeId,
        relayDigest,
        replyDigest: sha256Hex(canonicalize(relay.sealed)),
        actor: account.accountId,
      },
    });
    ctx.integration.insertTransfer(
      {
        transferId,
        folio,
        toAuthority: target.id,
        toNode: target.nodeId,
        transferredOn: on,
        relayDigest,
        actorId: account.accountId,
        targetFolio: null,
        note: request.note,
      },
      null,
    );
    // Seguridad (H1): la competencia no cambia aquí; solo con un comprobante válido.
  });
  return { relay, transferId };
}

/** Días hábiles que espera un turnado su comprobante antes de vencer (y escalarse). */
export const TRANSFER_CONFIRMATION_BUSINESS_DAYS = 10;

/** Fecha en que vence un turnado sin comprobante. */
function transferDueOn(transferredOn: string): string {
  return computeDueDate(transferredOn, {
    unit: 'business_days',
    amount: TRANSFER_CONFIRMATION_BUSINESS_DAYS,
  });
}

/**
 * Turnado de la denuncia que espera su comprobante y no ha vencido, o `null`. Uno vencido ya no
 * cede la competencia: la denuncia sigue en el origen y se puede turnar de nuevo.
 */
export function pendingTransferOf(ctx: AppContext, folio: string): StoredTransfer | null {
  const today = toDayDate(ctx.deps.now());
  return (
    ctx.integration
      .listTransfers(folio)
      .find((item) => item.targetFolio === null && today <= transferDueOn(item.transferredOn)) ??
    null
  );
}

/** Día del último turnado sin comprobante (pendiente o vencido), para la regla de escalamiento. */
export function unconfirmedTransferOn(ctx: AppContext, folio: string): string | null {
  const transfers = ctx.integration.listTransfers(folio);
  if (transfers.some((item) => item.targetFolio !== null)) return null;
  return transfers.at(-1)?.transferredOn ?? null;
}

/** Indica si el comprobante y la denuncia que lo acompaña son de esta misma denuncia. */
function isSameComplaint(
  complaint: ComplaintRecord,
  request: TransferReceiptRequest['request'],
  receipt: TransferReceiptRequest['receipt'],
): boolean {
  return (
    computeSubmissionDigest(request) === receipt.submissionDigest &&
    request.authVerifier === complaint.authVerifier &&
    canonicalize(request.reporterKeys) === canonicalize(complaint.reporterKeys) &&
    canonicalize(request.facts) === canonicalize(complaint.facts) &&
    request.mode === complaint.mode
  );
}

/**
 * Recibe el comprobante del nodo destino (que el navegador abrió en la respuesta) con la denuncia
 * que recibió. Lo verifica con la llave de ese nodo en el directorio, recalcula el digesto de la
 * denuncia y exige que coincida con el comprobante y que tenga el mismo recibo, las mismas llaves
 * y los mismos hechos: solo entonces cede la competencia y avisa a quien denunció con el folio
 * nuevo (su recibo de 8 palabras sirve allá). Solo lo puede entregar la autoridad que turnó, una
 * vez, antes de que el turnado venza.
 * Seguridad (H1): sin esa liga, quien turna podría ceder la denuncia con el comprobante de otra.
 */
export function confirmTransfer(
  ctx: AppContext,
  account: AuthorityAccount,
  folio: string,
  request: TransferReceiptRequest,
): void {
  const network = ctx.deps.network;
  const transfer = ctx.integration.findTransfer(request.transferId);
  const actor = transfer === null ? null : ctx.authorities.findAccount(transfer.actorId);
  const isOwn =
    transfer !== null &&
    transfer.folio === folio &&
    actor !== null &&
    actor.authorityId === account.authorityId;
  if (network === undefined || transfer === null || !isOwn) throw new ApiFailure('not_found');
  const isPending = pendingTransferOf(ctx, folio)?.transferId === transfer.transferId;
  if (transfer.targetFolio !== null || !isPending) throw new ApiFailure('conflict');
  const complaint = ctx.complaints.find(folio);
  if (complaint === null) throw new ApiFailure('not_found');
  const node = network.directory.nodes.find((item) => item.id === transfer.toNode);
  const isSigned =
    node !== undefined && verifyReceipt(request.receipt, fromBase64Url(node.signingPublicKey));
  if (!isSigned || !isSameComplaint(complaint, request.request, request.receipt)) {
    throw new ApiFailure('bad_request');
  }
  const nodeName = node?.name ?? transfer.toNode;
  withTransaction(ctx.deps.db, () => {
    try {
      ctx.integration.completeTransfer(
        transfer.transferId,
        request.receipt.folio,
        JSON.stringify(request.receipt),
      );
    } catch {
      // Índice único (to_node, target_folio): un comprobante no sirve para dos turnados.
      throw new ApiFailure('conflict');
    }
    const now = ctx.deps.now();
    const on = toDayDate(now);
    ctx.complaints.updateProcedure(folio, {
      status: 'routed',
      assignedAuthorityId: transfer.toAuthority,
      managementState: 'routed',
      legalStage: null,
      closureReason: null,
    });
    if (complaint.status !== 'routed') ctx.statusHistory.insert(folio, 'routed', on);
    ctx.procedure.insertStep(folio, {
      action: 'transferred',
      on: toDayDate(now),
      legalOn: toMexicoCentralDay(now),
      managementState: 'routed',
      legalStage: null,
      closureReason: null,
      authorityId: transfer.toAuthority,
      actorId: account.accountId,
      note: `${transfer.note === null ? '' : `${transfer.note} `}Tu denuncia continúa en ${nodeName} con el folio ${request.receipt.folio}. Usa las mismas 8 palabras para darle seguimiento allá.`,
    });
  });
}
