// Estatus actual, línea de tiempo de la denuncia y descartes de pruebas por la autoridad.
import type { TrackingView } from '@sigilo/contracts';
import { formatDayDate, STATUS_HINTS, STATUS_LABELS } from '../../lib/format.ts';

interface StatusTimelineProps {
  view: TrackingView;
}

/** Estatus, su historia y los descartes de pruebas, que la persona ve de inmediato. */
export function StatusTimeline({ view }: StatusTimelineProps) {
  return (
    <section className="card" aria-labelledby="timeline-title">
      <h2 id="timeline-title">Estatus: {STATUS_LABELS[view.status]}</h2>
      <p data-testid="tracking-status">{STATUS_HINTS[view.status]}</p>
      <ol className="timeline">
        {view.timeline.map((entry, index) => (
          <li key={`${entry.status}-${index}`}>
            <strong>{formatDayDate(entry.on)}</strong>: {STATUS_LABELS[entry.status]}
          </li>
        ))}
      </ol>
      {(view.evidenceDiscards ?? []).map((discard, index) => (
        <p key={`discard-${index}`} data-testid="tracking-evidence-discard">
          La autoridad descartó {discard.count === 1 ? '1 prueba' : `${discard.count} pruebas`} el{' '}
          {formatDayDate(discard.on)}. Los archivos se borraron y queda anotado en el registro
          público.
        </p>
      ))}
    </section>
  );
}
