// Paso 4: revisión con la vista de la autoridad y el semáforo de riesgo con acciones.
import { useMemo } from 'react';
import { assessRisk, stripInvisibleCharacters } from '@sigilo/huella';
import { RiskMeter } from '../../../components/RiskMeter.tsx';
import { reportDraftStore, setFact } from '../../../state/report-draft.ts';
import type { ReportDraft } from '../../../state/report-draft.ts';
import { buildRiskActions, buildRiskSignals } from '../../../state/report-risk.ts';
import type { RiskAction } from '../../../state/report-risk.ts';
import { AuthorityPreview } from './AuthorityPreview.tsx';

interface ReviewStepProps {
  draft: ReportDraft;
  goToStep: (step: 'facts' | 'evidence') => void;
}

function runAction(action: RiskAction, goToStep: ReviewStepProps['goToStep']): void {
  if (action.kind === 'go-evidence') goToStep('evidence');
  if (action.kind === 'go-facts') goToStep('facts');
  if (action.kind === 'remove-municipality') setFact('municipalityCode', '');
  if (action.kind === 'strip-invisible') {
    reportDraftStore.set((draft) => ({
      ...draft,
      facts: {
        ...draft.facts,
        description: stripInvisibleCharacters(draft.facts.description),
        accused: stripInvisibleCharacters(draft.facts.accused),
      },
    }));
  }
}

/** Revisión previa al envío. */
export function ReviewStep({ draft, goToStep }: ReviewStepProps) {
  const signals = useMemo(() => buildRiskSignals(draft), [draft]);
  const assessment = useMemo(() => assessRisk(signals), [signals]);
  const actions = buildRiskActions(signals);
  return (
    <>
      <p>Revisa con calma. Nada se ha enviado todavía.</p>
      <div aria-live="polite">
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
                        onClick={() => runAction(action, goToStep)}
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
      </div>
      <AuthorityPreview draft={draft} />
    </>
  );
}
