// Punto de entrada público de @sigilo/anonimato: grupo de anonimato en el navegador de quien denuncia.
// Seguridad: solo descarga del mismo origen el índice y el fragmento de una entidad; nunca la PDN.

export {
  areaKey,
  FEDERAL_STATE_CODE,
  institutionKey,
  institutionNameKey,
  textKey,
} from './normalize.ts';

export { parseAnonymityFragment, parseAnonymityIndex } from './fragment.ts';
export type {
  AnonymityFragment,
  AnonymityIndex,
  AnonymityIndexEntry,
  AreaRecord,
  BucketLabel,
  EnteRecord,
  GovernmentOrderCode,
  PoolRecord,
  ProviderWindow,
} from './fragment.ts';

export { createAnonymityLoader, DEFAULT_BASE_PATH, fragmentKeyFor } from './loader.ts';
export type {
  AnonymityData,
  AnonymityLoader,
  AnonymityLoaderOptions,
  FetchLike,
  FetchResponseLike,
} from './loader.ts';

export {
  ANONYMITY_LEVEL_LABELS,
  ANONYMITY_RISK_LABELS,
  assessAnonymityGroup,
  describeAssessment,
  findEnte,
  formatSpanishDate,
  listAreas,
  listEntes,
} from './assess.ts';
export type {
  AnonymityAssessment,
  AnonymityLevel,
  AnonymityQuery,
  AnonymityRisk,
  SuggestedAction,
  SuggestedActionKind,
} from './assess.ts';

export {
  anonymityRiskReason,
  WEIGHT_ANONYMITY_HIGH,
  WEIGHT_ANONYMITY_LOW,
  WEIGHT_ANONYMITY_MEDIUM,
  WEIGHT_ANONYMITY_UNKNOWN,
  withAnonymityFactor,
} from './risk-factor.ts';
