// Fuentes de la PDN según la configuración: sintéticas para la demostración (dependen del reloj
// del escenario) o las bases SQLite descargadas con su matriz de cobertura. Ninguna consulta sale
// a la red: todo se lee del disco del nodo.
import { readFileSync } from 'node:fs';
import { parseCoverageMatrix } from '@sigilo/contexto-pdn';
import { openSqliteSources } from '@sigilo/contexto-pdn/sqlite';
import { createSyntheticSources } from '@sigilo/contexto-pdn/synthetic';
import type { PdnConfig } from '../config.ts';
import type { PdnSources, PdnSourcesProvider } from './pdn-context.ts';

/** Proveedor de fuentes con su cierre (las SQLite quedan abiertas mientras corre el nodo). */
export interface OpenedPdnSources {
  provider: PdnSourcesProvider | null;
  /** Sistemas desactivados y el motivo (por ejemplo, una base que no existe). */
  disabled: readonly string[];
  close(): void;
}

/**
 * Fuentes sintéticas del escenario; se recrean solo cuando cambia el día legal. `dayZero` es el día
 * 0 real de la demostración (las fechas del escenario son relativas a él); por omisión, el del
 * calendario de referencia.
 */
export function syntheticPdnSources(dayZero: string | null = null): PdnSourcesProvider {
  let cached: { today: string; sources: PdnSources } | null = null;
  return (today) => {
    if (cached?.today !== today) {
      const sources = createSyntheticSources(dayZero === null ? { today } : { today, dayZero });
      cached = { today, sources };
    }
    return cached.sources;
  };
}

/**
 * Abre las fuentes que indica la configuración. Lanza error si la matriz de cobertura no se puede
 * leer: sin ella el contexto no sabría distinguir «sin datos» de «sin coincidencia».
 */
export function openPdnSources(config: PdnConfig): OpenedPdnSources {
  if (config.kind === 'off') return { provider: null, disabled: [], close: () => undefined };
  if (config.kind === 'synthetic') {
    return { provider: syntheticPdnSources(config.dayZero), disabled: [], close: () => undefined };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(config.coverageFile, 'utf8'));
  } catch {
    throw new Error('No se pudo leer la matriz de cobertura de la PDN.');
  }
  const matrix = parseCoverageMatrix(raw);
  const opened = openSqliteSources({ s3Path: config.s3Path, s6Path: config.s6Path });
  const sources: PdnSources = {
    matrix,
    s1: null,
    s2: null,
    s3: opened.s3 === null ? [] : [opened.s3],
    s6: opened.s6,
    taxList: null,
  };
  return {
    provider: () => sources,
    disabled: opened.disabled.map((item) => `${item.system}: ${item.reason}`),
    close: () => opened.close(),
  };
}
