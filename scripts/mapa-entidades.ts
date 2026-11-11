// Genera apps/web/src/pages/observatory/mapa-entidades.ts: el contorno de las 32 entidades
// federativas como rutas SVG en un lienzo fijo, para el mapa del observatorio. Nunca nivel municipal.
// Fuente: INEGI, Marco Geoestadístico, diciembre de 2025 (Términos de Libre Uso del INEGI).
// Transformación: proyección cónica conforme de Lambert del INEGI (GRS80; paralelos 17.5° y 29.5°,
// meridiano −102°, latitud de origen 12°), simplificación de Visvalingam sobre una topología (los
// límites compartidos se simplifican una sola vez, así que no se abren huecos entre entidades),
// redondeo a 0.1 unidades del lienzo, sin islas remotas (Revillagigedo, Guadalupe) ni islotes.
// Uso: node scripts/mapa-entidades.ts [mgee.json | URL]
import { writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import { format, resolveConfig } from 'prettier';
import { feature } from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, simplify } from 'topojson-simplify';
import type { Objects, Topology } from 'topojson-specification';

const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT = join(ROOT, 'apps/web/src/pages/observatory/mapa-entidades.ts');
const DEFAULT_SOURCE = 'https://gaia.inegi.org.mx/wscatgeo/v2/geo/mgee/';

/** Ancho fijo del lienzo; el alto sale de la proporción del país proyectado. */
export const CANVAS_WIDTH = 1000;
/** Margen alrededor del país, en unidades del lienzo. */
const PADDING = 8;
/** Área mínima de un triángulo de Visvalingam que se conserva, en m² proyectados. */
export const MIN_WEIGHT = 5e6;
/** Polígonos más chicos que esto (unidades² del lienzo) se descartan, salvo el mayor de cada entidad. */
const MIN_RING_AREA = 3;
/** Entidades que el recuadro ampliado debe contener (las más chicas del centro y Aguascalientes). */
export const INSET_CODES = ['01', '09', '17', '29'] as const;

/** Propiedades del Marco Geoestadístico que se usan. */
interface MgeeProperties {
  cve_ent: string;
  nomgeo: string;
  nom_abrev: string;
  pob_total: string;
}

/** Entidad lista para el lienzo. */
export interface MapEntityOutput {
  code: string;
  name: string;
  abbr: string;
  population: number;
  d: string;
  label: [number, number];
  box: [number, number, number, number];
}

/** Resultado completo: lienzo, recuadro ampliado y entidades. */
export interface MapOutput {
  width: number;
  height: number;
  inset: [number, number, number, number];
  entities: MapEntityOutput[];
}

// Proyección cónica conforme de Lambert con dos paralelos (Snyder, 1987, ecs. 15-1 a 15-10) sobre el
// elipsoide GRS80, con los parámetros que el INEGI usa para los mapas nacionales.
const A = 6378137;
const FLATTENING = 1 / 298.257222101;
const E = Math.sqrt(2 * FLATTENING - FLATTENING * FLATTENING);
const RAD = Math.PI / 180;

function mFactor(phi: number): number {
  return Math.cos(phi) / Math.sqrt(1 - E * E * Math.sin(phi) ** 2);
}

function tFactor(phi: number): number {
  const s = E * Math.sin(phi);
  return Math.tan(Math.PI / 4 - phi / 2) / ((1 - s) / (1 + s)) ** (E / 2);
}

const PHI1 = 17.5 * RAD;
const PHI2 = 29.5 * RAD;
const PHI0 = 12 * RAD;
const LAMBDA0 = -102 * RAD;
const N =
  (Math.log(mFactor(PHI1)) - Math.log(mFactor(PHI2))) /
  (Math.log(tFactor(PHI1)) - Math.log(tFactor(PHI2)));
const F = mFactor(PHI1) / (N * tFactor(PHI1) ** N);
const RHO0 = A * F * tFactor(PHI0) ** N;

/** Proyecta longitud y latitud (grados) a metros en la cónica de Lambert del INEGI (sin falso este). */
export function lambertInegi(lon: number, lat: number): [number, number] {
  const rho = A * F * tFactor(lat * RAD) ** N;
  const theta = N * (lon * RAD - LAMBDA0);
  return [rho * Math.sin(theta), RHO0 - rho * Math.cos(theta)];
}

