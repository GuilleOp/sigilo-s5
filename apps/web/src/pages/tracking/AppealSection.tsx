// Calificación de la falta o abstención, e inconformidad (LGRA, arts. 100 a 110): el acuerdo, el
// plazo de 5 días hábiles y el aviso de inconformidad desde el seguimiento. El aviso no es el
// recurso: la ley pide un escrito con nombre, domicilio y firma autógrafa ante la autoridad
// investigadora y, sin firma, «no se tendrá por presentado» (art. 109). El sistema nunca dice que la
// inconformidad se presentó hasta que la autoridad registra el escrito firmado; solo entonces corre
// el plazo de la Sala. Explica que el aviso abre la identidad sellada solo para el recurso y, en una
// denuncia anónima, por qué no está disponible.
import { useRef, useState } from 'react';
import type { ComplaintMode, ProcedureView } from '@sigilo/contracts';
import { findRemedyOutcome } from '@sigilo/contracts';
import { TextAreaField } from '../../components/Field.tsx';
import { DEADLINE_STATUS_LABELS, describeRemaining } from '../../lib/deadline-text.ts';
import { focusAfterRender } from '../../lib/focus.ts';
import { formatDayDate } from '../../lib/format.ts';
import type { AppealWindow } from '../../lib/procedure-text.ts';

interface AppealSectionProps {
  procedure: ProcedureView;
  mode: ComplaintMode;
  window: AppealWindow | null;
  /** Da el aviso de inconformidad; resuelve con un mensaje de error o `null` si salió bien. */
  onFile?: (reasons: string) => Promise<string | null>;
}

const MIN_REASONS = 20;

