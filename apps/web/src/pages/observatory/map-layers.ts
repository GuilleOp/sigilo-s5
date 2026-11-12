// Capas del mapa del S5 en el observatorio: cómo llega la denuncia a cada entidad (conexión al S5),
// denuncias publicadas por 100 000 habitantes y protección del anonimato. La cobertura de todos los
// sistemas de la PDN la publica la SESNA en su propia página; aquí solo va lo del S5.
// Cada capa da a cada entidad un escalón de 1 a 5 de una escala de un solo tono (o «sin datos», que
// se dibuja con trama), un texto y el resumen que acompaña al mapa. Funciones puras: el componente
// solo dibuja. Solo cifras agregadas por entidad; nunca nivel municipal ni personas.
import { parseCsv } from '../../lib/csv.ts';
import { MAP_ENTITIES } from './mapa-entidades.ts';

/** Capas del mapa, en el orden del selector. */
export const MAP_LAYERS = ['node', 'complaints', 'anonymity'] as const;
export type MapLayer = (typeof MAP_LAYERS)[number];

/** Nombre visible de cada capa. */
export const MAP_LAYER_LABELS: Readonly<Record<MapLayer, string>> = {
  node: 'Conexión al S5',
  complaints: 'Denuncias por 100 000 habitantes',
  anonymity: 'Protección del anonimato',
};

/** Denuncias publicadas por entidad (suma de las celdas del corte nacional, ya redondeadas). */
export type ComplaintsByState = ReadonlyMap<string, number>;

/** Suma por entidad las celdas del corte nacional (solo meses cerrados y celdas de 5 o más). */
export function complaintsByState(
  cells: readonly { stateCode: string; count: number }[],
): Map<string, number> {
  const result = new Map<string, number>();
  for (const cell of cells)
    result.set(cell.stateCode, (result.get(cell.stateCode) ?? 0) + cell.count);
  return result;
}

/** Datos de las capas. */
export interface MapData {
  anonymity: AnonymityByState;
  complaints: ComplaintsByState;
}

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

/** Entidad con nodo propio en el mapa; las demás aún no montan el suyo (no hay nodo común). */
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

/** Tasa por 100 000 habitantes con dos decimales. */
function ratePer100k(count: number, population: number): number {
  return population > 0 ? (count / population) * 100_000 : 0;
}

/** Valor de una entidad en la capa elegida. */
export function mapValue(layer: MapLayer, code: string, data: MapData): MapValue {
  if (layer === 'complaints') {
    const count = data.complaints.get(code);
    if (count === undefined) {
      return { step: null, text: 'Sin cifras publicadas (las menores de 5 no se publican)' };
    }
    const entity = MAP_ENTITIES.find((item) => item.code === code);
    const rate = ratePer100k(count, entity?.population ?? 0);
    const max = Math.max(
      ...MAP_ENTITIES.map((item) =>
        ratePer100k(data.complaints.get(item.code) ?? 0, item.population),
      ),
    );
    const step = Math.min(5, Math.max(1, Math.ceil((rate / (max || 1)) * 5))) as Exclude<
      MapStep,
      null
    >;
    return {
      step,
      text: `${count} denuncias publicadas (${rate.toLocaleString('es-MX', { maximumFractionDigits: 2 })} por 100 000 habitantes)`,
    };
  }
  if (layer === 'anonymity') {
    const value = data.anonymity.get(code);
    if (value === undefined) return { step: null, text: 'Sin datos del S1 en la descarga' };
    return {
      step: anonymityStep(value),
      text: `${formatPercent(value)} de las personas en áreas con 10 o más`,
    };
  }
  return code === OWN_NODE_STATE
    ? { step: 5, text: 'Nodo propio: la SESEA recibe sus denuncias en su servidor' }
    : {
        step: 1,
        text: 'Sin nodo: sus denuncias estatales y municipales aún no pueden enviarse; las federales, sí',
      };
}

/** Leyenda de cada capa, con texto (el color nunca va solo). */
export const MAP_LEGENDS: Readonly<Record<MapLayer, readonly LegendItem[]>> = {
  node: [
    { step: 5, label: 'Nodo propio (Querétaro)' },
    { step: 1, label: 'Sin nodo todavía' },
  ],
  complaints: [
    { step: 1, label: 'Menos' },
    { step: 3, label: 'Intermedio' },
    { step: 5, label: 'Más (respecto a la entidad con la tasa más alta)' },
    { step: null, label: 'Sin cifras publicadas' },
  ],
  anonymity: [
    { step: 1, label: 'Menos de 40 %' },
    { step: 2, label: '40 a 54 %' },
    { step: 3, label: '55 a 69 %' },
    { step: 4, label: '70 a 84 %' },
    { step: 5, label: '85 % o más' },
    { step: null, label: 'Sin datos del S1' },
  ],
};

/** «1 entidad tiene» o «3 entidades tienen». */
function entities(count: number, singular: string, plural: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

/** Resumen en texto de la capa, calculado sobre las 32 entidades del mapa. */
export function mapSummary(layer: MapLayer, data: MapData): string {
  const total = MAP_ENTITIES.length;
  const steps = MAP_ENTITIES.map((entity) => mapValue(layer, entity.code, data).step);
  if (layer === 'complaints') {
    const known = steps.filter((step) => step !== null).length;
    if (known === 0) {
      return 'Todavía no hay meses cerrados con 5 o más denuncias en ninguna entidad: las cifras pequeñas no se publican para proteger a quien denuncia.';
    }
    return (
      `${entities(known, 'entidad tiene', 'entidades tienen')} denuncias publicadas en meses cerrados; ` +
      `en las otras ${total - known} las cifras son menores de 5 y no se publican para proteger a quien denuncia.`
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
  return `Querétaro opera su propio nodo del S5; las otras ${total - 1} entidades todavía no montan el suyo: sus denuncias estatales y municipales no pueden enviarse por la ventanilla hasta que lo hagan.`;
}
