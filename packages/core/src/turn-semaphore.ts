// Semáforo de turnado de la bandeja del S5: cuánto lleva una denuncia sin turnarse (en el buzón
// general) o sin aceptarse (turnada o reasignada). Cálculo puro con días civiles en la hora del
// centro de México; los umbrales y la unidad vienen de `TURN_SEMAPHORE`.
import { TURN_SEMAPHORE, turnWaitFor } from '@sigilo/contracts';
import type { ManagementState, TurnSemaphore } from '@sigilo/contracts';
import { DEFAULT_BUSINESS_CALENDAR, computeDueDate, remainingDays } from './deadlines.ts';
import type { BusinessCalendar } from './deadlines.ts';

/**
 * Semáforo de una denuncia en el estado `state` desde el día `sinceOn`, visto el día `today`, o
 * `null` si el estado no espera turno ni aceptación. `elapsedDays` son los días (de la unidad de
 * `TURN_SEMAPHORE`) posteriores a `sinceOn` hasta `today`, inclusive: el mismo día es 0.
 * Lanza si un día en días hábiles sale del calendario de días inhábiles.
 */
export function evaluateTurnSemaphore(
  state: ManagementState,
  sinceOn: string,
  today: string,
  calendar: BusinessCalendar = DEFAULT_BUSINESS_CALENDAR,
): TurnSemaphore | null {
  const waitingFor = turnWaitFor(state);
  if (waitingFor === null) return null;
  const { unit, warningAfter, overdueAfter } = TURN_SEMAPHORE;
  const elapsedDays = today <= sinceOn ? 0 : remainingDays(sinceOn, today, unit, calendar);
  const status =
    elapsedDays >= overdueAfter
      ? 'vencida'
      : elapsedDays >= warningAfter
        ? 'por_vencer'
        : 'a_tiempo';
  return {
    waitingFor,
    status,
    sinceOn,
    elapsedDays,
    warningOn: computeDueDate(sinceOn, { unit, amount: warningAfter }, calendar),
    overdueOn: computeDueDate(sinceOn, { unit, amount: overdueAfter }, calendar),
  };
}
