// Capas del mapa del observatorio: cobertura de la PDN, protección del anonimato y modelo de nodo.
// Cada capa da a cada entidad un escalón de 1 a 5 de una escala de un solo tono (o «sin datos», que
// se dibuja con trama), un texto y el resumen que acompaña al mapa. Funciones puras: el componente
// solo dibuja. Solo cifras agregadas por entidad; nunca nivel municipal ni personas.
import { parseCsv } from '../../lib/csv.ts';
import { MAP_ENTITIES } from './mapa-entidades.ts';
import { COVERAGE_SYSTEMS } from './observatory-data.ts';
import type { CoverageEntityRow, CoverageSystem } from './observatory-data.ts';

/** Capas del mapa, en el orden del selector. */
export const MAP_LAYERS = ['coverage', 'anonymity', 'node'] as const;
export type MapLayer = (typeof MAP_LAYERS)[number];

/** Nombre visible de cada capa. */
export const MAP_LAYER_LABELS: Readonly<Record<MapLayer, string>> = {
  coverage: 'Cobertura de la PDN',
  anonymity: 'Protección del anonimato',
  node: 'Modelo de nodo',
};

/** Escalón de la escala (1 a 5) o `null` si no hay datos. */
export type MapStep = 1 | 2 | 3 | 4 | 5 | null;

/** Valor de una entidad en una capa. */
export interface MapValue {
  step: MapStep;
  /** Texto corto para la ficha y el nombre accesible. */
  text: string;
}

/** Entrada de la leyenda: escalón (o sin datos) y su texto. */
export interface LegendItem {
  step: MapStep;
  label: string;
}

/** Entidad con nodo propio; las demás usan el nodo común. */
export const OWN_NODE_STATE = '22';

/** Porcentaje de personas en áreas con k ≥ 10, por clave INEGI (sin dato si no hay S1). */
export type AnonymityByState = ReadonlyMap<string, number>;

/**
 * Lee `resumen.csv` de los datos abiertos de grupos de anonimato: por entidad, el porcentaje de
 * personas cuya área de adscripción reúne a 10 o más (100 menos `pct_personas_k_menor_10_area`).
 * Omite lo federal, el agregado nacional y los porcentajes suprimidos.
 */
export function parseAnonymitySummary(text: string): Map<string, number> {
  const [headers = [], ...rows] = parseCsv(text).filter((row) => row.some((cell) => cell !== ''));
  const keyAt = headers.indexOf('ambito_clave');
  const valueAt = headers.indexOf('pct_personas_k_menor_10_area');
  const result = new Map<string, number>();
  if (keyAt < 0 || valueAt < 0) return result;
  for (const row of rows) {
    const code = row[keyAt] ?? '';
    const raw = row[valueAt] ?? '';
    if (!/^\d{2}$/u.test(code) || code === '00' || raw === '') continue;
    const below = Number(raw);
    if (Number.isFinite(below)) result.set(code, Math.round((100 - below) * 10) / 10);
  }
  return result;
}

/** Sistemas con datos de una fila de la matriz. */
export function coveredSystems(row: CoverageEntityRow | undefined): CoverageSystem[] {
  if (row === undefined) return [];
  return COVERAGE_SYSTEMS.filter((system) => row.periods[system].length > 0);
}

/** Cortes de la capa de anonimato: porcentaje mínimo de cada escalón. */
const ANONYMITY_CUTS: readonly (readonly [number, Exclude<MapStep, null>])[] = [
  [85, 5],
  [70, 4],
  [55, 3],
  [40, 2],
  [0, 1],
];

function anonymityStep(value: number): Exclude<MapStep, null> {
  return ANONYMITY_CUTS.find(([cut]) => value >= cut)?.[1] ?? 1;
}

/** Porcentaje con punto decimal, como se escribe en México: «89.3 %». */
function formatPercent(value: number): string {
  return `${value.toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`;
}

/** Valor de una entidad en la capa elegida. */
export function mapValue(
  layer: MapLayer,
  code: string,
  row: CoverageEntityRow | undefined,
  anonymity: AnonymityByState,
): MapValue {
  if (layer === 'coverage') {
    if (row === undefined) return { step: null, text: 'Sin datos en la matriz' };
    const count = coveredSystems(row).length;
    if (count === 0) return { step: null, text: 'Sin cobertura: ningún sistema con datos' };
    return {
      step: count as Exclude<MapStep, null>,
      text: `${count} de 5 sistemas con datos`,
    };
  }
  if (layer === 'anonymity') {
    const value = anonymity.get(code);
    if (value === undefined) return { step: null, text: 'Sin datos del S1 en la descarga' };
    return {
      step: anonymityStep(value),
      text: `${formatPercent(value)} de las personas en áreas con 10 o más`,
    };
  }
  return code === OWN_NODE_STATE
    ? { step: 5, text: 'Nodo propio' }
    : { step: 2, text: 'Nodo común' };
}

/** Leyenda de cada capa, con texto (el color nunca va solo). */
export const MAP_LEGENDS: Readonly<Record<MapLayer, readonly LegendItem[]>> = {
  coverage: [
    { step: 1, label: '1 sistema' },
    { step: 2, label: '2' },
    { step: 3, label: '3' },
    { step: 4, label: '4' },
    { step: 5, label: '5 sistemas con datos' },
    { step: null, label: 'Sin cobertura' },
  ],
  anonymity: [
    { step: 1, label: 'Menos de 40 %' },
    { step: 2, label: '40 a 54 %' },
    { step: 3, label: '55 a 69 %' },
    { step: 4, label: '70 a 84 %' },
    { step: 5, label: '85 % o más' },
    { step: null, label: 'Sin datos del S1' },
  ],
  node: [
    { step: 5, label: 'Nodo propio (Querétaro)' },
    { step: 2, label: 'Nodo común' },
  ],
};

/** «1 entidad tiene» o «3 entidades tienen». */
function entities(count: number, singular: string, plural: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

/** Resumen en texto de la capa, calculado sobre las 32 entidades del mapa. */
export function mapSummary(
  layer: MapLayer,
  rows: readonly CoverageEntityRow[],
  anonymity: AnonymityByState,
): string {
  const total = MAP_ENTITIES.length;
  const byCode = new Map(rows.map((row) => [row.stateCode, row]));
  const steps = MAP_ENTITIES.map(
    (entity) => mapValue(layer, entity.code, byCode.get(entity.code), anonymity).step,
  );
  if (layer === 'coverage') {
    const full = steps.filter((step) => step !== null && step >= 4).length;
    const partial = steps.filter((step) => step !== null && step < 4).length;
    const none = steps.filter((step) => step === null).length;
    return (
      `${full} de ${total} entidades tienen 4 o 5 sistemas de la PDN con datos; ` +
      `${entities(partial, 'tiene', 'tienen')} de 1 a 3 y ` +
      `${entities(none, 'no tiene ninguno', 'no tienen ninguno')}.`
    );
  }
  if (layer === 'anonymity') {
    const known = steps.filter((step) => step !== null).length;
    const high = steps.filter((step) => step === 5).length;
    return (
      `${known} de ${total} entidades tienen datos del S1. En ${high} de ellas, al menos 85 % de ` +
      `las personas servidoras públicas trabaja en un área con 10 o más personas (k ≥ 10); ` +
      `${entities(total - known, 'entidad no tiene datos', 'entidades no tienen datos')}.`
    );
  }
  return `Querétaro opera su propio nodo; las otras ${total - 1} entidades usan el nodo común.`;
}
