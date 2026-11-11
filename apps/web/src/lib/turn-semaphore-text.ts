// Textos del semáforo de turnado de la bandeja del S5: nombre de la situación, su tono (con ícono,
// nunca solo color) y la frase de cuánto lleva la denuncia esperando turno o aceptación.
import { TURN_SEMAPHORE_STATUSES } from '@sigilo/contracts';
import type { TurnSemaphore, TurnSemaphoreStatus } from '@sigilo/contracts';
import type { StateTone } from '../components/a/StateTag.tsx';
import { formatDayDate } from './format.ts';

/** Tono de la píldora: palomita, advertencia o alto; cada uno con su ícono. */
export const TURN_SEMAPHORE_TONES: Readonly<Record<TurnSemaphoreStatus, StateTone>> = {
  a_tiempo: 'ok',
  por_vencer: 'warn',
  vencida: 'bad',
};

/** Nombre de la situación («A tiempo», «Por vencer», «Vencida»). */
export function turnSemaphoreName(status: TurnSemaphoreStatus): string {
  return TURN_SEMAPHORE_STATUSES.find((item) => item.key === status)?.name ?? status;
}

function days(count: number): string {
  return count === 1 ? '1 día hábil' : `${count} días hábiles`;
}

/** Frase corta para la bandeja: «2 días hábiles sin turnar». */
export function turnSemaphoreShort(semaphore: TurnSemaphore): string {
  const waiting = semaphore.waitingFor === 'routing' ? 'sin turnar' : 'sin aceptar';
  return semaphore.elapsedDays === 0
    ? `Menos de 1 día hábil ${waiting}`
    : `${days(semaphore.elapsedDays)} ${waiting}`;
}

/** Frase del detalle: desde cuándo espera, qué espera y cuándo vence. */
export function turnSemaphoreSentence(semaphore: TurnSemaphore): string {
  const what =
    semaphore.waitingFor === 'routing'
      ? 'Espera en el buzón general a que la turnen'
      : 'Espera a que la autoridad turnada la acepte';
  const since = `${what} desde el ${formatDayDate(semaphore.sinceOn)}`;
  if (semaphore.status === 'vencida') {
    return `${since}: lleva ${days(semaphore.elapsedDays)} y venció el ${formatDayDate(semaphore.overdueOn)}. La supervisión recibe un aviso.`;
  }
  if (semaphore.status === 'por_vencer') {
    return `${since}. Vence el ${formatDayDate(semaphore.overdueOn)}: atiéndela hoy.`;
  }
  return `${since}. Pasa a «por vencer» el ${formatDayDate(semaphore.warningOn)} y vence el ${formatDayDate(semaphore.overdueOn)}.`;
}
