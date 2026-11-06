// Señales del auditor con su evidencia lado a lado: lo que dice el acuerdo frente a la prueba o el
// dato público que lo contrasta. El auditor señala; nunca decide.
import type { AuditSignalView } from '@sigilo/contracts';
import { TableScroll } from '../../components/TableScroll.tsx';
import { formatDayDate } from '../../lib/format.ts';

interface AuditSignalsPanelProps {
  signals: readonly AuditSignalView[];
}

/** Señales del auditor sobre la denuncia y sus acuerdos. */
export function AuditSignalsPanel({ signals }: AuditSignalsPanelProps) {
  return (
    <section
      className="card audit-signals"
      aria-labelledby="audit-title"
      data-testid="audit-signals"
    >
      <h3 id="audit-title">Señales del auditor ({signals.length})</h3>
      <p>
        El auditor aplica reglas públicas y deterministas. Señala con evidencia para que una persona
        revise; no decide nada y todo queda en la bitácora.
      </p>
      {signals.map((signal) => (
        <article
          key={signal.key}
          className="audit-signal"
          aria-labelledby={`signal-${signal.key}`}
          data-rule={signal.ruleId}
          data-testid={`audit-signal-${signal.ruleId}`}
        >
          <h4 id={`signal-${signal.key}`}>
            <span className="status-icon" data-status="due_soon" aria-hidden="true" />
            {signal.ruleId}: {signal.name}
          </h4>
          <p>{signal.explanation}</p>
          <p className="audit-signal__on">Evaluada el {formatDayDate(signal.on)}.</p>
          {signal.evidence.length > 0 && (
            <TableScroll labelledBy={`signal-evidence-${signal.key}`}>
              <table className="data-table--wide data-table evidence-compare">
                <caption id={`signal-evidence-${signal.key}`}>Evidencia lado a lado</caption>
                <thead>
                  <tr>
                    <th scope="col">Qué se compara</th>
                    <th scope="col">Lo que dice el acuerdo</th>
                    <th scope="col">Lo que lo contrasta</th>
                  </tr>
                </thead>
                <tbody>
                  {signal.evidence.map((item, index) => (
                    <tr key={`${item.label}-${index}`}>
                      <th scope="row">{item.label}</th>
                      <td>{item.actText ?? 'El acuerdo no lo menciona.'}</td>
                      <td>
                        {item.counterpart}{' '}
                        <span className="source">(Fuente: {item.counterpartSource})</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
          <p className="audit-signal__note">{signal.note}</p>
        </article>
      ))}
    </section>
  );
}
