// Matriz de cobertura (datos/cobertura/matriz.json) y decisión de cobertura antes de opinar.
// Si la fuente no cubre la entidad, la institución o el periodo, el resultado es «sin cobertura».

import { institutionRefKey } from './names.ts';
import type { NoCoverageReason, PdnSystem, Source } from './types.ts';

/** Sistemas de la matriz (la lista tipo 69-B no es de la PDN y no aparece). */
export type MatrixSystem = 'S1' | 'S2' | 'S3S' | 'S3P' | 'S6';

/** Fila de la matriz: entidad, sistema y periodo (`total` o un año). */
export interface CoverageRow {
  stateCode: string;
  stateName: string;
  system: MatrixSystem;
  period: string;
  hasData: boolean;
  dateMin: string | null;
  dateMax: string | null;
  notes: readonly string[];
}

/** Matriz de cobertura validada. */
export interface CoverageMatrix {
  rows: readonly CoverageRow[];
}

const MATRIX_SYSTEMS: readonly MatrixSystem[] = ['S1', 'S2', 'S3S', 'S3P', 'S6'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalDate(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : null;
}

/** Valida y convierte `matriz.json` (versión 1). Lanza `Error` si el formato no coincide. */
export function parseCoverageMatrix(raw: unknown): CoverageMatrix {
  if (!isRecord(raw) || raw['version'] !== 1 || !Array.isArray(raw['filas'])) {
    throw new Error('La matriz de cobertura no tiene el formato esperado.');
  }
  const rows = raw['filas'].map((row): CoverageRow => {
    const system = MATRIX_SYSTEMS.find((item) => isRecord(row) && item === row['sistema']);
    if (
      !isRecord(row) ||
      system === undefined ||
      typeof row['entidadClave'] !== 'string' ||
      typeof row['periodo'] !== 'string'
    ) {
      throw new Error('La matriz de cobertura tiene una fila inválida.');
    }
    return {
      stateCode: row['entidadClave'],
      stateName: typeof row['entidad'] === 'string' ? row['entidad'] : row['entidadClave'],
      system,
      period: row['periodo'],
      hasData: row['hayDatos'] === true,
      dateMin: optionalDate(row['fechaMin']),
      dateMax: optionalDate(row['fechaMax']),
      notes: Array.isArray(row['notas'])
        ? row['notas'].filter((note): note is string => typeof note === 'string')
        : [],
    };
  });
  return { rows };
}

function isMatrixSystem(system: PdnSystem): system is MatrixSystem {
  return MATRIX_SYSTEMS.some((item) => item === system);
}

/** Qué se pregunta a la matriz y a la fuente. */
export interface CoverageQuery {
  matrix: CoverageMatrix;
  source: Source;
  stateCode: string;
  /** Nombre de la institución tal como se cita; se normaliza con la clave de datos/proceso. */
  institution?: string;
  /** Fecha del hecho o del registro buscado (AAAA-MM-DD o AAAA-MM). */
  date?: string;
}

/** Decisión de cobertura. */
export type CoverageDecision =
  | { isCovered: true }
  | {
      isCovered: false;
      reason: Exclude<NoCoverageReason, 'record-not-found' | 'ambiguous-record'>;
      detail: string;
    };

/** Texto de cada motivo de «sin cobertura», para la autoridad. */
export const NO_COVERAGE_TEXT: Readonly<Record<NoCoverageReason, string>> = {
  'state-without-system': 'La fuente no tiene datos de esta entidad.',
  'institution-not-connected': 'La institución no está conectada a la fuente.',
  'period-out-of-range': 'La fecha está fuera del periodo que cubre la fuente.',
  'record-not-found':
    'La fuente cubre a la institución, pero no encontramos el registro. Que no aparezca no prueba nada: puede faltar o no haberse publicado aún.',
  'ambiguous-record':
    'Hay varios registros con ese número de expediente en la institución y ninguno coincide con la persona señalada: no podemos decir cuál es.',
};

/**
 * Decide si una fuente puede opinar sobre una entidad, institución y fecha. Consulta primero la
 * matriz (¿hay datos del sistema en la entidad?) y después el alcance declarado por la fuente.
 */
export function assessCoverage(query: CoverageQuery): CoverageDecision {
  const { matrix, source, stateCode } = query;
  const system = source.info.system;
  if (isMatrixSystem(system)) {
    const total = matrix.rows.find(
      (row) => row.stateCode === stateCode && row.system === system && row.period === 'total',
    );
    if (total === undefined || !total.hasData) {
      const notes = total?.notes.length ? ` ${total.notes.join(' ')}` : '';
      return {
        isCovered: false,
        reason: 'state-without-system',
        detail: `La matriz de cobertura no registra datos de ${system} para la entidad ${total?.stateName ?? stateCode}.${notes}`,
      };
    }
  }
  if (!source.scope.stateCodes.includes(stateCode)) {
    return {
      isCovered: false,
      reason: 'state-without-system',
      detail: `${source.info.label} no cubre la entidad ${stateCode}.`,
    };
  }
  const institutions = source.scope.institutionKeys;
  if (query.institution !== undefined && institutions !== undefined) {
    const key = institutionRefKey(query.institution, stateCode);
    if (!institutions.includes(key)) {
      return {
        isCovered: false,
        reason: 'institution-not-connected',
        detail: `«${query.institution}» no aparece entre las instituciones conectadas a ${source.info.label}.`,
      };
    }
  }
  if (query.date !== undefined) {
    const day = query.date.length === 7 ? `${query.date}-01` : query.date.slice(0, 10);
    const lastDay = query.date.length === 7 ? `${query.date}-31` : day;
    const { periodFrom, periodTo } = source.scope;
    if (
      (periodFrom !== undefined && lastDay < periodFrom) ||
      (periodTo !== undefined && day > periodTo)
    ) {
      return {
        isCovered: false,
        reason: 'period-out-of-range',
        detail: `${source.info.label} cubre de ${periodFrom ?? 'su inicio'} a ${periodTo ?? 'su fecha de corte'}.`,
      };
    }
  }
  return { isCovered: true };
}

/** Elige, de varias fuentes, la que cubre la entidad; si ninguna, la primera (que dirá «sin cobertura»). */
export function pickSource<T extends Source>(sources: readonly T[], stateCode: string): T | null {
  return (
    sources.find((source) => source.scope.stateCodes.includes(stateCode)) ?? sources[0] ?? null
  );
}
