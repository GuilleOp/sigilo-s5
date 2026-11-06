// Paso 4: revisión con la vista de la autoridad, el destino de la denuncia, el grupo de anonimato y
// el semáforo de riesgo con acciones. Cada acción lleva el foco al lugar exacto que corrige y anuncia
// el resultado en una frase.
import { useMemo } from 'react';
import { withAnonymityFactor } from '@sigilo/anonimato';
import { assessRisk } from '@sigilo/huella';
import type { RiskAssessment } from '@sigilo/huella';
import { useAnonymityCheck } from '../../../anonymity/use-anonymity-check.ts';
import type { AnonymityStatus } from '../../../anonymity/use-anonymity-check.ts';
import { AnonymityNotice } from '../../../components/AnonymityNotice.tsx';
import { RiskMeter, riskSummary } from '../../../components/RiskMeter.tsx';
import { announce } from '../../../lib/announce.ts';
import { focusAfterRender } from '../../../lib/focus.ts';
import { summarizeSuspiciousCharacters } from '../../../lib/suspicious-characters.ts';
import { reportDraftStore, setFact } from '../../../state/report-draft.ts';
import type { ReportDraft } from '../../../state/report-draft.ts';
import { buildRiskActions, buildRiskSignals } from '../../../state/report-risk.ts';
import type { RiskAction } from '../../../state/report-risk.ts';
import type { ResolvedDestination } from '../destination.ts';
import { AuthorityPreview } from './AuthorityPreview.tsx';
import { evidenceTitleId } from './EvidenceItemCard.tsx';
import { EVIDENCE_INPUT_ID } from './EvidenceStep.tsx';
import { RoutingPanel } from './RoutingPanel.tsx';

interface ReviewStepProps {
  draft: ReportDraft;
  destination: ResolvedDestination;
  /** Cambia de paso y enfoca el elemento con ese identificador (en lugar del encabezado). */
  goToStep: (step: 'facts' | 'evidence', focusId: string) => void;
}

/** Título del semáforo: destino del foco cuando la acción se resuelve en este paso. */
const RISK_TITLE_ID = 'risk-title';

/** Semáforo de Huella Cero con el factor del grupo de anonimato, si ya se evaluó. */
export function riskWithAnonymity(draft: ReportDraft, anonymity: AnonymityStatus): RiskAssessment {
  const base = assessRisk(buildRiskSignals(draft));
  return anonymity.kind === 'assessed' ? withAnonymityFactor(base, anonymity.assessment) : base;
}

function runAction(
  action: RiskAction,
  draft: ReportDraft,
  goToStep: ReviewStepProps['goToStep'],
  anonymity: AnonymityStatus,
) {
  if (action.kind === 'go-evidence') {
    const pending = draft.evidence.find((item) => item.status !== 'clean');
    goToStep('evidence', pending === undefined ? EVIDENCE_INPUT_ID : evidenceTitleId(pending.id));
    return;
  }
  if (action.kind === 'go-facts') {
    // El panel de revisión del texto, con la lista de datos subrayados.
    goToStep('facts', 'description-title');
    return;
  }
  let done = 'Quitamos el municipio.';
  if (action.kind === 'remove-municipality') setFact('municipalityCode', '');
  if (action.kind === 'strip-invisible') {
    // La misma limpieza que el aviso de cada campo; el anuncio dice solo lo que de verdad se quitó.
    const current = reportDraftStore.get();
    const description = summarizeSuspiciousCharacters(current.facts.description);
    const accused = summarizeSuspiciousCharacters(current.facts.accused);
    reportDraftStore.set((latest) => ({
      ...latest,
      facts: { ...latest.facts, description: description.stripped, accused: accused.stripped },
    }));
    const removed = description.removable + accused.removable;
    const remaining = description.remaining + accused.remaining;
    done = removed > 0 ? 'Quitamos los caracteres invisibles.' : 'No había caracteres que quitar.';
    if (remaining > 0) {
      done +=
        ' Quedan letras de otro alfabeto o poco comunes: revísalas y escríbelas de nuevo si no las pusiste tú.';
    }
  }
  // El botón pulsado desaparece: el foco va al título del semáforo y se anuncia el nuevo nivel.
  const updated = riskWithAnonymity(reportDraftStore.get(), anonymity);
  focusAfterRender(RISK_TITLE_ID);
  announce(`${done} Ahora: ${riskSummary(updated)}`);
}

/** Revisión previa al envío. */
export function ReviewStep({ draft, destination, goToStep }: ReviewStepProps) {
  const anonymity = useAnonymityCheck(draft);
  const signals = useMemo(() => buildRiskSignals(draft), [draft]);
  const assessment = useMemo(() => riskWithAnonymity(draft, anonymity), [draft, anonymity]);
  const actions = buildRiskActions(signals);
  return (
    <>
      <p>Revisa con calma. Nada se ha enviado todavía.</p>
      <RiskMeter assessment={assessment}>
        {actions.length > 0 && (
          <>
            <p>
              <strong>Cómo corregirlo:</strong>
            </p>
            <ul>
              {actions.map((action) => (
                <li key={action.kind}>
                  {action.kind === 'advice' ? (
                    action.text
                  ) : (
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={() => runAction(action, draft, goToStep, anonymity)}
                      data-testid={`risk-action-${action.kind}`}
                    >
                      {action.text}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </RiskMeter>
      <AnonymityNotice
        status={anonymity}
        onGeneralize={() => goToStep('facts', 'description-title')}
      />
      <RoutingPanel destination={destination} />
      <AuthorityPreview draft={draft} />
    </>
  );
}