/** Área con signo de un anillo (fórmula del cordón de zapato). */
export function ringArea(ring: readonly Position[]): number {
  let sum = 0;
  for (let index = 0; index < ring.length - 1; index++) {
    const [x1 = 0, y1 = 0] = ring[index] ?? [];
    const [x2 = 0, y2 = 0] = ring[index + 1] ?? [];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/** Islas lejanas que alargarían el lienzo sin ayudar a leer el mapa: Revillagigedo y Guadalupe. */
function isRemoteIsland(outer: readonly Position[]): boolean {
  let lon = 0;
  let lat = 0;
  for (const [x = 0, y = 0] of outer) {
    lon += x;
    lat += y;
  }
  lon /= outer.length;
  lat /= outer.length;
  return (lon < -106.5 && lat < 20.5) || lon < -117.5;
}

function polygonsOf(geometry: Polygon | MultiPolygon): Position[][][] {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

/** Número compacto: un decimal, sin ceros sobrantes. */
function compact(value: number): string {
  const text = (Math.round(value * 10) / 10).toString();
  return text === '-0' ? '0' : text;
}

/** Ruta SVG relativa de un anillo ya en coordenadas del lienzo (redondeadas a 0.1). */
function ringPath(ring: readonly Position[]): string {
  let path = '';
  let previous: [number, number] | null = null;
  for (const [x = 0, y = 0] of ring.slice(0, -1)) {
    const point: [number, number] = [Math.round(x * 10), Math.round(y * 10)];
    if (previous === null) {
      path += `M${compact(point[0] / 10)} ${compact(point[1] / 10)}l`;
    } else {
      const dx = point[0] - previous[0];
      const dy = point[1] - previous[1];
      if (dx === 0 && dy === 0) continue;
      const pair = `${compact(dx / 10)}${dy < 0 ? '' : ' '}${compact(dy / 10)}`;
      path += `${dx < 0 || path.endsWith('l') ? '' : ' '}${pair}`;
    }
    previous = point;
  }
  return `${path}z`;
}

/** Centroide de un anillo (para colocar etiquetas o puntos de referencia). */
function ringCentroid(ring: readonly Position[]): [number, number] {
  let cx = 0;
  let cy = 0;
  let area = 0;
  for (let index = 0; index < ring.length - 1; index++) {
    const [x1 = 0, y1 = 0] = ring[index] ?? [];
    const [x2 = 0, y2 = 0] = ring[index + 1] ?? [];
    const cross = x1 * y2 - x2 * y1;
    area += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  return [cx / (3 * area), cy / (3 * area)];
}

/** Proyecta, simplifica y convierte el GeoJSON del Marco Geoestadístico en rutas del lienzo. */
export function buildMap(
  source: FeatureCollection<Polygon | MultiPolygon, MgeeProperties>,
  minWeight = MIN_WEIGHT,
): MapOutput {
  // 1. Sin islas remotas y proyectado a metros.
  const projected: FeatureCollection<MultiPolygon, MgeeProperties> = {
    type: 'FeatureCollection',
    features: source.features.map((item) => ({
      type: 'Feature',
      properties: item.properties,
      geometry: {
        type: 'MultiPolygon',
        coordinates: polygonsOf(item.geometry)
          .filter((polygon) => !isRemoteIsland(polygon[0] ?? []))
          .map((polygon) =>
            polygon.map((ring) => ring.map(([lon = 0, lat = 0]) => lambertInegi(lon, lat))),
          ),
      },
    })),
  };
  // 2. Topología: cada límite compartido es un solo arco; Visvalingam con el área en m².
  const topo = presimplify(
    topology({ entidades: projected }) as unknown as Topology<Objects<MgeeProperties>>,
  );
  const simplified = simplify(topo, minWeight);
  const object = simplified.objects.entidades;
  if (object === undefined) throw new Error('La topología no trae las entidades.');
  const back = feature(simplified, object) as unknown as FeatureCollection<
    Polygon | MultiPolygon,
    MgeeProperties
  >;
  // 3. Lienzo: norte arriba, ancho fijo.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const item of back.features) {
    for (const polygon of polygonsOf(item.geometry)) {
      for (const [x = 0, y = 0] of polygon[0] ?? []) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  const scale = (CANVAS_WIDTH - 2 * PADDING) / (maxX - minX);
  const height = Math.ceil((maxY - minY) * scale + 2 * PADDING);
  const toCanvas = ([x = 0, y = 0]: Position): Position => [
    (x - minX) * scale + PADDING,
    (maxY - y) * scale + PADDING,
  ];
  const entities = back.features.map((item: Feature<Polygon | MultiPolygon, MgeeProperties>) => {
    const polygons = polygonsOf(item.geometry)
      .map((polygon) => polygon.map((ring) => ring.map(toCanvas)))
      .filter((polygon) => polygon[0] !== undefined && polygon[0].length >= 4)
      .map((polygon) => ({ polygon, area: Math.abs(ringArea(polygon[0] ?? [])) }))
      .sort((a, b) => b.area - a.area);
    const kept = polygons.filter((entry, index) => index === 0 || entry.area >= MIN_RING_AREA);
    const largest = kept[0]?.polygon[0] ?? [];
    let bx0 = Infinity;
    let by0 = Infinity;
    let bx1 = -Infinity;
    let by1 = -Infinity;
    for (const { polygon } of kept) {
      for (const [x = 0, y = 0] of polygon[0] ?? []) {
        bx0 = Math.min(bx0, x);
        by0 = Math.min(by0, y);
        bx1 = Math.max(bx1, x);
        by1 = Math.max(by1, y);
      }
    }
    const [lx, ly] = ringCentroid(largest);
    const round = (value: number) => Math.round(value * 10) / 10;
    return {
      code: item.properties.cve_ent,
      name: item.properties.nomgeo,
      abbr: item.properties.nom_abrev,
      population: Number(item.properties.pob_total),
      d: kept
        .flatMap(({ polygon }) =>
          polygon.filter((ring) => Math.abs(ringArea(ring)) >= MIN_RING_AREA / 3).map(ringPath),
        )
        .join(''),
      label: [round(lx), round(ly)] as [number, number],
      box: [round(bx0), round(by0), round(bx1 - bx0), round(by1 - by0)] as [
        number,
        number,
        number,
        number,
      ],
    };
  });
  entities.sort((a, b) => a.code.localeCompare(b.code));
  // 4. Recuadro ampliado: la caja que contiene a las entidades chicas, con margen.
  const insetBoxes = entities.filter((entity) =>
    (INSET_CODES as readonly string[]).includes(entity.code),
  );
  const ix0 = Math.min(...insetBoxes.map((entity) => entity.box[0])) - 10;
  const iy0 = Math.min(...insetBoxes.map((entity) => entity.box[1])) - 10;
  const ix1 = Math.max(...insetBoxes.map((entity) => entity.box[0] + entity.box[2])) + 10;
  const iy1 = Math.max(...insetBoxes.map((entity) => entity.box[1] + entity.box[3])) + 10;
  return {
    width: CANVAS_WIDTH,
    height,
    inset: [Math.floor(ix0), Math.floor(iy0), Math.ceil(ix1 - ix0), Math.ceil(iy1 - iy0)],
    entities,
  };
}

/** Texto del módulo generado. */
export function renderModule(map: MapOutput): string {
  const entities = map.entities
    .map(
      (entity) =>
        `{ code: ${JSON.stringify(entity.code)}, name: ${JSON.stringify(entity.name)}, abbr: ${JSON.stringify(entity.abbr)}, population: ${entity.population}, label: [${entity.label.join(', ')}], box: [${entity.box.join(', ')}], d: ${JSON.stringify(entity.d)} },`,
    )
    .join('\n');
  return `// GENERADO por scripts/mapa-entidades.ts; no se edita a mano. Metodología en
// datos/mapa-entidades/metodologia.md.
// Fuente: INEGI, Marco Geoestadístico, diciembre de 2025 (Términos de Libre Uso del INEGI).
// Transformado: proyección cónica conforme de Lambert del INEGI, simplificación de Visvalingam
// sobre la topología y redondeo a 0.1 unidades del lienzo. Solo entidades, nunca municipios.

/** Entidad federativa en el lienzo del mapa. */
export interface MapEntity {
  /** Clave INEGI de la entidad (2 dígitos). */
  code: string;
  /** Nombre oficial (nomgeo). */
  name: string;
  /** Abreviatura oficial (nom_abrev). */
  abbr: string;
  /** Población total, Censo de Población y Vivienda 2020. */
  population: number;
  /** Centroide del polígono mayor, para etiquetas. */
  label: readonly [number, number];
  /** Caja que la contiene: x, y, ancho y alto. */
  box: readonly [number, number, number, number];
  /** Ruta SVG del contorno. */
  d: string;
}

/** Ancho y alto del lienzo. */
export const MAP_SIZE = { width: ${map.width}, height: ${map.height} } as const;

/** Recuadro ampliado del centro del país (x, y, ancho, alto) en las mismas unidades. */
export const MAP_INSET: readonly [number, number, number, number] = [${map.inset.join(', ')}];

/** Crédito de la fuente, tal como pide la licencia. */
export const MAP_CREDIT = 'Fuente: INEGI, Marco Geoestadístico, diciembre de 2025.';

/** Las 32 entidades, por clave. */
export const MAP_ENTITIES: readonly MapEntity[] = [
${entities}
];
`;
}

async function readSource(source: string): Promise<string> {
  if (/^https?:\/\//u.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`El Marco Geoestadístico respondió ${response.status}.`);
    return response.text();
  }
  return readFile(source, 'utf8');
}

async function main(): Promise<void> {
  const source = process.argv[2] ?? DEFAULT_SOURCE;
  const raw = JSON.parse(await readSource(source)) as FeatureCollection<
    Polygon | MultiPolygon,
    MgeeProperties
  >;
  if (raw.features.length !== 32) {
    throw new Error(`Se esperaban 32 entidades y llegaron ${raw.features.length}.`);
  }
  const map = buildMap(raw);
  const options = (await resolveConfig(OUTPUT)) ?? {};
  const text = await format(renderModule(map), { ...options, filepath: OUTPUT });
  writeFileSync(OUTPUT, text);
  process.stdout.write(
    `Mapa: ${map.entities.length} entidades, lienzo ${map.width} × ${map.height}, ${Buffer.byteLength(text)} bytes.\n`,
  );
}

if (import.meta.main ?? process.argv[1] === import.meta.filename) await main();
