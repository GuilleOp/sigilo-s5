// Alerta de conflicto de interés antes de turnar (LGRA, art. 58): resultado, evidencia citada y,
// si hace falta, la respuesta de la autoridad (excusa o justificación). Nunca bloquea el turnado;
// si se resuelve sin responder, una regla pública escala la denuncia a la supervisora.
import { useRef, useState } from 'react';
import { TableScroll } from '../../components/TableScroll.tsx';
import { hasFunction } from '@sigilo/contracts';
import type { ComplaintDetail, ConflictReview } from '@sigilo/contracts';
import { ConflictGraph } from '../../components/a/ConflictGraph.tsx';
import { SystemBadge } from '../../components/a/SystemBadge.tsx';
import { TextAreaField } from '../../components/Field.tsx';
import { focusAfterRender } from '../../lib/focus.ts';
import { formatDayDate } from '../../lib/format.ts';
import { api } from '../../services/api.ts';
import { describeError } from '../../services/api-client.ts';
import type { AuthoritySession } from './authority-session.ts';

interface ConflictPanelProps {
  session: AuthoritySession;
  detail: ComplaintDetail;
  review: ConflictReview;
  /** Recarga el detalle; se espera antes de mover el foco para que no lo pierda al repintar. */
  onChanged: () => Promise<unknown>;
}

const OUTCOME_TEXT: Readonly<Record<ConflictReview['outcome'], string>> = {
  'possible-conflict': 'Posible conflicto de interés',
  'none-found': 'No encontramos coincidencias (no descarta un conflicto)',
  no_coverage: 'Sin cobertura: no hay datos para revisar (nunca significa «sin conflicto»)',
};

const RESPONSE_TEXT = {
  excuse: 'Me excuso: otra persona o autoridad debe atenderla',
  justification: 'Justifico por qué no hay conflicto',
} as const;

/**
 * Quita el prefijo «Posible conflicto de interés: » de cada alerta: el encabezado ya lo dice y
 * repetirlo en cada párrafo solo hace ruido.
 */
function alertTitle(title: string): string {
  const rest = title.replace(/^Posible conflicto de interés:\s*/u, '');
  return rest === '' ? title : `${rest.charAt(0).toUpperCase()}${rest.slice(1)}`;
}

