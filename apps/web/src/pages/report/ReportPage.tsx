// Pantalla /denunciar: asistente por pasos con progreso, validación y foco gestionado.
// Al cambiar de paso el foco va al encabezado, o al panel exacto si lo pide el semáforo.
import { useState } from 'react';
import { useNetworkState } from '../../network/use-network-state.ts';
import { ErrorSummary } from '../../components/ErrorSummary.tsx';
import { StepHeading } from '../../components/StepHeading.tsx';
import { StepNavigator } from '../../components/StepNavigator.tsx';
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
import { resolveDestination } from './destination.ts';

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
  const network = useNetworkState();
  const destination = resolveDestination(draft, network);
  const [index, setIndex] = useState(0);
  /** Tras moverse de paso, el encabezado nuevo recibe el foco (salvo que haya otro destino). */
  const [shouldFocusHeading, setFocusHeading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  /** Con la denuncia enviada ya no hay pasos: se ocultan las píldoras y la barra de pasos. */
  const [isFinished, setFinished] = useState(false);
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
      {!isFinished && <StepProgress steps={STEPS.map((item) => item.title)} current={index} />}
      <section aria-labelledby="step-title" data-testid={`step-${step.id}`}>
        <div id="step-title">
          <StepHeading key={step.id} shouldFocus={shouldFocusHeading}>
            {/* El avance ya se ve en las píldoras y en la barra de abajo: aquí solo lo oyen los lectores. */}
            <span className="visually-hidden">
              Paso {index + 1} de {STEPS.length}:{' '}
            </span>
            {isFinished ? 'Denuncia enviada' : step.heading}
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
            destination={destination}
            draft={draft}
            goToStep={(target, focusId) =>
              goTo(
                STEPS.findIndex((item) => item.id === target),
                focusId,
              )
            }
          />
        )}
        {/* El paso de envío dibuja su propia barra: «Enviar denuncia» ocupa el lugar de «Continuar». */}
        {step.id === 'submit' && (
          <SubmitStep
            draft={draft}
            destination={destination}
            navigator={{
              current: index,
              total: STEPS.length,
              title: step.title,
              onBack: () => goTo(index - 1),
            }}
            onFinished={() => setFinished(true)}
          />
        )}
      </section>
      {step.id !== 'submit' && (
        <StepNavigator
          current={index}
          total={STEPS.length}
          title={step.title}
          {...(index > 0 ? { onBack: () => goTo(index - 1) } : {})}
          onNext={next}
        />
      )}
    </>
  );
}
