// Contexto público de una institución en la PDN para el panel: el registro del directorio de entes y
// el contexto de contrataciones del S6. El nodo consulta con el identificador público del ente y
// nada más; la respuesta se reduce a campos institucionales (nunca personas) y se guarda en caché.
import { PdnInstitutionContextSchema } from '@sigilo/contracts';
import type { PdnInstitutionContext } from '@sigilo/contracts';

/** Directorio de entes de la PDN (público, sin credenciales). */
export const PDN_ENTES_URL = 'https://cobertura.plataformadigitalnacional.org/directus/items/entes';
/** API pública del S6 (sin credenciales). */
export const PDN_S6_URL = 'https://api.plataformadigitalnacional.org/s6/api/v1';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 8_000;
const ENTITY_ID_PATTERN = /^PDN-(\d{2})-(\d{1,6})$/;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Servicio que arma la ficha; `null` si el nodo no consulta la PDN. */
export interface PdnInstitutionService {
  /** Ficha del ente, o `null` si el identificador no es de un ente real del catálogo. */
  context(entityId: string): Promise<PdnInstitutionContext | null>;
}

/** Dependencias del servicio. */
export interface PdnInstitutionDeps {
  fetch?: FetchLike;
  now?: () => Date;
  ttlMs?: number;
  timeoutMs?: number;
}

/** Indica si el nodo consulta la PDN pública (`SIGILO_PDN_PUBLIC=1`). */
export function isPdnPublicEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.SIGILO_PDN_PUBLIC === '1';
}

/** Nombre en mayúsculas, sin acentos ni espacios repetidos, para comparar instituciones. */
export function institutionKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type Directory = NonNullable<PdnInstitutionContext['directory']>;
type Contracting = NonNullable<PdnInstitutionContext['contracting']>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Reduce el registro del directorio a campos institucionales. Seguridad: solo se copian los
 * campos que se nombran aquí; cualquier otro campo de la respuesta se descarta.
 */
export function readDirectoryRecord(raw: unknown): Directory | null {
  const data = asRecord(asRecord(raw)?.data);
  if (data === null) return null;
  const name = text(data.nombre);
  if (name === null) return null;
  return {
    name,
    governmentLevel: text(data.ambitoGobierno) ?? 'Sin dato',
    branch: text(data.poderGobierno),
    stateCode: text(data.entidad),
    municipality: text(data.municipio),
    oicControl: data.controlOIC === true,
    tribunalControl: data.controlTribunal === true,
    reports: {
      s1: data.sistema1 === true,
      s2: data.sistema2 === true,
      s3: data.sistema3 === true,
      s6: data.sistema6 === true,
    },
    updatedAt: text(data.date_updated),
  };
}

/** Lee el resumen nacional del S6 y la lista de los 10 compradores con más monto. */
export function readContracting(
  summary: unknown,
  topBuyers: unknown,
  name: string,
): Contracting | null {
  const parsed = asRecord(summary);
  const procedures = parsed?.procedimientos;
  const amount = asRecord(parsed?.amounts)?.total;
  if (typeof procedures !== 'number' || typeof amount !== 'number') return null;
  let rank: number | null = null;
  let buyerAmount: number | null = null;
  if (Array.isArray(topBuyers)) {
    const key = institutionKey(name);
    topBuyers.forEach((item, index) => {
      const record = asRecord(item);
      const buyerName = text(asRecord(record?._id)?.name);
      if (rank === null && buyerName !== null && institutionKey(buyerName) === key) {
        rank = index + 1;
        buyerAmount = typeof record?.total === 'number' ? record.total : null;
      }
    });
  }
  return {
    nationalProcedures: Math.trunc(procedures),
    nationalAmount: amount,
    topBuyerRank: rank,
    topBuyerAmount: buyerAmount,
  };
}

/**
 * Crea el servicio con caché en memoria (24 h por omisión). Si la PDN no responde, devuelve la
 * última copia con `status: 'cached'`, o `unavailable` si no hay copia.
 */
export function createPdnInstitutionService(deps: PdnInstitutionDeps = {}): PdnInstitutionService {
  const doFetch: FetchLike = deps.fetch ?? ((input, init) => fetch(input, init));
  const now = deps.now ?? (() => new Date());
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cache = new Map<string, { at: number; value: PdnInstitutionContext }>();

  async function getJson(url: string): Promise<unknown> {
    const response = await doFetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`PDN ${response.status}`);
    return response.json();
  }

  return {
    async context(entityId) {
      const match = ENTITY_ID_PATTERN.exec(entityId);
      if (match === null) return null;
      const cached = cache.get(entityId);
      const nowMs = now().getTime();
      if (cached !== undefined && nowMs - cached.at < ttlMs) return cached.value;
      const directoryUrl = `${PDN_ENTES_URL}/${match[2]}`;
      const summaryUrl = `${PDN_S6_URL}/summary`;
      try {
        const directory = readDirectoryRecord(await getJson(directoryUrl));
        let contracting: Contracting | null = null;
        if (directory !== null) {
          try {
            const [summary, top] = await Promise.all([
              getJson(summaryUrl),
              getJson(`${PDN_S6_URL}/top/10/buyers`),
            ]);
            contracting = readContracting(summary, top, directory.name);
          } catch {
            contracting = null;
          }
        }
        const value = PdnInstitutionContextSchema.parse({
          entityId,
          status: 'live',
          consultedAt: now().toISOString(),
          directory,
          contracting,
          sources: [
            { system: 'Directorio de entes de la PDN', url: directoryUrl },
            ...(contracting === null ? [] : [{ system: 'S6', url: summaryUrl }]),
          ],
        });
        cache.set(entityId, { at: nowMs, value });
        return value;
      } catch {
        if (cached !== undefined) return { ...cached.value, status: 'cached' };
        return {
          entityId,
          status: 'unavailable',
          consultedAt: null,
          directory: null,
          contracting: null,
          sources: [],
        };
      }
    },
  };
}

/** Ficha cuando el nodo no consulta la PDN pública. */
export function disabledPdnInstitution(entityId: string): PdnInstitutionContext {
  return {
    entityId,
    status: 'disabled',
    consultedAt: null,
    directory: null,
    contracting: null,
    sources: [],
  };
}
