// Nota obligatoria de cada señal y guardas de lenguaje: el auditor señala con evidencia, nunca
// decide, nunca llama «falsa» a una denuncia ni «culpable» a una persona.
import type { AuditSignal } from './types.ts';

/** Nota que acompaña a toda señal. */
export const SIGNAL_NOTE =
  'Esta señal no decide nada: la decisión es de las reglas públicas o de una persona.';

/** Nota adicional de las sugerencias del modelo local. */
export const MODEL_NOTE =
  'Sugerencia orientativa de un modelo local: puede equivocarse. Revisa el fragmento citado.';

/** Palabras que el auditor nunca usa en sus propios textos (presunción de buena fe e inocencia). */
const FORBIDDEN_WORDING = /\b(?:fals[oa]s?|falsedad|culpables?|mentiros[oa]s?)\b/iu;

/**
 * Textos que escribe el auditor (no los citados del acuerdo, que son de la autoridad).
 * Lanza si alguno usa una palabra prohibida: es un error de programación, no de los datos.
 */
export function assertNeutralWording(signal: AuditSignal): void {
  const ownTexts = [
    signal.name,
    signal.explanation,
    signal.basis.text,
    signal.note,
    ...signal.evidence.flatMap((pair) => [pair.label, pair.counterpartSource]),
  ];
  for (const text of ownTexts) {
    if (FORBIDDEN_WORDING.test(text)) {
      throw new Error('Una señal del auditor usa una palabra prohibida en sus propios textos.');
    }
  }
}

/** Indica si un texto usa una palabra prohibida (para validar salidas del modelo). */
export function hasForbiddenWording(text: string): boolean {
  return FORBIDDEN_WORDING.test(text);
}
