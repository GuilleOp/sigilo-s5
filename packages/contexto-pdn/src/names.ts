// Comparación de nombres de personas, organizaciones y sanciones con la normalización de datos/proceso.
// Los nombres no tienen identificador único: una coincidencia es una señal que la autoridad revisa.

import { institutionKey, textKey } from '@sigilo/anonimato/normalize';

/** Forma canónica del nombre de una persona (sin acentos, signos ni palabras vacías). */
export function personNameKey(fullName: string): string {
  return textKey(fullName);
}

// Formas jurídicas al final del nombre («S.A. de C.V.», «A.C.», «S. de R.L.»): no distinguen a la organización.
const LEGAL_FORM_TOKENS: ReadonlySet<string> = new Set([
  'S',
  'A',
  'C',
  'V',
  'R',
  'L',
  'P',
  'I',
  'B',
  'SA',
  'CV',
  'AC',
  'SC',
  'RL',
  'SAPI',
  'SAB',
  'SPR',
  'SOCIEDAD',
  'ANONIMA',
  'CIVIL',
  'CAPITAL',
  'VARIABLE',
  'ASOCIACION',
]);

/** Clave de una organización: sin acentos ni signos y sin la forma jurídica final. */
export function organizationKey(name: string): string {
  const tokens = textKey(name).split(' ').filter(Boolean);
  while (tokens.length > 1 && LEGAL_FORM_TOKENS.has(tokens[tokens.length - 1] ?? '')) tokens.pop();
  return tokens.join(' ');
}

/** Clave de institución con entidad, igual que `institution_key` de datos/proceso. */
export function institutionRefKey(name: string, stateCode: string): string {
  return institutionKey(name, stateCode);
}

// Claves de sanción de S3 (mismas que `_SANCTION_ALIASES` en datos/proceso/pdn/s3.py, en su forma larga).
const SANCTION_KEYWORDS: readonly (readonly [RegExp, string])[] = [
  [/\bAMONESTACION\b/u, 'AMONESTACION'],
  [/\bSUSPENSION ACTIVIDADES\b/u, 'SUSPENSION_ACTIVIDADES'],
  [/\bSUSPENSION\b/u, 'SUSPENSION'],
  [/\bDESTITUCION\b/u, 'DESTITUCION'],
  [/\bINHABILITACION\b/u, 'INHABILITACION'],
  [/\b(?:SANCION ECONOMICA|MULTA)\b/u, 'SANCION_ECONOMICA'],
  [/\bINDEMNIZACION\b/u, 'INDEMNIZACION'],
  [/\bDISOLUCION\b/u, 'DISOLUCION_SOCIEDAD'],
];

/** Texto legible de cada clave de sanción. */
export const SANCTION_LABELS: Readonly<Record<string, string>> = {
  AMONESTACION: 'amonestación',
  SUSPENSION: 'suspensión',
  SUSPENSION_ACTIVIDADES: 'suspensión de actividades',
  DESTITUCION: 'destitución',
  INHABILITACION: 'inhabilitación',
  SANCION_ECONOMICA: 'sanción económica',
  INDEMNIZACION: 'indemnización',
  DISOLUCION_SOCIEDAD: 'disolución de la sociedad',
  OTRO: 'otra sanción',
};

/**
 * Clasifica una sanción escrita en texto libre («suspensión de 30 días») en las claves de S3.
 * Devuelve `OTRO` si no reconoce el tipo.
 */
export function sanctionKindsOf(text: string): string[] {
  const key = textKey(text);
  const kinds: string[] = [];
  for (const [pattern, kind] of SANCTION_KEYWORDS) {
    if (pattern.test(key) && !(kind === 'SUSPENSION' && kinds.includes('SUSPENSION_ACTIVIDADES')))
      kinds.push(kind);
  }
  return kinds.length > 0 ? kinds : ['OTRO'];
}
