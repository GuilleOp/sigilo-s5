// Evaluación del auditor: precisión, exhaustividad y falsos positivos de cada regla sobre el conjunto
// etiquetado, barrido de umbrales de AUD-01, clasificación orientativa y defensas del modelo.
import { runAudit } from '../audit.ts';
import { suggestOffensesByRules } from '../classify-rules.ts';
import { AUDITOR_CONFIG } from '../config.ts';
import type { AuditorConfig } from '../config.ts';
import { suggestOffenses } from '../model/tasks.ts';
import { createScriptedModel } from '../model/scripted-model.ts';
import { labeledSets, LABELED_NARRATIVES } from './dataset.ts';
import type { LabeledSet, RuleUnderTest } from './dataset.ts';
import {
  MALICIOUS_OFFENSE_OUTPUTS,
  NARRATIVE_WITH_INJECTION,
  VALID_OFFENSE_OUTPUTS,
} from './model-cases.ts';

/** Reglas evaluadas, en orden. */
export const RULES_UNDER_TEST: readonly RuleUnderTest[] = [
  'AUD-01',
  'AUD-02',
  'AUD-03',
  'AUD-04',
  'AUD-05',
  'AUD-06',
  'AUD-07',
  'AUD-08',
];

/** Matriz de confusión de una regla. */
export interface RuleMetrics {
  ruleId: RuleUnderTest;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  trueNegatives: number;
  falsePositiveIds: string[];
  falseNegativeIds: string[];
}

/** Unidades candidatas de cada regla en un subconjunto. */
function universe(set: LabeledSet, rule: RuleUnderTest): string[] {
  switch (rule) {
    case 'AUD-01':
      return set.acts.map((act) => act.id);
    case 'AUD-02':
    case 'AUD-03': {
      const refs = new Set(set.cases.map((record) => record.caseRef));
      return set.acts
        .filter((act) => act.caseRef !== null && refs.has(act.caseRef))
        .map((act) => act.id);
    }
    case 'AUD-04':
    case 'AUD-05':
    case 'AUD-08':
      return set.cases.map((record) => record.caseRef);
    case 'AUD-06':
    case 'AUD-07':
      return [...new Set(set.cases.map((record) => record.authorityId))];
  }
}

function emptyMetrics(ruleId: RuleUnderTest): RuleMetrics {
  return {
    ruleId,
    truePositives: 0,
    falsePositives: 0,
    falseNegatives: 0,
    trueNegatives: 0,
    falsePositiveIds: [],
    falseNegativeIds: [],
  };
}

/** Evalúa las reglas en todos los subconjuntos con la configuración dada. */
export function evaluateRules(
  sets: readonly LabeledSet[] = labeledSets(),
  config: AuditorConfig = AUDITOR_CONFIG,
  rules: readonly RuleUnderTest[] = RULES_UNDER_TEST,
): RuleMetrics[] {
  const totals = new Map(rules.map((rule) => [rule, emptyMetrics(rule)]));
  for (const set of sets) {
    const report = runAudit({ acts: set.acts, cases: set.cases, today: set.today, config });
    for (const rule of rules) {
      const metrics = totals.get(rule) ?? emptyMetrics(rule);
      const flagged = new Set(
        report.findings
          .filter((item) => item.signal.ruleId === rule)
          .map((item) => item.signal.subject.id),
      );
      const positives = new Set(set.positives[rule] ?? []);
      for (const unit of universe(set, rule)) {
        const isFlagged = flagged.has(unit);
        const isPositive = positives.has(unit);
        if (isFlagged && isPositive) metrics.truePositives += 1;
        else if (isFlagged) {
          metrics.falsePositives += 1;
          metrics.falsePositiveIds.push(`${set.id}/${unit}`);
        } else if (isPositive) {
          metrics.falseNegatives += 1;
          metrics.falseNegativeIds.push(`${set.id}/${unit}`);
        } else metrics.trueNegatives += 1;
      }
    }
  }
  return rules.map((rule) => totals.get(rule) ?? emptyMetrics(rule));
}

/** Precisión, exhaustividad y tasa de falsos positivos; `null` cuando el denominador es 0. */
export function ratios(metrics: RuleMetrics): {
  precision: number | null;
  recall: number | null;
  falsePositiveRate: number | null;
} {
  const { truePositives: tp, falsePositives: fp, falseNegatives: fn, trueNegatives: tn } = metrics;
  return {
    precision: tp + fp === 0 ? null : tp / (tp + fp),
    recall: tp + fn === 0 ? null : tp / (tp + fn),
    falsePositiveRate: fp + tn === 0 ? null : fp / (fp + tn),
  };
}

