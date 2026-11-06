// Punto de entrada de la evaluación publicada del auditor: conjunto etiquetado, métricas y reporte.
export { labeledSets, LABELED_NARRATIVES } from './dataset.ts';
export type { LabeledNarrative, LabeledSet, RuleUnderTest } from './dataset.ts';
export {
  evaluateModelDefenses,
  evaluateRuleClassification,
  evaluateRules,
  ratios,
  RULES_UNDER_TEST,
  sweepTemplateThresholds,
} from './run.ts';
export type { ClassificationMetrics, DefenseMetrics, RuleMetrics } from './run.ts';
export { renderEvaluation } from './report.ts';
export {
  MALICIOUS_OFFENSE_OUTPUTS,
  NARRATIVE_WITH_INJECTION,
  VALID_OFFENSE_OUTPUTS,
} from './model-cases.ts';
export {
  controlClosures,
  dormantCase,
  martaCase,
  martaQualification,
  scenarioDay,
  templateArchives,
  templateQualificationText,
  templateText,
} from './scenario.ts';
