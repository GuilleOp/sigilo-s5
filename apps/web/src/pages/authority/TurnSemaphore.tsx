// Semáforo de turnado de la bandeja del S5: píldora con ícono y texto (nunca solo color) y, en el
// detalle, la frase de desde cuándo espera la denuncia y cuándo vence.
import type { TurnSemaphore as TurnSemaphoreView } from '@sigilo/contracts';
import { StateTag } from '../../components/a/StateTag.tsx';
import {
  TURN_SEMAPHORE_TONES,
  turnSemaphoreName,
  turnSemaphoreSentence,
  turnSemaphoreShort,
} from '../../lib/turn-semaphore-text.ts';

interface TurnSemaphoreProps {
  /** Ausente si la denuncia no espera turno ni aceptación (o el nodo es anterior). */
  semaphore: TurnSemaphoreView | undefined;
  /** `row`: celda de la bandeja; `detail`: con la frase completa. */
  variant?: 'row' | 'detail';
}

/** Insignia del semáforo de turnado. */
export function TurnSemaphore({ semaphore, variant = 'row' }: TurnSemaphoreProps) {
  if (semaphore === undefined) {
    return variant === 'row' ? <span className="muted">No aplica</span> : null;
  }
  const tag = (
    <StateTag tone={TURN_SEMAPHORE_TONES[semaphore.status]} testId="turn-semaphore">
      {turnSemaphoreName(semaphore.status)}
    </StateTag>
  );
  if (variant === 'row') {
    return (
      <span className="turn-semaphore" data-status={semaphore.status}>
        {tag} <span className="turn-semaphore__days">{turnSemaphoreShort(semaphore)}</span>
      </span>
    );
  }
  return (
    <span className="turn-semaphore" data-status={semaphore.status}>
      {tag} <span data-testid="turn-semaphore-text">{turnSemaphoreSentence(semaphore)}</span>
    </span>
  );
}
