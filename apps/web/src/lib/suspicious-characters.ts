// Resumen de los caracteres sospechosos de un texto: cuáles quita la limpieza manual y cuáles
// quedan para que la persona los revise.
import { findInvisibleCharacters, stripInvisibleCharacters } from '@sigilo/huella';

/** Limpieza manual: además de lo invisible, quita las marcas que no se componen con su letra. */
export const MANUAL_STRIP_OPTIONS = { shouldRemoveUncomposedMarks: true } as const;

/** Lo que encuentra el aviso y lo que hace la limpieza manual. */
export interface SuspiciousCharactersSummary {
  /** Caracteres sospechosos del texto original. */
  count: number;
  /** Cuántos desaparecen con la limpieza manual. */
  removable: number;
  /** Cuántos siguen después de limpiar (otro alfabeto o letras poco comunes): revisión manual. */
  remaining: number;
  /** Texto después de la limpieza manual. */
  stripped: string;
}

const REPORT_OPTIONS = { shouldNormalizeTypography: false } as const;

/**
 * Cuenta como quitable solo lo que de verdad desaparece al limpiar: compara el reporte del texto
 * original con el del texto limpio. Algunas letras de otro alfabeto o poco comunes se avisan pero
 * la limpieza no las cambia, porque pueden ser parte de un nombre o de una lengua indígena.
 */
export function summarizeSuspiciousCharacters(text: string): SuspiciousCharactersSummary {
  const count = findInvisibleCharacters(text, REPORT_OPTIONS).count;
  const stripped = stripInvisibleCharacters(text, MANUAL_STRIP_OPTIONS);
  const remaining = Math.min(count, findInvisibleCharacters(stripped, REPORT_OPTIONS).count);
  return { count, removable: count - remaining, remaining, stripped };
}
