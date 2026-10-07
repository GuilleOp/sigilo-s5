// Pantalla /denunciar: asistente por pasos con progreso, validación y foco gestionado.
import { useState } from 'react';
import { ErrorSummary } from '../../components/ErrorSummary.tsx';
import { StepHeading } from '../../components/StepHeading.tsx';
import { StepProgress } from '../../components/StepProgress.tsx';
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
  const [hasMoved, setMoved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [isSending, setSending] = useState(false);
  const step = STEPS[index] ?? STEPS[0];
  useDocumentTitle(`Denunciar, paso ${index + 1} de ${STEPS.length}: ${step.title}`);

  function goTo(next: number): void {
    setAttempt(0);
    setMoved(true);
    setIndex(next);
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
          <StepHeading key={step.id} shouldFocus={hasMoved}>
            Paso {index + 1} de {STEPS.length}: {step.heading}
          </StepHeading>
        </div>
        <ErrorSummary
          errors={visibleErrors}
          attempt={attempt}
          fieldIds={{ period: 'period', evidence: 'evidence-input' }}
        />
        {step.id === 'mode' && <ModeStep draft={draft} errors={visibleErrors} />}
        {step.id === 'facts' && <FactsStep draft={draft} errors={visibleErrors} />}
        {step.id === 'evidence' && <EvidenceStep draft={draft} errors={visibleErrors} />}
        {step.id === 'review' && (
          <ReviewStep
            draft={draft}
            goToStep={(target) => goTo(STEPS.findIndex((item) => item.id === target))}
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
