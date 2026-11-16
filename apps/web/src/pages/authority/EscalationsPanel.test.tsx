// Pruebas de la lista de escalamientos: la supervisora con segunda llave ve «Abrir»; la supervisión
// que recibe los avisos sin segunda llave (como la titular de la Contraloría de Querétaro) ve los
// avisos y las escaladas, explicado, sin la opción de abrir la copia.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { EscalationSummary, RuleTriggerView } from '@sigilo/contracts';
import { groupEscalations } from '../../lib/escalation-groups.ts';
import { EscalationGroupsView } from './EscalationsPanel.tsx';

function rule(
  ruleKey: RuleTriggerView['ruleKey'],
  effect: RuleTriggerView['effect'],
): RuleTriggerView {
  return {
    ruleKey,
    on: '2026-11-10',
    effect,
    name: `Regla ${ruleKey}`,
    explanation: `Explica ${ruleKey}`,
    dueOn: '2026-11-10',
  };
}

function summaries(canOpenCopy: boolean): EscalationSummary[] {
  return [
    {
      folio: 'AAAA-AAAA-AAA1',
      escalatedOn: '2026-11-10',
      fromAuthorityId: 'authority.contraloria',
      rules: [rule('escalation.grave-stalled', 'escalate')],
      canOpenCopy,
    },
    {
      folio: 'AAAA-AAAA-AAA2',
      escalatedOn: '2026-11-10',
      fromAuthorityId: 'authority.contraloria',
      rules: [rule('alert.turn-overdue', 'alert')],
      canOpenCopy,
    },
  ];
}

function render(canOpenCopy: boolean): string {
  return renderToStaticMarkup(
    <EscalationGroupsView
      groups={groupEscalations(summaries(canOpenCopy))}
      isWithoutKey={!canOpenCopy}
      nameOf={() => 'Contraloría ficticia'}
      onOpen={() => undefined}
    />,
  );
}

describe('EscalationGroupsView', () => {
  it('con segunda llave ofrece abrir la copia de la escalada', () => {
    const html = render(true);
    expect(html).toContain('data-testid="escalation-open"');
    expect(html).toContain('Escalamiento');
    expect(html).not.toContain('escalations-without-key');
    expect(html).not.toContain('escalation-no-copy');
  });

  it('sin segunda llave muestra los avisos, explica por qué no hay copia y no ofrece abrirla', () => {
    const html = render(false);
    expect(html).not.toContain('data-testid="escalation-open"');
    expect(html).toContain('data-testid="escalations-without-key"');
    expect(html).toContain('no custodia la segunda llave');
    expect(html).toContain('data-testid="escalation-no-copy"');
    // Los dos grupos se rotulan como aviso, sin copia.
    expect(html.match(/Aviso, sin copia/gu)).toHaveLength(2);
    expect(html).toContain('Regla alert.turn-overdue');
  });
});
