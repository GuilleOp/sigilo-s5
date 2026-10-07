// Comparación de secretos en tiempo constante.
import { createHash, timingSafeEqual } from 'node:crypto';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Compara dos cadenas sin filtrar por tiempo en qué posición difieren.
 * Seguridad: se comparan los SHA-256 de ambas, que siempre miden 32 bytes, así que
 * `timingSafeEqual` no depende de la longitud de las entradas.
 */
export function constantTimeEqual(left: string, right: string): boolean {
  return timingSafeEqual(digest(left), digest(right));
}
