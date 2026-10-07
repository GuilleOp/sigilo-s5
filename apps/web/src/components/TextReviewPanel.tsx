// Revisión en vivo del texto: subraya datos que podrían identificar y sugiere otra redacción.
import { useDeferredValue, useMemo } from 'react';
import { reviewText } from '@sigilo/huella';
import { FINDING_KIND_LABELS, segmentText, SEVERITY_LABELS } from '../lib/text-segments.ts';

interface TextReviewPanelProps {
  text: string;
  /** Identificador del área de texto revisada, para seleccionar el hallazgo. */
  textareaId: string;
  idPrefix: string;
}

function selectInTextarea(textareaId: string, start: number, end: number): void {
  const element = document.getElementById(textareaId);
  if (element instanceof HTMLTextAreaElement) {
    element.focus();
    element.setSelectionRange(start, end);
  }
}

/** Panel con el texto marcado (no solo por color) y la lista de sugerencias. */
export function TextReviewPanel({ text, textareaId, idPrefix }: TextReviewPanelProps) {
  const deferred = useDeferredValue(text);
  const findings = useMemo(() => reviewText(deferred), [deferred]);
  const segments = useMemo(() => segmentText(deferred, findings), [deferred, findings]);
  const summary =
    findings.length === 0
      ? 'No encontramos datos que te identifiquen. Revisa de todos modos lo que escribiste.'
      : findings.length === 1
        ? 'Encontramos 1 dato que podría identificarte.'
        : `Encontramos ${findings.length} datos que podrían identificarte.`;

  if (deferred.trim() === '') return null;
  return (
    <section
      className="card"
      aria-labelledby={`${idPrefix}-title`}
      data-testid={`${idPrefix}-review`}
    >
      <h3 id={`${idPrefix}-title`}>Revisión de tu texto</h3>
      <p role="status" aria-live="polite">
        {summary}
      </p>
      {findings.length > 0 && (
        <>
          <p className="field__hint">
            Los datos marcados aparecen subrayados y con un número entre corchetes.
          </p>
          <div className="review-text">
            {segments.map((segment, index) =>
              segment.kind === 'plain' ? (
                <span key={index}>{segment.text}</span>
              ) : (
                <mark key={index}>
                  {segment.text}
                  <sup>[{segment.number}]</sup>
                </mark>
              ),
            )}
          </div>
          <ol>
            {findings.map((finding, index) => (
              <li key={`${finding.start}-${finding.end}`} data-testid="text-finding">
                <p>
                  <strong>
                    [{index + 1}] {FINDING_KIND_LABELS[finding.kind]} (
                    {SEVERITY_LABELS[finding.severity]}):
                  </strong>{' '}
                  «{finding.excerpt}»
                </p>
                <p>Sugerencia: {finding.suggestion}</p>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => selectInTextarea(textareaId, finding.start, finding.end)}
                >
                  Ir a este dato en el texto
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
