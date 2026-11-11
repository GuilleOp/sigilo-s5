// Pruebas del agrupado de escalamientos: una explicación por regla, gravedad y antigüedad.
import { describe, expect, it } from 'vitest';
import type { EscalationSummary, RuleTriggerView } from '@sigilo/contracts';
import { groupEscalations } from './escalation-groups.ts';

function rule(
  ruleKey: RuleTriggerView['ruleKey'],
  on: string,
  effect: RuleTriggerView['effect'] = 'escalate',
): RuleTriggerView {
  return {
    ruleKey,
    on,
    effect,
    name: `Regla ${ruleKey}`,
    explanation: `Explica ${ruleKey}`,
    dueOn: on,
  };
}

function item(folio: string, rules: RuleTriggerView[]): EscalationSummary {
  return {
    folio,
    escalatedOn: rules[0]?.on ?? '2026-11-01',
    fromAuthorityId: 'authority.oic',
    rules,
  };
}

describe('groupEscalations', () => {
  it('agrupa por regla, de la más grave a la menos grave, y los avisos al final', () => {
    const groups = groupEscalations([
      item('AAAA-AAAA-AAA1', [rule('escalation.grave-stalled', '2026-12-10')]),
      item('AAAA-AAAA-AAA2', [rule('alert.turn-overdue', '2026-11-11', 'alert')]),
      item('AAAA-AAAA-AAA3', [
        rule('escalation.conflict', '2026-12-11'),
        rule('escalation.downgrade-signals', '2026-12-11'),
      ]),
      item('AAAA-AAAA-AAA4', [rule('escalation.grave-stalled', '2026-12-01')]),
    ]);
    expect(groups.map((group) => group.ruleKey)).toEqual([
      'escalation.conflict',
      'escalation.downgrade-signals',
      'escalation.grave-stalled',
      'alert.turn-overdue',
    ]);
    // La explicación va una vez por grupo; las denuncias, de la más antigua a la más reciente.
    const stalled = groups[2];
    expect(stalled?.explanation).toBe('Explica escalation.grave-stalled');
    expect(stalled?.entries.map((entry) => entry.folio)).toEqual([
      'AAAA-AAAA-AAA4',
      'AAAA-AAAA-AAA1',
    ]);
    // Cada entrada dice qué otras reglas se cumplieron y si trae el sobre.
    expect(groups[0]?.entries[0]).toMatchObject({
      folio: 'AAAA-AAAA-AAA3',
      isEscalated: true,
      otherRules: ['Regla escalation.downgrade-signals'],
    });
    expect(groups[3]?.entries[0]?.isEscalated).toBe(false);
  });

  it('cuenta una sola vez la denuncia en la que una regla se cumplió dos veces', () => {
    const groups = groupEscalations([
      item('AAAA-AAAA-AAA1', [
        rule('alert.turn-overdue', '2026-11-20', 'alert'),
        rule('alert.turn-overdue', '2026-11-11', 'alert'),
      ]),
    ]);
    expect(groups[0]?.entries).toEqual([
      {
        folio: 'AAAA-AAAA-AAA1',
        on: '2026-11-11',
        fromAuthorityId: 'authority.oic',
        isEscalated: false,
        otherRules: [],
      },
    ]);
  });
});
