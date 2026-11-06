// Punto de entrada público de @sigilo/contexto-pdn: verificaciones con tres resultados, conflicto de
// interés y ficha de contexto con prioridad explicable. Solo para el nodo y el panel de la autoridad.
// Las fuentes sintéticas están en `./synthetic` y las de SQLite (Node) en `./sqlite`.

export type {
  CheckKind,
  ContractRecord,
  ContractsSource,
  DeclarationRecord,
  DeclaredInterestsSource,
  DeclaredOrganization,
  Difference,
  Evidence,
  NoCoverageReason,
  PdnSystem,
  PersonRef,
  ProcurementMethod,
  ProcurementStaffRecord,
  ProcurementStaffSource,
  SanctionRecord,
  SanctionsSource,
  Source,
  SourceCitation,
  SourceInfo,
  SourceScope,
  Supplier,
  TaxListEntry,
  TaxListSource,
  TaxListStatus,
  Verification,
  VerificationOutcome,
} from './types.ts';

export { addDays, citeSource, daysBetween, formatAmount, formatDataDate } from './citation.ts';

export { assessCoverage, NO_COVERAGE_TEXT, parseCoverageMatrix, pickSource } from './coverage.ts';
export type {
  CoverageDecision,
  CoverageMatrix,
  CoverageQuery,
  CoverageRow,
  MatrixSystem,
} from './coverage.ts';

export { ALTERNATIVE_SOURCES } from './alternatives.ts';

export {
  institutionRefKey,
  organizationKey,
  personNameKey,
  SANCTION_LABELS,
  sanctionKindsOf,
} from './names.ts';

export { checkConflictOfInterest, CHAIN_OF_COMMAND_DEPTH } from './conflict.ts';
export type { ConflictAlert, ConflictCheck, ConflictGap } from './conflict.ts';

export {
  contractEvidence,
  extractContractClaims,
  PROCUREMENT_METHOD_LABELS,
  verifyCitedContract,
} from './contract.ts';
export type { ContractClaim, ContractVerification } from './contract.ts';

export { checkContractSuppliers, checkTaxList, TAX_LIST_STATUS_LABELS } from './tax-list.ts';
export type { TaxListVerification } from './tax-list.ts';

export {
  checkUnverifiableSanction,
  DEFAULT_UNVERIFIABLE_SANCTION_CONFIG,
  verifySanction,
} from './sanction.ts';
export type {
  SanctionClaim,
  UnverifiableSanctionConfig,
  UnverifiableSanctionFlag,
} from './sanction.ts';

export { buildContextSheet, classifyOffense, PRIORITY_CONFIG } from './priority.ts';
export type {
  AppliedFactor,
  ContextSheet,
  ContextSheetInput,
  OffenseSeverity,
  Priority,
  PriorityConfig,
  PriorityFactorDefinition,
  PriorityFactorId,
} from './priority.ts';
