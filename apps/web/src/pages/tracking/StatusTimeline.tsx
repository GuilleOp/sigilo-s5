// Estatus actual y línea de tiempo de la denuncia.
import type { TrackingView } from '@sigilo/contracts';
import { formatDayDate, STATUS_HINTS, STATUS_LABELS } from '../../lib/format.ts';

interface StatusTimelineProps {
  view: TrackingView;
}

/** Estatus y su historia. */
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
    </section>
  );
}
