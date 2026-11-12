// Calendario de días inhábiles del nodo: los oficiales (LFT, art. 74, `OFFICIAL_REST_DAYS`) más los
// locales que declara la autoridad del estado por acuerdo (`dias-inhabiles.json` en el directorio de
// datos, `SIGILO_REST_DAYS_FILE`). Lo usan los plazos, las reglas de escalamiento, el auditor y el
// semáforo de turnado. El nodo lo publica completo en `/datos/dias-inhabiles.json` para que
// cualquiera pueda recalcular sus plazos (ADR 0007).
import { existsSync, readFileSync } from 'node:fs';
import {
  LocalRestDaysFileSchema,
  OFFICIAL_REST_DAYS,
  OFFICIAL_REST_DAYS_COVERAGE,
} from '@sigilo/contracts';
import type { LocalRestDay, PublishedRestDays } from '@sigilo/contracts';
import {
  DEFAULT_BUSINESS_CALENDAR,
  canonicalize,
  createBusinessCalendar,
  sha256Hex,
} from '@sigilo/core';
import type { BusinessCalendar } from '@sigilo/core';
import type { AppContext } from '../context.ts';

/** Calendario del nodo y lo que publica. */
export interface NodeCalendar {
  calendar: BusinessCalendar;
  published: PublishedRestDays;
}

/**
 * Arma el calendario con los días locales. Lanza error si un día local cae fuera de la cobertura de
 * los oficiales o se repite.
 */
export function buildNodeCalendar(localDays: readonly LocalRestDay[]): NodeCalendar {
  const seen = new Set<string>();
  for (const day of localDays) {
    if (seen.has(day.fecha)) throw new Error(`El día inhábil ${day.fecha} está repetido.`);
    seen.add(day.fecha);
  }
  const calendar = createBusinessCalendar({
    nonBusinessDays: [...OFFICIAL_REST_DAYS.map((item) => item.day), ...seen],
    coverage: OFFICIAL_REST_DAYS_COVERAGE,
  });
  const locales = [...localDays].sort((left, right) => left.fecha.localeCompare(right.fecha));
  return {
    calendar,
    published: {
      v: 1,
      cobertura: {
        desde: OFFICIAL_REST_DAYS_COVERAGE.from,
        hasta: OFFICIAL_REST_DAYS_COVERAGE.through,
      },
      oficiales: OFFICIAL_REST_DAYS.map((item) => ({
        fecha: item.day,
        nombre: item.name,
        fundamento: item.basis,
      })),
      locales,
      digest: sha256Hex(canonicalize(locales)),
    },
  };
}

/**
 * Lee el archivo de días inhábiles locales. Sin archivo, solo los oficiales. Lanza error si el
 * archivo no es válido (el nodo no arranca con un calendario que no entiende).
 */
export function loadNodeCalendar(path: string): NodeCalendar {
  if (!existsSync(path)) return buildNodeCalendar([]);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error('No se pudo leer el archivo de días inhábiles.');
  }
  const parsed = LocalRestDaysFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('El archivo de días inhábiles no tiene el formato esperado.');
  }
  try {
    return buildNodeCalendar(parsed.data.dias);
  } catch (error) {
    const detail = error instanceof Error ? error.message : '';
    throw new Error(`El archivo de días inhábiles no es válido. ${detail}`.trim(), {
      cause: error,
    });
  }
}

/** Calendario con que el nodo cuenta días hábiles (el oficial si no se configuró otro). */
export function nodeCalendar(ctx: AppContext): BusinessCalendar {
  return ctx.deps.calendar?.calendar ?? DEFAULT_BUSINESS_CALENDAR;
}
