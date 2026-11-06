// Catálogo de verificaciones del Estándar S5: los metadatos (título, perfil, modos, severidad y
// referencias) se cargan de `estandar/verificaciones.json`, la fuente única del estándar. Aquí solo
// se declara cuáles automatiza este validador y cuáles quedan fuera de esta versión.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  CheckDefinition,
  CheckId,
  CheckResult,
  CheckSeverity,
  CheckStatus,
  Evidence,
  ValidationMode,
} from './types.ts';

/** Ruta por omisión de la lista de verificaciones del estándar. */
export const VERIFICATIONS_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'estandar',
  'verificaciones.json',
);

/** Verificaciones que este validador automatiza, en el orden del reporte. */
export const IMPLEMENTED_CHECK_IDS: readonly CheckId[] = [
  'PRV-01',
  'PRV-02',
  'PRV-03',
  'PRV-04',
  'PRV-05',
  'PRV-06',
  'PRV-07',
  'PRV-08',
  'PRV-09',
  'PRV-10',
  'PRV-11',
  'PRV-12',
  'PRV-13',
  'PRV-14',
  'PRV-15',
  'API-01',
  'API-02',
];

/**
 * Verificaciones del estándar que esta versión no automatiza: salen como `no_aplica` con el motivo
 * `NOT_AUTOMATED_SUMMARY`. Una prueba exige que esta lista y la anterior cubran exactamente el JSON.
 */
export const NOT_AUTOMATED_CHECK_IDS: readonly string[] = [
  'PRV-16',
  'PRV-17',
  'PRV-18',
  'PRV-19',
  'PRV-20',
  'PRV-21',
  'PRV-22',
  'PRV-23',
  'SEC-31',
  'SEC-32',
  'SEC-33',
  'SEC-34',
];

/** Motivo de las verificaciones que no se automatizan. */
export const NOT_AUTOMATED_SUMMARY = 'Verificación no automatizada en esta versión.';

const ID_PATTERN = /^(?:PRV|API|SEC)-\d{2}$/;
const MODES: readonly ValidationMode[] = ['pasivo', 'conformidad'];
const SEVERITIES: readonly CheckSeverity[] = ['obligatoria', 'recomendada'];

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** Convierte una entrada del JSON; lanza error con el id si no tiene la forma del esquema. */
function parseEntry(raw: unknown, index: number): CheckDefinition {
  const entry = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const { id, perfil, titulo, modos, severidad, referencias, descripcion } = entry;
  const label = typeof id === 'string' ? id : `#${index}`;
  const fail = (field: string): never => {
    throw new Error(`verificaciones.json: la verificación ${label} tiene ${field} inválido.`);
  };
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) return fail('id');
  if (perfil !== 'privacidad' && perfil !== 'seguridad') return fail('perfil');
  if (typeof titulo !== 'string' || titulo === '') return fail('titulo');
  if (!isStringArray(modos) || modos.length === 0) return fail('modos');
  const modes = MODES.filter((mode) => modos.includes(mode));
  if (modes.length !== modos.length) return fail('modos');
  const severity = SEVERITIES.find((candidate) => candidate === severidad);
  if (severity === undefined) return fail('severidad');
  if (!isStringArray(referencias) || referencias.length === 0) return fail('referencias');
  if (typeof descripcion !== 'string') return fail('descripcion');
  return {
    id,
    profile: perfil,
    title: titulo,
    modes,
    severity,
    references: referencias,
    description: descripcion,
  };
}

/**
 * Lee la lista de verificaciones del estándar. Lanza error si el archivo no existe, no es JSON o
 * alguna entrada no tiene la forma de `estandar/verificaciones.schema.json`, o si un id se repite.
 */
export function loadCatalog(path: string = VERIFICATIONS_PATH): CheckDefinition[] {
  const document = JSON.parse(readFileSync(path, 'utf8')) as { verificaciones?: unknown };
  if (!Array.isArray(document.verificaciones)) {
    throw new Error('verificaciones.json no contiene la lista «verificaciones».');
  }
  const checks = document.verificaciones.map(parseEntry);
  const ids = new Set<string>();
  for (const check of checks) {
    if (ids.has(check.id)) throw new Error(`verificaciones.json repite el id ${check.id}.`);
    ids.add(check.id);
  }
  return checks;
}

/** Verificaciones del estándar en el orden del JSON. */
export const CHECKS: readonly CheckDefinition[] = loadCatalog();

/** Busca la definición de una verificación. Lanza error si el id no existe en el estándar. */
export function getCheck(id: string): CheckDefinition {
  const check = CHECKS.find((candidate) => candidate.id === id);
  if (check === undefined) throw new Error(`Verificación desconocida: ${id}.`);
  return check;
}

/** Indica si el validador automatiza la verificación. */
export function isImplemented(id: string): id is CheckId {
  return IMPLEMENTED_CHECK_IDS.some((implemented) => implemented === id);
}

/** Datos variables de un resultado; título, severidad y referencias salen del estándar. */
export interface ResultInput {
  status: CheckStatus;
  summary: string;
  evidence?: Evidence[];
  isHeuristic?: boolean;
  /** Conclusión general para el reporte redactado. */
  redactedSummary?: string;
}

/** Arma un resultado con los metadatos del estándar. */
export function result(id: string, input: ResultInput): CheckResult {
  const check = getCheck(id);
  return {
    id,
    title: check.title,
    severity: check.severity,
    status: input.status,
    summary: input.summary,
    isHeuristic: input.isHeuristic ?? false,
    evidence: input.evidence ?? [],
    references: check.references,
    ...(input.redactedSummary === undefined ? {} : { redactedSummary: input.redactedSummary }),
  };
}
