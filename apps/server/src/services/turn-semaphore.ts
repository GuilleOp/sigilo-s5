// Semáforo de turnado de la bandeja del S5 en el nodo: el día en que la denuncia entró a su estado
// y la situación vista con el reloj del servidor (`ctx.deps.now()`, el simulado en la demo).
import { turnWaitFor } from '@sigilo/contracts';
import type { ComplaintSummary, ProcedureAction, TurnSemaphore } from '@sigilo/contracts';
import { evaluateTurnSemaphore, toMexicoCentralDay } from '@sigilo/core';
import type { AppContext } from '../context.ts';
import type { ComplaintRecord, ListedComplaint } from '../db/complaints-repository.ts';
import type { StoredStep } from '../db/procedure-repository.ts';

/** Pasos que dejan la denuncia esperando turno o aceptación (el mismo filtro que el listado). */
const ENTRY_ACTIONS: ReadonlySet<ProcedureAction> = new Set([
  'received',
  'routed',
  'reassigned',
  'returned_to_inbox',
]);

/**
 * Día legal desde el que la denuncia espera turno o aceptación, o `null` si su estado no espera:
 * el del último paso que la dejó en el buzón, turnada o reasignada (la recepción si no hay pasos).
 */
export function turnPendingSince(
  complaint: ComplaintRecord,
  steps: readonly StoredStep[],
): string | null {
  if (turnWaitFor(complaint.managementState) === null) return null;
  const entry = steps.filter((step) => ENTRY_ACTIONS.has(step.action)).at(-1);
  return entry?.legalOn ?? complaint.receivedLegalOn;
}

/** Semáforo con el día de hoy del nodo, o `null` si no aplica o el día sale del calendario. */
function evaluate(ctx: AppContext, summary: ComplaintSummary, sinceOn: string) {
  const state = summary.managementState ?? 'received_in_inbox';
  try {
    return evaluateTurnSemaphore(state, sinceOn, toMexicoCentralDay(ctx.deps.now()));
  } catch {
    // Fuera del calendario de días inhábiles no se puede contar en días hábiles: sin semáforo.
    return null;
  }
}

function withSemaphore(summary: ComplaintSummary, semaphore: TurnSemaphore | null) {
  return semaphore === null ? summary : { ...summary, turnSemaphore: semaphore };
}

/** Resumen del listado con su semáforo de turnado, si espera turno o aceptación. */
export function listedWithSemaphore(ctx: AppContext, listed: ListedComplaint): ComplaintSummary {
  return withSemaphore(listed.summary, evaluate(ctx, listed.summary, listed.stateSinceOn));
}

/** Resumen del detalle con su semáforo de turnado, si espera turno o aceptación. */
export function summaryWithSemaphore(
  ctx: AppContext,
  complaint: ComplaintRecord,
  summary: ComplaintSummary,
): ComplaintSummary {
  const sinceOn = turnPendingSince(complaint, ctx.procedure.listSteps(complaint.folio));
  return sinceOn === null ? summary : withSemaphore(summary, evaluate(ctx, summary, sinceOn));
}
