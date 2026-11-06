// Calificación de la falta e inconformidad (LGRA, arts. 100 y 102 a 110): el acuerdo, el plazo de 5
// días hábiles y el recurso desde el seguimiento. Explica que la ley pide nombre, domicilio y firma,
// que eso abre la identidad sellada solo para el recurso y que la firma autógrafa se completa fuera
// del sistema. En una denuncia anónima explica por qué no está disponible.
import { useRef, useState } from 'react';
import type { ComplaintMode, QualificationView } from '@sigilo/contracts';
import { TextAreaField } from '../../components/Field.tsx';
import { DEADLINE_STATUS_LABELS, describeRemaining } from '../../lib/deadline-text.ts';
import { focusAfterRender } from '../../lib/focus.ts';
import { formatDayDate } from '../../lib/format.ts';
import type { AppealWindow } from '../../lib/procedure-text.ts';

interface AppealSectionProps {
  qualification: QualificationView;
  mode: ComplaintMode;
  window: AppealWindow | null;
  /** Presenta la inconformidad; resuelve con un mensaje de error o `null` si salió bien. */
  onFile?: (reasons: string) => Promise<string | null>;
}

const MIN_REASONS = 20;

/** Sección de la calificación y la inconformidad. */
export function AppealSection({ qualification, mode, window, onFile }: AppealSectionProps) {
  const [reasons, setReasons] = useState('');
  const [hasConsent, setConsent] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isSending = useRef(false);
  const isNonSerious = qualification.severity === 'non_serious';
  const canFile =
    isNonSerious &&
    mode === 'sealed' &&
    qualification.appeal === undefined &&
    window !== null &&
    window.status !== 'overdue' &&
    onFile !== undefined;

  async function file(): Promise<void> {
    if (isSending.current || onFile === undefined) return;
    // H8: cada error va junto a su campo, con aria-invalid, y el foco al primero.
    const found: Record<string, string> = {};
    if (reasons.trim().length < MIN_REASONS) {
      found['appeal-reasons'] = `Escribe tus motivos (al menos ${MIN_REASONS} caracteres).`;
    }
    if (!hasConsent) {
      found['appeal-consent'] =
        'Para inconformarte necesitas aceptar que se abra tu identidad para el recurso.';
    }
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first !== undefined) {
      setMessage('Revisa los datos marcados.');
      focusAfterRender(first);
      return;
    }
    isSending.current = true;
    setMessage('Enviando tu inconformidad.');
    const error = await onFile(reasons.trim());
    isSending.current = false;
    setMessage(error ?? 'Listo: presentaste tu inconformidad.');
  }

  return (
    <section
      className="appeal"
      aria-labelledby="appeal-title"
      data-status={window?.status ?? 'running'}
      data-testid="tracking-appeal"
    >
      <h3 id="appeal-title">
        Calificación: {qualification.severityName} ({formatDayDate(qualification.legalOn)})
      </h3>
      <p>{qualification.explanation}</p>
      <p>Fundamento: «{qualification.legalBasis}»</p>
      <details>
        <summary>Leer el acuerdo de calificación (versión pública)</summary>
        <p className="review-text">{qualification.agreement}</p>
      </details>
      {qualification.appeal !== undefined && (
        <div data-testid="appeal-filed">
          <p>
            <strong>Presentaste tu inconformidad</strong> el{' '}
            {formatDayDate(qualification.appeal.legalOn)}.
            {qualification.appeal.resolutionDueOn !== undefined &&
              ` La Sala tiene hasta el ${formatDayDate(qualification.appeal.resolutionDueOn)} para resolverla (30 días hábiles, LGRA, art. 107).`}
          </p>
          <p>
            Falta tu firma autógrafa: la ley la exige y se completa fuera de este sistema, ante la
            autoridad que te lo indique por el buzón.
          </p>
        </div>
      )}
      {isNonSerious && qualification.appeal === undefined && window !== null && (
        <p className="appeal__window" data-testid="appeal-window">
          <span className="status-icon" data-status={window.status} aria-hidden="true" />
          <strong>Plazo para inconformarte: {DEADLINE_STATUS_LABELS[window.status]}.</strong> Tienes
          5 días hábiles: hasta el {formatDayDate(window.dueOn)} (
          {describeRemaining(window.remaining, window.remainingUnit).toLowerCase()}).
        </p>
      )}
      {isNonSerious && qualification.appeal === undefined && window === null && (
        <p>El plazo de 5 días hábiles empieza cuando la autoridad te lo notifique por el buzón.</p>
      )}
      {isNonSerious && qualification.appeal === undefined && mode === 'anonymous' && (
        <p data-testid="appeal-anonymous">
          Tu denuncia es anónima, así que la inconformidad no está disponible: la ley pide el
          nombre, el domicilio y la firma de quien se inconforma (LGRA, art. 109), y en una denuncia
          anónima no hay identidad que presentar. Tu denuncia sigue su trámite y la autoridad
          supervisora revisa las reglas públicas.
        </p>
      )}
      {canFile && (
        <div className="appeal__form" data-testid="appeal-form">
          <p>
            <strong>Antes de inconformarte, debes saber:</strong> la ley pide tu nombre, domicilio y
            firma. Al presentarla, la autoridad investigadora podrá abrir tu identidad sellada, solo
            para el recurso. Queda registrado quién la abrió, cuándo y para qué, y lo verás aquí. La
            firma autógrafa se completa fuera de este sistema.
          </p>
          <TextAreaField
            id="appeal-reasons"
            label="¿Por qué no estás de acuerdo con la calificación?"
            hint="Escribe tus motivos con tus palabras. Al menos una frase."
            rows={4}
            maxLength={5000}
            value={reasons}
            error={errors['appeal-reasons']}
            onChange={(event) => setReasons(event.target.value)}
            data-testid="appeal-reasons"
          />
          <div className="choice">
            <input
              type="checkbox"
              id="appeal-consent"
              checked={hasConsent}
              aria-invalid={errors['appeal-consent'] ? true : undefined}
              aria-describedby={errors['appeal-consent'] ? 'appeal-consent-error' : undefined}
              onChange={(event) => setConsent(event.target.checked)}
              data-testid="appeal-consent"
            />
            <label htmlFor="appeal-consent">
              Acepto que se abra mi identidad sellada solo para este recurso.
            </label>
          </div>
          {errors['appeal-consent'] && (
            <p id="appeal-consent-error" className="field__error">
              Error: {errors['appeal-consent']}
            </p>
          )}
          <button
            type="button"
            className="button"
            onClick={() => void file()}
            data-testid="appeal-submit"
          >
            Presentar mi inconformidad
          </button>
        </div>
      )}
      <p role="status" aria-live="polite" data-testid="appeal-message">
        {message}
      </p>
    </section>
  );
}
