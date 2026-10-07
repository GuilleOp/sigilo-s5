// Folios públicos aleatorios: 60 bits en Base32 Crockford con formato `XXXX-XXXX-XXXX`.
import { CROCKFORD_ALPHABET, FolioSchema } from '@sigilo/contracts';
import { randomBytes } from './random.ts';

const FOLIO_LENGTH = 12;

/**
 * Genera un folio con 60 bits aleatorios (12 símbolos de 5 bits).
 * Seguridad: el folio no deriva de ningún dato de la denuncia ni del tiempo.
 */
export function generateFolio(): string {
  const bytes = randomBytes(FOLIO_LENGTH);
  let symbols = '';
  for (const byte of bytes) {
    // Tomar 5 bits de cada byte uniforme conserva la distribución uniforme.
    symbols += CROCKFORD_ALPHABET[byte & 31];
  }
  return `${symbols.slice(0, 4)}-${symbols.slice(4, 8)}-${symbols.slice(8, 12)}`;
}

/** Indica si el valor es un folio con formato válido. */
export function isFolio(value: unknown): value is string {
  return FolioSchema.safeParse(value).success;
}
