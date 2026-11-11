// Motor de plazos y escalamiento (ADR 0007): evalúa las reglas públicas de `ESCALATION_RULES` sobre
// cada denuncia y registra en la bitácora las que se cumplen. Una regla de escalamiento deja la
// denuncia disponible para la autoridad supervisora, que recibe la segunda llave.
import { ESCALATION_RULES_VERSION, findEscalationRule } from '@sigilo/contracts';
import {
  evaluateEscalationRules,
  randomBytes,
  toDayDate,
  toHex,
  toMexicoCentralDay,
} from '@sigilo/core';
import type { AppContext } from '../context.ts';
import { withTransaction } from '../db/database.ts';
import { assignedAuthorityOf } from './procedure-service.ts';
import { procedureSnapshot } from './procedure-view.ts';

/** Reglas registradas por una corrida del motor. */
export interface RulesRunResult {
  evaluated: number;
  triggered: number;
  escalated: number;
}

/**
 * Evalúa las reglas de todas las denuncias que aún pueden cumplir alguna y registra cada regla
 * nueva una sola vez por denuncia y día de inicio (`rule.triggered`, actor `system`, exento del
 * tope diario). Lo llama la tarea programada; es idempotente.
 * Seguridad: las reglas son públicas y solo usan datos del trámite, así que cualquiera con los
 * mismos datos obtiene el mismo resultado; el evento no lleva contenido de la denuncia. Si una
 * denuncia no se puede evaluar (por ejemplo, un plazo fuera del calendario), se omite sin
 * detener a las demás.
 */
export function runEscalationRules(ctx: AppContext): RulesRunResult {
  const now = ctx.deps.now();
  const today = toMexicoCentralDay(now);
  const result: RulesRunResult = { evaluated: 0, triggered: 0, escalated: 0 };
  for (const folio of ctx.complaints.listFoliosForRules()) {
    const complaint = ctx.complaints.find(folio);
    if (complaint === null) continue;
    result.evaluated += 1;
    let triggered;
    try {
      triggered = evaluateEscalationRules(procedureSnapshot(ctx, complaint), today);
    } catch {
      continue;
    }
    const authorityId = assignedAuthorityOf(ctx, complaint);
    const known = new Set(
      ctx.procedure.listRuleTriggers(folio).map((item) => `${item.ruleKey}|${item.anchorOn}`),
    );
    for (const rule of triggered) {
      if (known.has(`${rule.key}|${rule.anchorOn}`)) continue;
      // Si la autoridad ya no es de este nodo (turnada a otro), la supervisora del nodo (H1). Una
      // alerta para supervisión (turnado vencido) también la registra, pero sin sobre: la entrega
      // de la segunda llave sigue exigiendo una regla `escalate`.
      const isForSupervisor =
        rule.effect === 'escalate' || findEscalationRule(rule.key)?.notifiesSupervisor === true;
      const supervisorId = isForSupervisor
        ? (ctx.authorities.supervisorOf(authorityId) ?? ctx.authorities.supervisorAuthorityId)
        : null;
      withTransaction(ctx.deps.db, () => {
        const event = ctx.ledger.record(
          {
            type: 'rule.triggered',
            folio,
            at: toDayDate(now),
            actorRole: 'system',
            payload: {
              folio,
              ruleKey: rule.key,
              rulesVersion: ESCALATION_RULES_VERSION,
              effect: rule.effect,
              anchorOn: rule.anchorOn,
              dueOn: rule.dueOn,
              triggerId: toHex(randomBytes(16)),
              ...(supervisorId === null ? {} : { supervisorId }),
            },
          },
          { isExemptFromDailyCap: true },
        );
        ctx.procedure.insertRuleTrigger({
          folio,
          ruleKey: rule.key,
          anchorOn: rule.anchorOn,
          triggeredOn: event.at,
          dueOn: rule.dueOn,
          effect: rule.effect,
          authorityId,
          supervisorId,
        });
      });
      result.triggered += 1;
      if (rule.effect === 'escalate' && supervisorId !== null) result.escalated += 1;
    }
  }
  return result;
}
