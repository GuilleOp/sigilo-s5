// Detecta si una pregunta de la autoridad pide datos personales a la persona denunciante.

const PATTERNS: readonly { label: string; pattern: RegExp }[] = [
  {
    label: 'tu nombre',
    pattern:
      /\b(?:su|tu)\s+nombre\b|\bnombre\s+complet[oa]\b|\bc[oó]mo\s+se\s+llama\b|\bidentif[ií]quese\b/iu,
  },
  {
    label: 'un teléfono',
    pattern: /\btel[eé]fono\b|\bcelular\b|\bwhats\s?app\b|\bn[uú]mero\s+de\s+contacto\b/iu,
  },
  { label: 'un correo', pattern: /\bcorreo\b|\be-?mail\b/iu },
  {
    label: 'tu domicilio',
    pattern: /\bdomicilio\b|\bdirecci[oó]n\s+(?:particular|de\s+su\s+casa)\b|\bd[oó]nde\s+vive\b/iu,
  },
  {
    label: 'documentos oficiales',
    pattern: /\bcurp\b|\brfc\b|\b(?:credencial|ine|ife)\b|\bidentificaci[oó]n\s+oficial\b/iu,
  },
  {
    label: 'tu cargo o área',
    pattern:
      /\bsu\s+(?:cargo|puesto|[aá]rea|plaza)\b|\bd[oó]nde\s+trabaja\b|\bn[uú]mero\s+de\s+empleado\b/iu,
  },
  {
    label: 'una reunión en persona',
    pattern: /\bpresentarse\b|\bcomparecer\b|\bacudir\s+(?:a|en)\b|\bcita\s+presencial\b/iu,
  },
];

/**
 * Devuelve qué datos personales parece pedir el texto (vacío si ninguno).
 * Es una ayuda heurística: sirve para avisar a la persona, no para bloquear.
 */
export function detectPersonalDataRequest(text: string): string[] {
  return PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ label }) => label);
}
