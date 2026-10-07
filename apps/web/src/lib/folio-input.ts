// Normalización del folio que escribe la persona: mayúsculas, guiones y confusiones comunes.
import { isFolio } from '@sigilo/core';

/**
 * Convierte lo escrito al formato `XXXX-XXXX-XXXX`. En Base32 Crockford la O se lee como 0 y
 * la I y la L como 1, así que se corrigen. Quita espacios y guiones y vuelve a agruparlos.
 */
export function normalizeFolioInput(value: string): string {
  const symbols = value
    .toUpperCase()
    .replace(/[^0-9A-Z]/gu, '')
    .replace(/O/gu, '0')
    .replace(/[IL]/gu, '1')
    .slice(0, 12);
  const groups = symbols.match(/.{1,4}/gu) ?? [];
  return groups.join('-');
}

/** Indica si lo escrito, ya normalizado, es un folio válido. */
export function isCompleteFolio(value: string): boolean {
  return isFolio(normalizeFolioInput(value));
}
