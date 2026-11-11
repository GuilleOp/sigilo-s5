// Escalamientos de la supervisión agrupados por regla: la explicación de cada regla una sola vez,
// las reglas más graves primero y, dentro de cada una, las denuncias que llevan más tiempo.
import type { EscalationRuleKey, EscalationSummary, RuleEffect } from '@sigilo/contracts';

/**
 * Gravedad de cada regla para ordenar la lista de supervisión (menor número, más grave): primero
 * los actos que pueden enterrar una falta (conflicto sin excusa, cierres que declinan o degradan
 * una falta grave), luego la falta grave detenida, los archivos con señales y la justificación
 * propia, y al final los avisos de trámite. Las alertas sin sobre van siempre después de los
 * escalamientos. Una regla que no esté aquí va al final de su tipo.
 */
const RULE_GRAVITY: Readonly<Partial<Record<EscalationRuleKey, number>>> = {
  'escalation.conflict': 1,
  'escalation.declined-serious': 2,
  'escalation.downgrade-signals': 3,
  'escalation.grave-stalled': 4,
  'escalation.archive-signals': 5,
  'escalation.conflict-justified': 6,
  'escalation.transfer-unconfirmed': 7,
  'escalation.archive-unnotified': 8,
  'alert.turn-overdue': 20,
};

/** Denuncia dentro del grupo de una regla. */
export interface EscalationGroupEntry {
  folio: string;
  /** Día en que se cumplió la regla para esta denuncia. */
  on: string;
  fromAuthorityId: string;
  /** Si la denuncia trae el sobre de escalamiento (alguna de sus reglas escala). */
  isEscalated: boolean;
  /** Nombres de las otras reglas que se cumplieron para la misma denuncia. */
  otherRules: string[];
}

/** Regla con su explicación y las denuncias en las que se cumplió. */
export interface EscalationGroup {
  ruleKey: EscalationRuleKey;
  name: string;
  explanation: string;
  effect: RuleEffect;
  entries: EscalationGroupEntry[];
}

function gravityOf(group: EscalationGroup): number {
  const base = group.effect === 'escalate' ? 0 : 100;
  return base + (RULE_GRAVITY[group.ruleKey] ?? 50);
}

/**
 * Agrupa los escalamientos por regla. Los grupos van de la regla más grave a la menos grave (los
 * escalamientos antes que los avisos) y, dentro de cada uno, de la denuncia más antigua a la más
 * reciente (a igual día, por folio).
 */
export function groupEscalations(items: readonly EscalationSummary[]): EscalationGroup[] {
  const groups = new Map<EscalationRuleKey, EscalationGroup>();
  for (const item of items) {
    const isEscalated = item.rules.some((rule) => rule.effect === 'escalate');
    for (const rule of item.rules) {
      const group = groups.get(rule.ruleKey) ?? {
        ruleKey: rule.ruleKey,
        name: rule.name,
        explanation: rule.explanation,
        effect: rule.effect,
        entries: [],
      };
      groups.set(rule.ruleKey, group);
      // Una regla puede cumplirse varias veces en la misma denuncia (por ejemplo, el turnado
      // vencido después de una devolución): cuenta la primera, la que lleva más tiempo.
      const existing = group.entries.find((entry) => entry.folio === item.folio);
      if (existing !== undefined) {
        if (rule.on < existing.on) existing.on = rule.on;
        continue;
      }
      group.entries.push({
        folio: item.folio,
        on: rule.on,
        fromAuthorityId: item.fromAuthorityId,
        isEscalated,
        otherRules: [
          ...new Set(
            item.rules.filter((other) => other.ruleKey !== rule.ruleKey).map((other) => other.name),
          ),
        ],
      });
    }
  }
  const sorted = [...groups.values()].sort(
    (left, right) => gravityOf(left) - gravityOf(right) || left.name.localeCompare(right.name),
  );
  for (const group of sorted) {
    group.entries.sort(
      (left, right) => left.on.localeCompare(right.on) || left.folio.localeCompare(right.folio),
    );
  }
  return sorted;
}
