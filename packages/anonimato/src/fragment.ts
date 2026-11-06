// Formato del índice y de los fragmentos por entidad de datos/grupos-anonimato/ y su validación.
// Los fragmentos usan arreglos posicionales; aquí se convierten en objetos con nombres claros.

/** Etiquetas de cubeta publicadas (nunca conteos exactos). */
export type BucketLabel = '1-4' | '5-9' | '10-49' | '50+';

/** Orden de gobierno en el fragmento: federal, estatal, municipal u otro o sin dato. */
export type GovernmentOrderCode = 'F' | 'E' | 'M' | 'O';

/** Ventana de 24 meses de un proveedor de S1. */
export interface ProviderWindow {
  provider: string;
  from: string;
  to: string;
}

/** Entrada del índice para una entidad. */
export interface AnonymityIndexEntry {
  stateCode: string;
  stateName: string;
  /** Archivo del fragmento; `null` si la entidad no tiene datos. */
  file: string | null;
  hasData: boolean;
  /** SHA-256 en hexadecimal del fragmento publicado, si el índice lo trae. */
  sha256: string | null;
}

/** Índice de fragmentos (`indice.json`). */
export interface AnonymityIndex {
  version: 1;
  k: number;
  buckets: readonly BucketLabel[];
  /** Fecha de corte de los datos (AAAA-MM-DD). */
  cutoffDate: string;
  entries: readonly AnonymityIndexEntry[];
}

/** Área publicada: solo las que tienen k de al menos 10 y nombre publicable. */
export interface AreaRecord {
  name: string;
  bucket: BucketLabel;
  isContracting: boolean;
}

/** Grupo de «otros entes» del mismo orden de gobierno. */
export interface PoolRecord {
  order: GovernmentOrderCode;
  name: string;
  bucket: BucketLabel;
  /** El grupo junta al menos k personas. */
  isProtective: boolean;
}

/** Ente publicado. */
export interface EnteRecord {
  name: string;
  bucket: BucketLabel;
  order: GovernmentOrderCode;
  isContracting: boolean;
  /** Índice en `pools` del grupo al que se generaliza; `null` si el ente protege por sí mismo. */
  poolIndex: number | null;
  areas: readonly AreaRecord[];
}

/** Fragmento de una entidad ya validado. */
export interface AnonymityFragment {
  version: 1;
  stateCode: string;
  stateName: string;
  k: number;
  windows: readonly ProviderWindow[];
  entityBucket: BucketLabel | null;
  pools: readonly PoolRecord[];
  entes: readonly EnteRecord[];
}

const BUCKETS: readonly BucketLabel[] = ['1-4', '5-9', '10-49', '50+'];
const ORDERS: readonly GovernmentOrderCode[] = ['F', 'E', 'M', 'O'];

function fail(what: string): never {
  throw new Error(`El catálogo del grupo de anonimato no tiene el formato esperado (${what}).`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, what: string): string {
  if (typeof value !== 'string') fail(what);
  return value;
}

function asArray(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) fail(what);
  return value;
}

function asBucket(buckets: readonly BucketLabel[], value: unknown, what: string): BucketLabel {
  if (typeof value !== 'number' || !Number.isInteger(value)) fail(what);
  const bucket = buckets[value];
  if (bucket === undefined) fail(what);
  return bucket;
}

function asFlag(value: unknown, what: string): boolean {
  if (value !== 0 && value !== 1) fail(what);
  return value === 1;
}

function asOrder(value: unknown, what: string): GovernmentOrderCode {
  const order = ORDERS.find((item) => item === value);
  if (order === undefined) fail(what);
  return order;
}

function parseBuckets(value: unknown): readonly BucketLabel[] {
  const list = asArray(value, 'cubetas');
  if (list.length !== BUCKETS.length || list.some((item, index) => item !== BUCKETS[index]))
    fail('cubetas');
  return BUCKETS;
}

/**
 * Valida y convierte `indice.json`. Lanza `Error` si el formato no es el de la versión 1.
 */