/** Sección de la calificación o la abstención y la inconformidad. */
export function AppealSection({ procedure, mode, window, onFile }: AppealSectionProps) {
  const [reasons, setReasons] = useState('');
  const [hasConsent, setConsent] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isSending = useRef(false);
  const qualification = procedure.qualification;
  const abstention = procedure.abstention;
  const inconformity = procedure.inconformity;
  const isAbstention = abstention !== undefined && procedure.legalStage === 'abstention';
  const isOpenAct =
    isAbstention ||
    (qualification?.severity === 'non_serious' &&
      (inconformity === undefined || inconformity.against === 'non_serious'));
  const notice = inconformity?.notice ?? qualification?.appeal;
  const signedOn = inconformity?.signedOn ?? qualification?.appeal?.signedOn;
  const resolutionDueOn = inconformity?.resolutionDueOn ?? qualification?.appeal?.resolutionDueOn;
  const filingDueOn = inconformity?.filingDueOn ?? window?.dueOn ?? notice?.filingDueOn;
  const outcome =
    inconformity?.outcome === undefined ? undefined : findRemedyOutcome(inconformity.outcome);
  const canFile =
    isOpenAct &&
    mode === 'sealed' &&
    notice === undefined &&
    signedOn === undefined &&
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
        'Para preparar tu aviso necesitas aceptar que se abra tu identidad para el recurso.';
    }
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first !== undefined) {
      setMessage('Revisa los datos marcados.');
      focusAfterRender(first);
      return;
    }
    isSending.current = true;
    setMessage('Enviando tu aviso de inconformidad.');
    const error = await onFile(reasons.trim());
    isSending.current = false;
    setMessage(
      error ??
        `Preparaste tu aviso. Para que cuente, entrega tu escrito firmado a mano a la autoridad investigadora${filingDueOn === undefined ? ' dentro de los 5 días hábiles' : ` antes del ${formatDayDate(filingDueOn)}`}.`,
    );
  }

  return (
    <section
      className="appeal"
      aria-labelledby="appeal-title"
      data-status={window?.status ?? 'running'}
      data-testid="tracking-appeal"
    >
      {isAbstention && abstention !== undefined ? (
        <>
          <h3 id="appeal-title">Abstención ({formatDayDate(abstention.legalOn)})</h3>
          <p>{abstention.explanation}</p>
          <p>Fundamento: «{abstention.legalBasis}»</p>
          <details>
            <summary>Leer el acuerdo de abstención (versión pública)</summary>
            <p className="review-text">{abstention.agreement}</p>
          </details>
        </>
      ) : (
        qualification !== undefined && (
          <>
            <h3 id="appeal-title">
              Calificación: {qualification.severityName} ({formatDayDate(qualification.legalOn)})
            </h3>
            <p>{qualification.explanation}</p>
            <p>Fundamento: «{qualification.legalBasis}»</p>
            <details>
              <summary>Leer el acuerdo de calificación (versión pública)</summary>
              <p className="review-text">{qualification.agreement}</p>
            </details>
          </>
        )
      )}
      {signedOn !== undefined && (
        <div data-testid="appeal-signed">
          <p>
            <strong>Inconformidad presentada con firma</strong>: la autoridad registró tu escrito el{' '}
            {formatDayDate(signedOn)} y lo envía a la Sala del Tribunal.
            {resolutionDueOn !== undefined &&
              outcome === undefined &&
              ` La Sala tiene hasta el ${formatDayDate(resolutionDueOn)} para resolverla (30 días hábiles, LGRA, art. 107).`}
          </p>
          {outcome !== undefined && (
            <p data-testid="appeal-outcome">
              Resultado de la inconformidad: <strong>{outcome.name}</strong>. {outcome.explanation}
            </p>
          )}
        </div>
      )}
      {notice !== undefined && signedOn === undefined && (
        <div data-testid="appeal-filed">
          <p>
            <strong>Preparaste tu aviso de inconformidad</strong> el {formatDayDate(notice.legalOn)}
            . Todavía no es el recurso.
          </p>
          <p>
            Para que cuente, entrega tu escrito con tu nombre, domicilio y firma autógrafa a la
            autoridad investigadora
            {filingDueOn === undefined
              ? ' dentro de los 5 días hábiles siguientes a la notificación'
              : ` antes del ${formatDayDate(filingDueOn)}`}{' '}
            (LGRA, arts. 103, 104 y 109). Sin firma no se tiene por presentado. Cuando la autoridad
            registre que lo recibió, verás aquí el plazo de la Sala.
          </p>
        </div>
      )}
      {isOpenAct && signedOn === undefined && window !== null && (
        <p className="appeal__window" data-testid="appeal-window">
          <span className="status-icon" data-status={window.status} aria-hidden="true" />
          <strong>
            Plazo para entregar tu escrito firmado: {DEADLINE_STATUS_LABELS[window.status]}.
          </strong>{' '}
          Tienes 5 días hábiles: hasta el {formatDayDate(window.dueOn)} (
          {describeRemaining(window.remaining, window.remainingUnit, window.dueOn).toLowerCase()}).
        </p>
      )}
      {isOpenAct && notice === undefined && signedOn === undefined && window === null && (
        <p>El plazo de 5 días hábiles empieza cuando la autoridad te lo notifique por el buzón.</p>
      )}
      {isOpenAct && signedOn === undefined && mode === 'anonymous' && (
        <p data-testid="appeal-anonymous">
          Tu denuncia es anónima, así que la inconformidad no está disponible: la ley pide el
          nombre, el domicilio y la firma de quien se inconforma (LGRA, art. 109), y en una denuncia
          anónima no hay identidad que presentar. Tu denuncia sigue su trámite y la autoridad
          supervisora revisa las reglas públicas.
        </p>
      )}
      {canFile && (
        <div className="appeal__form" data-testid="appeal-form">
          <h4>Aviso de inconformidad</h4>
          <p>
            <strong>Antes de preparar tu aviso, debes saber:</strong> el aviso no es la
            inconformidad. Para que cuente, entregas el escrito con tu nombre, domicilio y firma
            autógrafa ante la autoridad investigadora (LGRA, art. 109); después, la Sala del
            Tribunal la resuelve. Con el aviso, la autoridad investigadora podrá abrir tu identidad
            sellada, solo para el recurso. Queda registrado quién la abrió, cuándo y para qué, y lo
            verás aquí.
          </p>
          <TextAreaField
            id="appeal-reasons"
            label={
              isAbstention
                ? '¿Por qué no estás de acuerdo con la abstención?'
                : '¿Por qué no estás de acuerdo con la calificación?'
            }
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
            Preparar mi aviso de inconformidad
          </button>
        </div>
      )}
      <p role="status" aria-live="polite" data-testid="appeal-message">
        {message}
      </p>
    </section>
  );
}
