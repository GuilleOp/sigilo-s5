// Datos del observatorio «¿Sirvió denunciar?»: indicadores por autoridad y resultados agregados de
// la red (línea base SINTÉTICA del escenario de la demostración, docs/demo-escenario.md sección 8)
// y la matriz de cobertura por entidad a partir de datos/cobertura/matriz.json.
// Seguridad: solo conteos agregados; ningún folio, persona ni texto de denuncia.

/** Indicadores de una autoridad en los 12 meses previos. */
export interface AuthorityIndicators {
  authorityId: string;
  name: string;
  received: number;
  archived: number;
  overdue: number;
  templateClosures: number;
  declaredSanctions: number;
  confirmed: number;
  contradicted: number;
  noCoverage: number;
}

/** Línea base sintética por autoridad (escenario, sección 8.1). */
export const DEMO_AUTHORITY_INDICATORS: readonly AuthorityIndicators[] = [
  {
    authorityId: 'authority.oic-iffe',
    name: 'Órgano Interno de Control en el Instituto Federal Ficticio de Equipamiento',
    received: 60,
    archived: 45,
    overdue: 15,
    templateClosures: 31,
    declaredSanctions: 2,
    confirmed: 0,
    contradicted: 1,
    noCoverage: 1,
  },
  {
    authorityId: 'authority.oic-dfps',
    name: 'Órgano Interno de Control en la Delegación Federal Ficticia de Programas Sociales',
    received: 40,
    archived: 15,
    overdue: 5,
    templateClosures: 0,
    declaredSanctions: 1,
    confirmed: 1,
    contradicted: 0,
    noCoverage: 0,
  },
  {
    authorityId: 'authority.comptroller-queretaro',
    name: 'Contraloría Estatal Ficticia de Querétaro',
    received: 85,
    archived: 25,
    overdue: 5,
    templateClosures: 0,
    declaredSanctions: 4,
    confirmed: 4,
    contradicted: 0,
    noCoverage: 0,
  },
  {
    authorityId: 'authority.comptroller-ejemplo',
    name: 'Contraloría Ficticia del Estado Ejemplo',
    received: 20,
    archived: 10,
    overdue: 10,
    templateClosures: 0,
    declaredSanctions: 3,
    confirmed: 0,
    contradicted: 0,
    noCoverage: 3,
  },
  {
    authorityId: 'authority.oversight-federal',
    name: 'Unidad Ficticia de Supervisión de Órganos Internos de Control',
    received: 5,
    archived: 0,
    overdue: 0,
    templateClosures: 0,
    declaredSanctions: 0,
    confirmed: 0,
    contradicted: 0,
    noCoverage: 0,
  },
];

/** Resultado agregado de la red (escenario, sección 8.3), en múltiplos de 5. */
export interface OutcomeCount {
  key: string;
  label: string;
  count: number;
}

export const DEMO_OUTCOMES: readonly OutcomeCount[] = [
  { key: 'sanctioned-verified', label: 'Con sanción verificada en el registro público', count: 5 },
  { key: 'sanctioned-unverified', label: 'Con sanción declarada sin comprobar', count: 5 },
  { key: 'insufficient-evidence', label: 'Archivadas por falta de elementos', count: 95 },
  { key: 'reopened', label: 'Archivadas y reabiertas', count: 5 },
  { key: 'referred', label: 'Canalizadas a otra autoridad', count: 20 },
  { key: 'merged', label: 'Acumuladas a otro expediente', count: 10 },
  { key: 'inadmissible', label: 'Improcedentes', count: 10 },
  { key: 'in-progress', label: 'En trámite', count: 60 },
];

