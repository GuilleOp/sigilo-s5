// Escalamiento a la autoridad supervisora (segunda llave, ADR 0007): listado de las denuncias
// escaladas y entrega del sobre de escalamiento, solo cuando una regla pública se cumplió.
import type { EscalationDelivery, EscalationSummary } from '@sigilo/contracts';
import { sealedIdentityDigest } from '@sigilo/core';
import type { AppContext } from '../context.ts';
import { ApiFailure } from '../http/errors.ts';
import { logSecurityEvent } from '../security/authority-auth.ts';
import type { AuthorityAccount } from '../security/authority-registry.ts';
import { ruleTriggerView } from './procedure-view.ts';

/** Indica si la cuenta es de supervisión de la autoridad que custodia la segunda llave. */
function isSupervisor(ctx: AppContext, account: AuthorityAccount): boolean {
  return (
    account.function === 'supervision' &&
    account.authorityId === ctx.authorities.supervisorAuthorityId
  );
}

/** Indica si una regla de escalamiento entregó la denuncia a la autoridad de la cuenta. */
export function isEscalatedTo(ctx: AppContext, account: AuthorityAccount, folio: string): boolean {
  return (
    isSupervisor(ctx, account) &&
    ctx.procedure
      .listRuleTriggers(folio)
      .some(
        (trigger) => trigger.effect === 'escalate' && trigger.supervisorId === account.authorityId,
      )
  );
}

/**
 * Denuncias escaladas a la autoridad de la cuenta, sin contenido, de las más recientes a las más
 * antiguas. Lanza `forbidden` si la cuenta no es de supervisión de la autoridad supervisora.
 */
export function listEscalations(ctx: AppContext, account: AuthorityAccount): EscalationSummary[] {
  if (!isSupervisor(ctx, account)) throw new ApiFailure('forbidden');
  const byFolio = new Map<string, EscalationSummary>();
  for (const trigger of ctx.procedure.listEscalationsFor(account.authorityId)) {
    const existing = byFolio.get(trigger.folio);
    const view = ruleTriggerView(trigger);
    if (existing === undefined) {
      byFolio.set(trigger.folio, {
        folio: trigger.folio,
        escalatedOn: trigger.triggeredOn,
        fromAuthorityId: trigger.authorityId,
        rules: [view],
      });
    } else {
      existing.rules.push(view);
      if (trigger.triggeredOn < existing.escalatedOn) existing.escalatedOn = trigger.triggeredOn;
    }
  }
  return [...byFolio.values()];
}

/**
 * Entrega el sobre de escalamiento de una denuncia escalada a la autoridad de la cuenta, con lo
 * necesario para verificarlo. Cada entrega queda en el registro de seguridad.
 * Lanza `forbidden` si la cuenta no es de supervisión de la supervisora y `not_found` si la
 * denuncia no existe, no se escaló a ella o no trae segunda llave (sin distinguirlos).
 * Seguridad: el nodo no puede leer el sobre; antes de que se cumpla una regla no lo entrega
 * (ADR 0007, riesgo de entrega anticipada).
 */
export function deliverEscalationEnvelope(
  ctx: AppContext,
  account: AuthorityAccount,
  folio: string,
): EscalationDelivery {
  if (!isSupervisor(ctx, account)) throw new ApiFailure('forbidden');
  const complaint = ctx.complaints.find(folio);
  const triggers = ctx.procedure
    .listRuleTriggers(folio)
    .filter(
      (trigger) => trigger.effect === 'escalate' && trigger.supervisorId === account.authorityId,
    );
  const envelope = complaint?.escalationEnvelope ?? null;
  if (complaint === null || envelope === null || triggers.length === 0) {
    throw new ApiFailure('not_found');
  }
  const received = ctx.ledgerRepository.findByPayloadDigest(
    'complaint.received',
    complaint.receipt.payloadDigest,
  );
  logSecurityEvent(ctx, 'escalation_envelope_released', account.accountId, folio);
  return {
    folio,
    escalationEnvelope: envelope,
    authVerifier: complaint.authVerifier,
    reporterKeys: complaint.reporterKeys,
    ...(complaint.sealedIdentity === null
      ? {}
      : { sealedIdentityDigest: sealedIdentityDigest(complaint.sealedIdentity) }),
    ...(complaint.corroborationDigest === null
      ? {}
      : { corroborationDigest: complaint.corroborationDigest }),
    ...(received === null ? {} : { receivedEventSeq: received.seq }),
    rules: triggers.map(ruleTriggerView),
  };
}
