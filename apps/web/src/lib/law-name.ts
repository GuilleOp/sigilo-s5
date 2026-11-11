// Nombres de leyes del catálogo de faltas del S5, que llegan en MAYÚSCULAS («LEY GENERAL DE
// RESPONSABILIDADES ADMINISTRATIVAS»), escritos como se citan: «Ley General de Responsabilidades
// Administrativas». Respeta siglas y números, y repone el acento que a veces falta («CODIGO»).

/** Palabras que van en minúscula dentro del nombre (artículos, preposiciones y conjunciones). */
const MINOR_WORDS: ReadonlySet<string> = new Set([
  'a',
  'al',
  'con',
  'de',
  'del',
  'e',
  'el',
  'en',
  'la',
  'las',
  'lo',
  'los',
  'o',
  'para',
  'por',
  'sus',
  'u',
  'y',
]);

/** Siglas que se conservan en mayúsculas. */
const ACRONYMS: ReadonlySet<string> = new Set(['CDMX', 'CPF', 'LGRA', 'LGSNA', 'PDN', 'SESNA']);

/** Palabras que en el catálogo llegan sin acento. */
const ACCENTS: Readonly<Record<string, string>> = { codigo: 'código' };

/** Signos que pueden ir pegados al final de una palabra («GUERRERO,»). */
const TRAILING_PUNCTUATION = /[,.;:]+$/u;

function capitalize(word: string): string {
  return word.charAt(0).toLocaleUpperCase('es-MX') + word.slice(1);
}

/** Escribe un nombre de ley en mayúsculas como se cita; deja igual el que ya trae minúsculas. */
export function formatLawName(name: string): string {
  if (name !== name.toLocaleUpperCase('es-MX')) return name;
  return name
    .split(/(\s+)/u)
    .map((part, index) => {
      if (part.trim() === '') return part;
      const bare = part.replace(TRAILING_PUNCTUATION, '');
      if (ACRONYMS.has(bare)) return part;
      const lower = part.toLocaleLowerCase('es-MX');
      const key = lower.replace(TRAILING_PUNCTUATION, '');
      const word = (ACCENTS[key] ?? key) + lower.slice(key.length);
      return index > 0 && MINOR_WORDS.has(key) ? word : capitalize(word);
    })
    .join('');
}