export function parseAnonymityIndex(raw: unknown): AnonymityIndex {
  if (!isRecord(raw) || raw['version'] !== 1) fail('versión del índice');
  const k = raw['k'];
  if (typeof k !== 'number' || k < 1) fail('k');
  const entries = asArray(raw['entidades'], 'entidades').map((item): AnonymityIndexEntry => {
    if (!isRecord(item)) fail('entidad del índice');
    const hasData = item['hayDatos'] === true;
    const file = item['archivo'];
    const sha256 = item['sha256'];
    if (hasData && (typeof file !== 'string' || !/^\d{2}\.json$/u.test(file))) fail('archivo');
    return {
      stateCode: asString(item['clave'], 'clave'),
      stateName: asString(item['nombre'], 'nombre'),
      file: hasData && typeof file === 'string' ? file : null,
      hasData,
      sha256: typeof sha256 === 'string' && /^[0-9a-f]{64}$/u.test(sha256) ? sha256 : null,
    };
  });
  return {
    version: 1,
    k,
    buckets: parseBuckets(raw['cubetas']),
    cutoffDate: asString(raw['fechaCorte'], 'fechaCorte'),
    entries,
  };
}

/**
 * Valida y convierte el fragmento de una entidad. Lanza `Error` si el formato no es el de la
 * versión 1 o si un índice posicional apunta fuera de rango.
 */
export function parseAnonymityFragment(raw: unknown): AnonymityFragment {
  if (!isRecord(raw) || raw['version'] !== 1) fail('versión del fragmento');
  const entity = raw['entidad'];
  if (!isRecord(entity)) fail('entidad');
  const k = raw['k'];
  if (typeof k !== 'number' || k < 1) fail('k');
  const buckets = parseBuckets(raw['cubetas']);
  const windows = asArray(raw['ventanas'] ?? [], 'ventanas').map((item): ProviderWindow => {
    if (!isRecord(item)) fail('ventana');
    return {
      provider: asString(item['proveedor'], 'proveedor'),
      from: asString(item['desde'], 'desde'),
      to: asString(item['hasta'], 'hasta'),
    };
  });
  const entityBucketRaw = raw['cubetaEntidad'];
  const pools = asArray(raw['grupos'], 'grupos').map((item): PoolRecord => {
    const row = asArray(item, 'grupo');
    return {
      order: asOrder(row[0], 'orden del grupo'),
      name: asString(row[1], 'nombre del grupo'),
      bucket: asBucket(buckets, row[2], 'cubeta del grupo'),
      isProtective: asFlag(row[3], 'protege'),
    };
  });
  const entes = asArray(raw['entes'], 'entes').map((item): EnteRecord => {
    const row = asArray(item, 'ente');
    const pool = row[4];
    if (typeof pool !== 'number' || !Number.isInteger(pool) || pool < -1 || pool >= pools.length)
      fail('grupo del ente');
    return {
      name: asString(row[0], 'nombre del ente'),
      bucket: asBucket(buckets, row[1], 'cubeta del ente'),
      order: asOrder(row[2], 'orden del ente'),
      isContracting: asFlag(row[3], 'contratación del ente'),
      poolIndex: pool === -1 ? null : pool,
      areas: asArray(row[5], 'áreas').map((areaItem): AreaRecord => {
        const area = asArray(areaItem, 'área');
        return {
          name: asString(area[0], 'nombre del área'),
          bucket: asBucket(buckets, area[1], 'cubeta del área'),
          isContracting: asFlag(area[2], 'contratación del área'),
        };
      }),
    };
  });
  return {
    version: 1,
    stateCode: asString(entity['clave'], 'clave de entidad'),
    stateName: asString(entity['nombre'], 'nombre de entidad'),
    k,
    windows,
    entityBucket:
      entityBucketRaw === null || entityBucketRaw === undefined
        ? null
        : asBucket(buckets, entityBucketRaw, 'cubetaEntidad'),
    pools,
    entes,
  };
}
