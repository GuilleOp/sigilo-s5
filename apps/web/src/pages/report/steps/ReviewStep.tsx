// Paso 4: revisión con la vista de la autoridad y el semáforo de riesgo con acciones. Cada acción
// lleva el foco al lugar exacto que corrige y anuncia el resultado en una frase.
import { useMemo } from 'react';
import { assessRisk, stripInvisibleCharacters } from '@sigilo/huella';
import { RiskMeter, riskSummary } from '../../../components/RiskMeter.tsx';
import { announce } from '../../../lib/announce.ts';
import { focusAfterRender } from '../../../lib/focus.ts';
import { reportDraftStore, setFact } from '../../../state/report-draft.ts';
import type { ReportDraft } from '../../../state/report-draft.ts';
import { buildRiskActions, buildRiskSignals } from '../../../state/report-risk.ts';
import type { RiskAction } from '../../../state/report-risk.ts';
import { AuthorityPreview } from './AuthorityPreview.tsx';
import { evidenceTitleId } from './EvidenceItemCard.tsx';
import { EVIDENCE_INPUT_ID } from './EvidenceStep.tsx';

interface ReviewStepProps {
  draft: ReportDraft;
  /** Cambia de paso y enfoca el elemento con ese identificador (en lugar del encabezado). */
  goToStep: (step: 'facts' | 'evidence', focusId: string) => void;
}

/** Título del semáforo: destino del foco cuando la acción se resuelve en este paso. */
const RISK_TITLE_ID = 'risk-title';

function runAction(action: RiskAction, draft: ReportDraft, goToStep: ReviewStepProps['goToStep']) {
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
  if (action.kind === 'remove-municipality') setFact('municipalityCode', '');
  if (action.kind === 'strip-invisible') {
    reportDraftStore.set((current) => ({
      ...current,
      facts: {
        ...current.facts,
        description: stripInvisibleCharacters(current.facts.description),
        accused: stripInvisibleCharacters(current.facts.accused),
      },
    }));
  }
  // El botón pulsado desaparece: el foco va al título del semáforo y se anuncia el nuevo nivel.
  const done =
    action.kind === 'remove-municipality'
      ? 'Quitamos el municipio.'
      : 'Quitamos los caracteres invisibles.';
  const updated = assessRisk(buildRiskSignals(reportDraftStore.get()));
  focusAfterRender(RISK_TITLE_ID);
  announce(`${done} Ahora: ${riskSummary(updated)}`);
}

/** Revisión previa al envío. */
export function ReviewStep({ draft, goToStep }: ReviewStepProps) {
  const signals = useMemo(() => buildRiskSignals(draft), [draft]);
  const assessment = useMemo(() => assessRisk(signals), [signals]);
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
                      onClick={() => runAction(action, draft, goToStep)}
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
      <AuthorityPreview draft={draft} />
    </>
  );
}
