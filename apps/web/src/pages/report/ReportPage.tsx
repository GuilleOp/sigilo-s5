// Pantalla /denunciar: asistente por pasos con progreso, validación y foco gestionado.
// Al cambiar de paso el foco va al encabezado, o al panel exacto si lo pide el semáforo.
import { useState } from 'react';
import { ErrorSummary } from '../../components/ErrorSummary.tsx';
import { StepHeading } from '../../components/StepHeading.tsx';
import { StepProgress } from '../../components/StepProgress.tsx';
import { focusAfterRender } from '../../lib/focus.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { reportDraftStore } from '../../state/report-draft.ts';
import type { ReportDraft } from '../../state/report-draft.ts';
import { useMemoryStore } from '../../state/memory-store.ts';
import {
  validateEvidenceStep,
  validateFactsStep,
  validateModeStep,
} from '../../state/report-validation.ts';
import type { FieldErrors } from '../../state/report-validation.ts';
import { EvidenceStep } from './steps/EvidenceStep.tsx';
import { FactsStep } from './steps/FactsStep.tsx';
import { ModeStep } from './steps/ModeStep.tsx';
import { ReviewStep } from './steps/ReviewStep.tsx';
import { SubmitStep } from './steps/SubmitStep.tsx';

const STEPS = [
  { id: 'mode', title: 'Modo', heading: '¿Cómo quieres denunciar?' },
  { id: 'facts', title: 'Hechos', heading: 'Cuéntanos qué pasó' },
  { id: 'evidence', title: 'Pruebas', heading: 'Agrega pruebas (opcional)' },
  { id: 'review', title: 'Revisión', heading: 'Revisa antes de enviar' },
  { id: 'submit', title: 'Envío', heading: 'Envía tu denuncia' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

/** Pasos con datos que llenar: muestran la nota de obligatorios. */
const STEPS_WITH_FIELDS: readonly StepId[] = ['mode', 'facts'];

/** Campo del DOM para cada clave de error que no coincide con su identificador. */
const FIELD_IDS = {
  mode: 'mode-anonymous',
  period: 'period-month',
  evidence: 'evidence-input',
} as const;

function validateStep(step: StepId, draft: ReportDraft): FieldErrors {
  if (step === 'mode') return validateModeStep(draft);
  if (step === 'facts') return validateFactsStep(draft);
  if (step === 'evidence') return validateEvidenceStep(draft);
  return {};
}

/** Asistente de denuncia. */
export function ReportPage() {
  const draft = useMemoryStore(reportDraftStore);
  const [index, setIndex] = useState(0);
  /** Tras moverse de paso, el encabezado nuevo recibe el foco (salvo que haya otro destino). */
  const [shouldFocusHeading, setFocusHeading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [isSending, setSending] = useState(false);
  const step = STEPS[index] ?? STEPS[0];
  useDocumentTitle(`Denunciar, paso ${index + 1} de ${STEPS.length}: ${step.title}`);

  function goTo(next: number, target: string | null = null): void {
    setAttempt(0);
    setFocusHeading(target === null);
    setIndex(next);
    // El destino aparece al pintar el paso nuevo; se espera a que exista.
    if (target !== null) focusAfterRender(target);
  }

  function next(): void {
    const found = validateStep(step.id, draft);
    setAttempt((value) => value + 1);
    if (Object.keys(found).length === 0) goTo(index + 1);
  }

  // Tras un intento, los errores se recalculan en vivo y desaparecen al corregirse.
  const visibleErrors: FieldErrors = attempt > 0 ? validateStep(step.id, draft) : {};

  return (
    <>
      <h1>Presentar una denuncia</h1>
      <StepProgress steps={STEPS.map((item) => item.title)} current={index} />
      <section aria-labelledby="step-title" data-testid={`step-${step.id}`}>
        <div id="step-title">
          <StepHeading key={step.id} shouldFocus={shouldFocusHeading}>
            Paso {index + 1} de {STEPS.length}: {step.heading}
          </StepHeading>
        </div>
        {STEPS_WITH_FIELDS.includes(step.id) && (
          <p data-testid="required-note">
            Todos los datos son necesarios, menos los que dicen «opcional».
          </p>
        )}
        <ErrorSummary errors={visibleErrors} attempt={attempt} fieldIds={FIELD_IDS} />
        {step.id === 'mode' && <ModeStep draft={draft} errors={visibleErrors} />}
        {step.id === 'facts' && <FactsStep draft={draft} errors={visibleErrors} />}
        {step.id === 'evidence' && <EvidenceStep draft={draft} errors={visibleErrors} />}
        {step.id === 'review' && (
          <ReviewStep
            draft={draft}
            goToStep={(target, focusId) =>
              goTo(
                STEPS.findIndex((item) => item.id === target),
                focusId,
              )
            }
          />
        )}
        {step.id === 'submit' && <SubmitStep draft={draft} onSendingChange={setSending} />}
      </section>
      {!isSending && (
        <div className="actions no-print">
          {/* Tras un envío exitoso el borrador se vacía (modo nulo) y ya no se puede regresar. */}
          {index > 0 && draft.mode !== null && (
            <button
              type="button"
              className="button button--secondary"
              onClick={() => goTo(index - 1)}
              data-testid="step-back"
            >
              Atrás
            </button>
          )}
          {index < STEPS.length - 1 && (
            <button type="button" className="button" onClick={next} data-testid="step-next">
              Continuar
            </button>
          )}
        </div>
      )}
    </>
  );
}