/** Barrido de umbrales de AUD-01. */
export function sweepTemplateThresholds(
  shingleSizes: readonly number[] = [1, 2, 3],
  similarities: readonly number[] = [500, 600, 750, 900],
  minMatches: readonly number[] = [5, 10, 20],
): { shingleSize: number; similarityPermille: number; minMatches: number; metrics: RuleMetrics }[] {
  const sets = labeledSets();
  return shingleSizes.flatMap((shingleSize) =>
    similarities.flatMap((similarityPermille) =>
      minMatches.map((matches) => {
        const config: AuditorConfig = {
          ...AUDITOR_CONFIG,
          templateClosure: {
            ...AUDITOR_CONFIG.templateClosure,
            shingleSize,
            similarityPermille,
            minMatches: matches,
          },
        };
        const [metrics] = evaluateRules(sets, config, ['AUD-01']);
        return {
          shingleSize,
          similarityPermille,
          minMatches: matches,
          metrics: metrics ?? emptyMetrics('AUD-01'),
        };
      }),
    ),
  );
}

/** Resultado de la clasificación orientativa por reglas. */
export interface ClassificationMetrics {
  narratives: number;
  withAcceptable: number;
  topOneCorrect: number;
  anyCorrect: number;
  suggestions: number;
  acceptableSuggestions: number;
  shouldAbstain: number;
  abstainedCorrectly: number;
  misses: string[];
  wrongTopOne: string[];
}

/** Evalúa la clasificación orientativa por palabras clave (sin modelo). */
export function evaluateRuleClassification(): ClassificationMetrics {
  const result: ClassificationMetrics = {
    narratives: LABELED_NARRATIVES.length,
    withAcceptable: 0,
    topOneCorrect: 0,
    anyCorrect: 0,
    suggestions: 0,
    acceptableSuggestions: 0,
    shouldAbstain: 0,
    abstainedCorrectly: 0,
    misses: [],
    wrongTopOne: [],
  };
  for (const item of LABELED_NARRATIVES) {
    const suggested = suggestOffensesByRules(item.narrative).map(
      (suggestion) => suggestion.offenseCode,
    );
    const acceptable = new Set(item.acceptable);
    result.suggestions += suggested.length;
    result.acceptableSuggestions += suggested.filter((code) => acceptable.has(code)).length;
    if (acceptable.size === 0) {
      result.shouldAbstain += 1;
      if (suggested.length === 0) result.abstainedCorrectly += 1;
      continue;
    }
    result.withAcceptable += 1;
    const [top] = suggested;
    if (top !== undefined && acceptable.has(top)) result.topOneCorrect += 1;
    else if (top !== undefined) result.wrongTopOne.push(`${item.id} (${top})`);
    if (suggested.some((code) => acceptable.has(code))) result.anyCorrect += 1;
    else result.misses.push(item.id);
  }
  return result;
}

/** Resultado de las defensas del adaptador del modelo con el doble de pruebas. */
export interface DefenseMetrics {
  malicious: number;
  maliciousDiscarded: number;
  valid: number;
  validAccepted: number;
  failures: string[];
}

/** Pasa las salidas maliciosas y válidas por el adaptador con el doble de pruebas. */
export async function evaluateModelDefenses(): Promise<DefenseMetrics> {
  const result: DefenseMetrics = {
    malicious: 0,
    maliciousDiscarded: 0,
    valid: 0,
    validAccepted: 0,
    failures: [],
  };
  const input = { caseRef: 'case.eval', narrative: NARRATIVE_WITH_INJECTION, today: '2026-12-10' };
  for (const item of MALICIOUS_OFFENSE_OUTPUTS) {
    result.malicious += 1;
    const outcome = await suggestOffenses(createScriptedModel([item.output]), input);
    if (outcome.status === 'discarded') result.maliciousDiscarded += 1;
    else result.failures.push(`maliciosa aceptada: ${item.name}`);
  }
  for (const item of VALID_OFFENSE_OUTPUTS) {
    result.valid += 1;
    const outcome = await suggestOffenses(createScriptedModel([item.output]), input);
    if (outcome.status === 'suggested') result.validAccepted += 1;
    else result.failures.push(`válida descartada: ${item.name}`);
  }
  return result;
}