/** Porcentaje entero redondeado; 0 si no hay base. */
export function percent(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

/** Sistemas de la matriz de cobertura, en el orden en que se muestran. */
export const COVERAGE_SYSTEMS = ['S1', 'S2', 'S3S', 'S3P', 'S6'] as const;
export type CoverageSystem = (typeof COVERAGE_SYSTEMS)[number];

/** Nombre corto de cada sistema. */
export const COVERAGE_SYSTEM_LABELS: Readonly<Record<CoverageSystem, string>> = {
  S1: 'S1 Declaraciones',
  S2: 'S2 Servidores en contrataciones',
  S3S: 'S3 Servidores sancionados',
  S3P: 'S3 Particulares sancionados',
  S6: 'S6 Contrataciones',
};

/** Fila de la matriz por entidad: periodos con datos de cada sistema, o vacío sin cobertura. */
export interface CoverageEntityRow {
  stateCode: string;
  stateName: string;
  periods: Readonly<Record<CoverageSystem, readonly string[]>>;
  isSynthetic: boolean;
}

interface RawRow {
  entidadClave?: unknown;
  entidad?: unknown;
  sistema?: unknown;
  periodo?: unknown;
  hayDatos?: unknown;
}

function emptyPeriods(): Record<CoverageSystem, string[]> {
  return { S1: [], S2: [], S3S: [], S3P: [], S6: [] };
}

function isSystem(value: unknown): value is CoverageSystem {
  return typeof value === 'string' && (COVERAGE_SYSTEMS as readonly string[]).includes(value);
}

/**
 * Resume la matriz publicada por entidad y sistema. Agrega al final el Estado Ejemplo sintético del
 * escenario, sin ningún sistema conectado. Lanza si el archivo no tiene el formato esperado.
 */
export function summarizeCoverage(raw: unknown): CoverageEntityRow[] {
  const rows = (raw as { version?: unknown; filas?: unknown } | null)?.filas;
  if (!Array.isArray(rows)) throw new Error('La matriz de cobertura no tiene el formato esperado.');
  const byState = new Map<
    string,
    CoverageEntityRow & { periods: Record<CoverageSystem, string[]> }
  >();
  for (const row of rows as RawRow[]) {
    if (typeof row.entidadClave !== 'string' || typeof row.entidad !== 'string') continue;
    const entry = byState.get(row.entidadClave) ?? {
      stateCode: row.entidadClave,
      stateName: row.entidad,
      periods: emptyPeriods(),
      isSynthetic: false,
    };
    byState.set(row.entidadClave, entry);
    if (row.hayDatos === true && isSystem(row.sistema) && typeof row.periodo === 'string') {
      entry.periods[row.sistema].push(row.periodo);
    }
  }
  const result = [...byState.values()].sort((a, b) => a.stateCode.localeCompare(b.stateCode));
  result.push({
    stateCode: 'state.ejemplo',
    stateName: 'Estado Ejemplo (ficticio)',
    periods: emptyPeriods(),
    isSynthetic: true,
  });
  return result;
}

/**
 * «2020 a 2023», «2021», «Sin fecha» o «Sin cobertura». Los años van en orden; los registros sin
 * fecha y el total de la fuente (sin años) se dicen en palabras.
 */
export function describePeriods(periods: readonly string[]): string {
  if (periods.length === 0) return 'Sin cobertura';
  const years = periods.filter((period) => /^\d{4}$/u.test(period)).sort();
  const hasUndated = periods.includes('sin_fecha');
  const first = years[0];
  const last = years[years.length - 1];
  if (first === undefined || last === undefined) {
    return hasUndated ? 'Sin fecha' : 'Con datos, sin periodo';
  }
  const range = first === last ? first : `${first} a ${last}`;
  return hasUndated ? `${range} y sin fecha` : range;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

/** CSV de los indicadores por autoridad. */
export function authorityIndicatorsCsv(rows: readonly AuthorityIndicators[]): string {
  const header = [
    'autoridad',
    'nombre',
    'recibidas',
    'archivadas',
    'tasa_archivo_pct',
    'plazo_vencido',
    'acuerdos_plantilla',
    'sanciones_declaradas',
    'confirmadas',
    'contradichas',
    'sin_cobertura',
  ];
  const lines = rows.map((row) =>
    [
      row.authorityId,
      row.name,
      row.received,
      row.archived,
      percent(row.archived, row.received),
      row.overdue,
      row.templateClosures,
      row.declaredSanctions,
      row.confirmed,
      row.contradicted,
      row.noCoverage,
    ]
      .map(csvCell)
      .join(','),
  );
  return `${[header.join(','), ...lines].join('\n')}\n`;
}

/** CSV de los resultados agregados. */
export function outcomesCsv(rows: readonly OutcomeCount[]): string {
  const lines = rows.map((row) => [row.key, row.label, row.count].map(csvCell).join(','));
  return `${['resultado,descripcion,denuncias', ...lines].join('\n')}\n`;
}
