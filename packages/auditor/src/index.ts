// Punto de entrada de @sigilo/auditor: reglas deterministas AUD-01 a AUD-08 que señalan con
// evidencia y nunca deciden (ADR 0009). El modelo local opcional está en `./model`.
export { AUDITOR_CONFIG, RULES_VERSION } from './config.ts';
export type { AuditorConfig } from './config.ts';
export type {
  AttachmentRef,
  AuthorityAct,
  AuthorityActKind,
  AuditSignal,
  CaseActivity,
  CaseActivityKind,
  CaseRecord,
  ClosureAct,
  EvidencePair,
  Qualification,
  SignalBasis,
} from './types.ts';
export { assertNeutralWording, hasForbiddenWording, MODEL_NOTE, SIGNAL_NOTE } from './signal.ts';
export { coveredFragments, foldText, jaccard, shingles, tokenize } from './text.ts';
export {
  compareWithAuthority,
  detectTemplateClosure,
  detectTemplateClosures,
} from './rules/template-closure.ts';
export type { TemplateComparison } from './rules/template-closure.ts';
export {
  detectArchiveAgainstEvidence,
  isLackOfElementsArchive,
} from './rules/archive-against-evidence.ts';
export {
  detectDowngradedQualification,
  actKindOf,
  qualificationOf,
} from './rules/downgraded-qualification.ts';
export {
  detectDeadlineSignals,
  detectEmptyActivity,
  detectPrePrescriptionActivity,
  prescriptionDueOn,
  reportAdmittedOn,
} from './rules/deadlines.ts';
export {
  detectArchiveConcentration,
  detectCorroboratedArchiveRate,
  isCorroborated,
} from './rules/authority-patterns.ts';
export { runAudit } from './audit.ts';
export type { AuditFinding, AuditInput, AuditReport } from './audit.ts';
export { buildLedgerRecord, digestOf, subjectDigestOf } from './ledger-record.ts';
export { OFFENSE_KEYWORDS, suggestOffensesByRules } from './classify-rules.ts';
export type { RuleOffenseSuggestion } from './classify-rules.ts';