/** Panel del conflicto de interés. */
export function ConflictPanel({ session, detail, review, onChanged }: ConflictPanelProps) {
  // H16: sin opción preseleccionada; registrar pide confirmar, porque queda en la bitácora.
  const [response, setResponse] = useState<'excuse' | 'justification' | null>(null);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isConfirming, setConfirming] = useState(false);
  const isSaving = useRef(false);
  const canRespond =
    review.requiresResponse &&
    review.response === undefined &&
    !hasFunction(session.account, 'supervision') &&
    detail.summary.managementState !== 'closed';
  const isPossibleConflict = review.outcome === 'possible-conflict';

  /** H8: valida, marca los campos con error y lleva el foco al primero. */
  function checkFields(): boolean {
    const found: Record<string, string> = {};
    if (response === null) found['conflict-excuse'] = 'Elige si te excusas o justificas.';
    if (note.trim() === '')
      found['conflict-note'] = 'Escribe la nota pública: la persona la leerá.';
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first !== undefined) {
      setMessage('Revisa los datos marcados.');
      focusAfterRender(first);
      return false;
    }
    return true;
  }

  function askConfirmation(): void {
    if (!checkFields()) return;
    setMessage('');
    setConfirming(true);
    focusAfterRender('conflict-confirm-title');
  }

  async function respond(): Promise<void> {
    if (isSaving.current || response === null || !checkFields()) return;
    const text = note.trim();
    isSaving.current = true;
    try {
      await api.applyProcedure(session.token, detail.summary.folio, {
        action: 'respond_conflict',
        response,
        note: text,
      });
      setConfirming(false);
      setMessage('Listo: tu respuesta quedó registrada en la bitácora.');
      // H3: el formulario desaparece; el foco va al resultado, después de repintar el detalle.
      await onChanged();
      focusAfterRender('conflict-message');
    } catch (failure) {
      setMessage(describeError(failure, 'No pudimos registrar tu respuesta. Inténtalo de nuevo.'));
      focusAfterRender('conflict-message');
    } finally {
      isSaving.current = false;
    }
  }

  return (
    <section
      className="card conflict"
      aria-labelledby="conflict-title"
      data-testid="conflict-panel"
      data-outcome={review.outcome}
    >
      <div className="conflict__head">
        <SystemBadge system="S1" />
        <h3 id="conflict-title">
          <span className="status-icon" data-outcome={review.outcome} aria-hidden="true" />
          {OUTCOME_TEXT[review.outcome]}
        </h3>
      </div>
      <p className="source">Fuentes: S1 (declaraciones de intereses) y S2 (cadena de mando).</p>
      {isPossibleConflict ? (
        <>
          <p className="conflict__lead" data-testid="conflict-lead">
            <strong>
              Excúsate o justifica antes de aceptar; si resuelves sin hacerlo, se escala.
            </strong>{' '}
            LGRA, art. 58.
          </p>
          <details className="conflict__law">
            <summary>Qué hace tu superior inmediato y qué dice la revisión</summary>
            <p>
              Revisión del {formatDayDate(review.checkedOn)}: {review.summary}
            </p>
          </details>
        </>
      ) : (
        <p>
          Revisión del {formatDayDate(review.checkedOn)}: {review.summary}
        </p>
      )}
      {review.alerts.map((alert) => (
        <div key={alert.kind} className="conflict__alert" data-testid={`conflict-${alert.kind}`}>
          <p>
            <strong>{alertTitle(alert.title)}.</strong> {alert.explanation}
          </p>
          {alert.kind === 'conflict.shared-interest' && alert.evidence.length > 0 && (
            <figure className="conflict__figure" data-testid="conflict-graph">
              <ConflictGraph organizations={alert.evidence.map((item) => item.value)} />
              <figcaption className="source">
                Grafo: la persona titular y la persona denunciada declaran las mismas{' '}
                {alert.evidence.length === 1
                  ? 'organización'
                  : `${alert.evidence.length} organizaciones`}
                . La tabla de abajo dice lo mismo.
              </figcaption>
            </figure>
          )}
          <TableScroll labelledBy={`conflict-evidence-${alert.kind}`}>
            <table className="data-table">
              <caption id={`conflict-evidence-${alert.kind}`}>
                Evidencia (nombres, nunca porcentajes)
              </caption>
              <thead>
                <tr>
                  <th scope="col">Dato</th>
                  <th scope="col">Valor</th>
                  <th scope="col">Fuente</th>
                </tr>
              </thead>
              <tbody>
                {alert.evidence.map((item) => (
                  <tr key={`${item.label}-${item.value}`}>
                    <th scope="row">{item.label}</th>
                    <td>{item.value}</td>
                    <td>{item.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </div>
      ))}
      {review.response !== undefined && (
        <p data-testid="conflict-response">
          Respuesta registrada: {RESPONSE_TEXT[review.response]}.
        </p>
      )}
      {review.requiresResponse && review.response === undefined && !isPossibleConflict && (
        <p className="conflict__rule">
          El turnado no se bloquea. Antes de archivar o cerrar, quien la tiene debe excusarse o
          justificar. Si resuelve sin hacerlo, la denuncia pasa automáticamente a la autoridad
          supervisora.
        </p>
      )}
      {canRespond && (
        <fieldset
          className="field conflict__form"
          aria-describedby={errors['conflict-excuse'] ? 'conflict-response-error' : undefined}
        >
          <legend>Tu respuesta</legend>
          {errors['conflict-excuse'] && (
            <p id="conflict-response-error" className="field__error">
              Error: {errors['conflict-excuse']}
            </p>
          )}
          <div className="choice-list">
            {(['excuse', 'justification'] as const).map((value) => (
              <div key={value} className="choice">
                <input
                  type="radio"
                  id={`conflict-${value}`}
                  name="conflict-response"
                  checked={response === value}
                  aria-invalid={errors['conflict-excuse'] ? true : undefined}
                  onChange={() => {
                    setResponse(value);
                    setConfirming(false);
                  }}
                  data-testid={`conflict-response-${value}`}
                />
                <label htmlFor={`conflict-${value}`}>{RESPONSE_TEXT[value]}</label>
              </div>
            ))}
          </div>
          <TextAreaField
            id="conflict-note"
            label="Nota pública"
            hint="La persona denunciante la leerá tal cual en su seguimiento."
            rows={2}
            maxLength={2000}
            value={note}
            error={errors['conflict-note']}
            onChange={(event) => {
              setNote(event.target.value);
              setConfirming(false);
            }}
            data-testid="conflict-note"
          />
          {!isConfirming ? (
            <button
              type="button"
              className="button"
              onClick={askConfirmation}
              data-testid="conflict-submit"
            >
              Registrar respuesta
            </button>
          ) : (
            <div className="conflict__confirm" data-testid="conflict-confirm">
              <p id="conflict-confirm-title" tabIndex={-1}>
                <strong>¿Registrar tu respuesta?</strong>{' '}
                {response === null ? '' : RESPONSE_TEXT[response]}. Quedará en la bitácora pública y
                la persona denunciante leerá tu nota. No se puede deshacer.
              </p>
              <div className="actions">
                <button
                  type="button"
                  className="button"
                  onClick={() => void respond()}
                  data-testid="conflict-confirm-submit"
                >
                  Sí, registrar
                </button>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => {
                    setConfirming(false);
                    focusAfterRender('conflict-note');
                  }}
                >
                  Volver a revisar
                </button>
              </div>
            </div>
          )}
        </fieldset>
      )}
      <p id="conflict-message" tabIndex={-1} role="status" data-testid="conflict-message">
        {message}
      </p>
    </section>
  );
}
