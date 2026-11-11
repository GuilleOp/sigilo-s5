// Ficha de contexto y prioridad explicable: puntaje entero, factores con su peso y su fuente.
// La configuración (factores, pesos y umbrales) es declarativa y se publica con el estándar.

import { citeSource, formatAmount } from './citation.ts';
import type { ConflictCheck } from './conflict.ts';
import { PROCUREMENT_METHOD_LABELS } from './contract.ts';
import type { ContractVerification } from './contract.ts';
import type { TaxListVerification } from './tax-list.ts';
import type { ContractsSource, Evidence, SourceCitation } from './types.ts';

/** Factores de la prioridad. */
export type PriorityFactorId =
  | 'offense-grave'
  | 'contract-direct-award'
  | 'contract-large-amount'
  | 'supplier-tax-list-69b'
  | 'independent-corroboration'
  | 'possible-campaign'
  | 'public-record-inconsistency'
  | 'conflict-of-interest';

/** Definición pública de un factor. */
export interface PriorityFactorDefinition {
  label: string;
  /** Peso entero. Con `perUnit`, es el peso de cada unidad (por ejemplo, cada persona adicional). */
  weight: number;
  perUnit?: boolean;
  /** Tope del factor cuando es por unidad. */
  maxWeight?: number;
  description: string;
}

/** Configuración declarativa de la prioridad. */
export interface PriorityConfig {
  version: string;
  /** Umbrales: `score >= high` es alta; `score >= medium` es media; lo demás, baja. */
  levels: { high: number; medium: number };
  /** Monto a partir del cual un contrato suma el factor de monto alto. */
  largeAmountMxn: number;
  factors: Readonly<Record<PriorityFactorId, PriorityFactorDefinition>>;
}

/** Configuración publicada del prototipo (pesos y umbrales del escenario de la demostración). */
export const PRIORITY_CONFIG: PriorityConfig = {
  version: '1.0.0',
  levels: { high: 60, medium: 30 },
  largeAmountMxn: 1_000_000,
  factors: {
    'offense-grave': {
      label: 'Falta grave o hecho de corrupción',
      weight: 30,
      description:
        'La conducta es falta grave (LGRA, arts. 51 a 64 Quáter y 65 a 73) o delito por hechos de corrupción (CPF).',
    },
    'contract-direct-award': {
      label: 'Adjudicación directa',
      weight: 15,
      description: 'El S6 registra el contrato citado como adjudicación directa.',
    },
    'contract-large-amount': {
      label: 'Monto alto',
      weight: 10,
      description: 'El S6 registra un monto adjudicado igual o mayor que el umbral publicado.',
    },
    'supplier-tax-list-69b': {
      label: 'Proveedor en la lista tipo 69-B',
      weight: 20,
      description:
        'Un proveedor adjudicado aparece en la lista de operaciones presuntamente inexistentes.',
    },
    'independent-corroboration': {
      label: 'Corroboración independiente',
      weight: 10,
      perUnit: true,
      maxWeight: 30,
      description:
        'Cada persona independiente adicional que denuncia lo mismo (corroboración ciega y señales de independencia; dato externo).',
    },
    'possible-campaign': {
      label: 'Posible campaña coordinada',
      weight: 0,
      description:
        'No resta: las denuncias del grupo cuentan como una sola fuente en la corroboración.',
    },
    'public-record-inconsistency': {
      label: 'Inconsistente con registros públicos',
      weight: 0,
      description:
        'No resta: la autoridad revisa la diferencia; nunca se etiqueta una denuncia como falsa.',
    },
    'conflict-of-interest': {
      label: 'Posible conflicto de interés en la autoridad',
      weight: 0,
      description: 'No cambia la prioridad: genera una alerta y la regla de escalamiento.',
    },
  },
};

/** Gravedad de una conducta del catálogo. */
export type OffenseSeverity = 'grave' | 'no-grave' | 'crime' | 'unknown';

/**
 * Clasifica la clave de conducta: LGRA arts. 49 y 50 son no graves; 51 a 64 (servidores) y 65 a
 * 73 (particulares) son graves; CPF son delitos por hechos de corrupción.
 */
export function classifyOffense(code: string): OffenseSeverity {
  const match = /^(LGRA|CPF)-(\d+)/u.exec(code);
  if (match === null) return 'unknown';
  if (match[1] === 'CPF') return 'crime';
  const article = Number(match[2]);
  if (article === 49 || article === 50) return 'no-grave';
  if (article >= 51 && article <= 73) return 'grave';
  return 'unknown';
}

/** Factor aplicado en la ficha. */
export interface AppliedFactor {
  id: PriorityFactorId;
  label: string;
  /** Puntos que suma (puede ser 0 si el factor solo informa). */
  points: number;
  reason: string;
  /** Fuente del dato; `null` si viene de la denuncia o de fuera (por ejemplo, la corroboración). */
  citation: SourceCitation | null;
}

/** Prioridad explicable. */
export interface Priority {
  score: number;
  level: 'high' | 'medium' | 'low';
  label: string;
  factors: readonly AppliedFactor[];
  configVersion: string;
}

