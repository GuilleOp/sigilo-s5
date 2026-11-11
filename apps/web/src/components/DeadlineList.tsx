// Plazos legales con su situación: ícono con forma distinta y texto (nunca solo color), fecha de
// vencimiento, lo que falta con su unidad y su fundamento.
import type { DeadlineView } from '@sigilo/contracts';
import { DEADLINE_STATUS_LABELS, describeRemaining, isLongSpan } from '../lib/deadline-text.ts';
import { formatDayDate, formatShortDate } from '../lib/format.ts';
import { DeadlineRuler, rulerPosition } from './a/DeadlineRuler.tsx';

interface DeadlineListProps {
  deadlines: readonly DeadlineView[];
  /** Muestra la explicación de cada plazo (para la persona denunciante). */
  shouldExplain?: boolean;
  /** Dibuja la regla del plazo (días transcurridos y «hoy») en los plazos de hasta 60 días. */
  hasRuler?: boolean;
  testId?: string;
}

/** Regla del plazo con su texto, si el plazo cabe en una regla. */
function RulerFor({ deadline }: { deadline: DeadlineView }) {
  const position = rulerPosition(deadline);
  if (position === null) return null;
  return (
    <div className="deadline__ruler" data-testid="deadline-ruler">
      <DeadlineRuler day={position.day} total={position.total} />
      <p>
        <strong>
          Han pasado {position.day} de {position.total}{' '}
          {deadline.remainingUnit === 'business_days' ? 'días hábiles' : 'días naturales'}.
        </strong>
      </p>
    </div>
  );
}

/** Lista de plazos. */
export function DeadlineList({
  deadlines,
  shouldExplain = false,
  hasRuler = false,
  testId,
}: DeadlineListProps) {
  if (deadlines.length === 0) return null;
  return (
    <ul className="deadline-list" data-testid={testId}>
      {deadlines.map((deadline) => (
        <li
          key={deadline.key}
          className="deadline"
          data-status={deadline.status}
          data-testid={`deadline-${deadline.key}`}
        >
          <p className="deadline__head">
            <span className="status-icon" data-status={deadline.status} aria-hidden="true" />
            <strong>{deadline.name}</strong>{' '}
            <span className="deadline__status">{DEADLINE_STATUS_LABELS[deadline.status]}</span>
          </p>
          {/* Los plazos largos se dicen en años y meses, con la fecha al lado:
              «Faltan 6 años y 1 mes (vence el 1 mar 2033)». */}
          {isLongSpan(deadline.remaining, deadline.remainingUnit) ? (
            <p className="deadline__when">
              <span data-testid="deadline-remaining">
                {describeRemaining(deadline.remaining, deadline.remainingUnit, deadline.dueOn)}
              </span>{' '}
              ({deadline.remaining > 0 ? 'vence' : 'venció'} el {formatShortDate(deadline.dueOn)}).
            </p>
          ) : (
            <p className="deadline__when">
              Vence el {formatDayDate(deadline.dueOn)}.{' '}
              <span data-testid="deadline-remaining">
                {describeRemaining(deadline.remaining, deadline.remainingUnit)}.
              </span>
            </p>
          )}
          {hasRuler && <RulerFor deadline={deadline} />}
          {shouldExplain && <p className="deadline__explain">{deadline.explanation}</p>}
          {deadline.legalBasis.length > 0 && (
            <p className="deadline__basis">Fundamento: {deadline.legalBasis.join('; ')}.</p>
          )}
        </li>
      ))}
    </ul>
  );
}