/** Ficha de contexto para la autoridad. */
export interface ContextSheet {
  priority: Priority;
  /** Datos públicos relevantes, cada uno con su fuente y fecha. */
  facts: readonly Evidence[];
  /** Alertas que no cambian la prioridad (conflicto, inconsistencias). */
  notices: readonly string[];
}

/** Entradas de la ficha. Todo lo que viene de la PDN llega ya verificado con cobertura. */
export interface ContextSheetInput {
  offenseCode: string;
  /** Número de personas independientes que denuncian lo mismo (incluida esta). Lo calcula otro módulo. */
  independentReporters: number;
  isPossibleCampaign?: boolean;
  contract?: { verification: ContractVerification; source: ContractsSource };
  taxList?: readonly TaxListVerification[];
  conflict?: ConflictCheck;
}

const LEVEL_LABELS: Readonly<Record<Priority['level'], string>> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

/**
 * Construye la ficha de contexto con prioridad explicable. El puntaje es la suma entera de los
 * factores aplicados; cada factor dice por qué se aplicó y de qué fuente viene.
 */
export function buildContextSheet(
  input: ContextSheetInput,
  config: PriorityConfig = PRIORITY_CONFIG,
): ContextSheet {
  const factors: AppliedFactor[] = [];
  const facts: Evidence[] = [];
  const notices: string[] = [];
  const apply = (
    id: PriorityFactorId,
    reason: string,
    citation: SourceCitation | null,
    units = 1,
  ): void => {
    const definition = config.factors[id];
    const raw = definition.perUnit ? definition.weight * units : definition.weight;
    const points = Math.trunc(
      definition.maxWeight === undefined ? raw : Math.min(raw, definition.maxWeight),
    );
    factors.push({ id, label: definition.label, points, reason, citation });
  };

  const severity = classifyOffense(input.offenseCode);
  if (severity === 'grave' || severity === 'crime') {
    apply(
      'offense-grave',
      severity === 'grave'
        ? `La conducta ${input.offenseCode} es falta grave.`
        : `La conducta ${input.offenseCode} es un delito por hechos de corrupción.`,
      null,
    );
  }

  const contract = input.contract;
  if (contract !== undefined) {
    const { verification, source } = contract;
    const record = verification.record;
    const citation = citeSource(source.info);
    facts.push(...verification.evidence);
    if (record !== null && record.method === 'direct') {
      apply(
        'contract-direct-award',
        `El ${source.info.label} registra ${record.ocid} como ${PROCUREMENT_METHOD_LABELS.direct}${record.rationale === null ? '' : ` (justificación: ${record.rationale})`}.`,
        citation,
      );
    }
    const amount = record?.awards.reduce((sum, award) => sum + (award.amount ?? 0), 0) ?? 0;
    if (record !== null && amount >= config.largeAmountMxn) {
      apply(
        'contract-large-amount',
        `Monto adjudicado de ${formatAmount(amount)} (umbral: ${formatAmount(config.largeAmountMxn)}).`,
        citation,
      );
    }
    if (verification.outcome === 'contradicted') {
      apply('public-record-inconsistency', verification.explanation, citation);
      notices.push(verification.explanation);
    } else if (verification.outcome === 'no_coverage') {
      notices.push(`Contrato citado: ${verification.explanation}`);
    }
  }

  const listed = (input.taxList ?? []).filter((item) => item.outcome === 'confirmed');
  if (listed.length > 0) {
    const first = listed[0] as TaxListVerification;
    facts.push(...listed.flatMap((item) => item.evidence));
    apply('supplier-tax-list-69b', first.explanation, first.citations[0] ?? null);
  }

  const reporters = Math.max(1, Math.trunc(input.independentReporters));
  if (reporters > 1) {
    apply(
      'independent-corroboration',
      // El índice solo revela intervalos («2 o más»); el texto no debe leerse como un conteo exacto.
      '2 o más personas independientes denuncian lo mismo, incluida esta denuncia. Son señales de independencia, no pruebas de identidad.',
      null,
      reporters - 1,
    );
  }
  if (input.isPossibleCampaign === true) {
    apply(
      'possible-campaign',
      'Las denuncias del grupo se parecen mucho y llegaron juntas: cuentan como una sola fuente.',
      null,
    );
    notices.push(
      'Posible campaña coordinada: las denuncias del grupo cuentan como una sola fuente. La autoridad decide.',
    );
  }
  if (input.conflict?.outcome === 'possible-conflict') {
    apply('conflict-of-interest', input.conflict.summary, input.conflict.citations[0] ?? null);
    notices.push(...input.conflict.alerts.map((alert) => alert.explanation));
  }

  const score = factors.reduce((total, factor) => total + factor.points, 0);
  const level =
    score >= config.levels.high ? 'high' : score >= config.levels.medium ? 'medium' : 'low';
  return {
    priority: { score, level, label: LEVEL_LABELS[level], factors, configVersion: config.version },
    facts,
    notices,
  };
}
