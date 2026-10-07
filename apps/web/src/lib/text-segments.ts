// División del texto en tramos normales y resaltados para mostrar los hallazgos del revisor.
import type { TextFinding } from '@sigilo/huella';

/** Tramo del texto: normal o resaltado con el número del hallazgo (desde 1). */
export type TextSegment =
  | { kind: 'plain'; text: string }
  | { kind: 'finding'; text: string; number: number; finding: TextFinding };

/**
 * Divide el texto según los hallazgos (ordenados y sin solapamientos, como los entrega
 * `reviewText`). Ignora hallazgos fuera de rango o solapados por seguridad.
 */
export function segmentText(text: string, findings: readonly TextFinding[]): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;
  findings.forEach((finding, index) => {
    if (finding.start < cursor || finding.end > text.length || finding.end <= finding.start) return;
    if (finding.start > cursor)
      segments.push({ kind: 'plain', text: text.slice(cursor, finding.start) });
    segments.push({
      kind: 'finding',
      text: text.slice(finding.start, finding.end),
      number: index + 1,
      finding,
    });
    cursor = finding.end;
  });
  if (cursor < text.length) segments.push({ kind: 'plain', text: text.slice(cursor) });
  return segments;
}

/** Nombre de la gravedad, para no depender del color. */
export const SEVERITY_LABELS: Readonly<Record<TextFinding['severity'], string>> = {
  high: 'Riesgo alto',
  medium: 'Riesgo medio',
  low: 'Revisar',
};

/** Qué tipo de dato se detectó, en lenguaje claro. */
export const FINDING_KIND_LABELS: Readonly<Record<TextFinding['kind'], string>> = {
  email: 'Correo electrónico',
  phone: 'Número de teléfono',
  curp: 'CURP',
  rfc: 'RFC',
  exact_date: 'Fecha exacta',
  exact_time: 'Hora exacta',
  uniqueness: 'Dato que solo tú sabrías',
  self_role: 'Tu cargo o lugar de trabajo',
  proper_name: 'Posible nombre de persona',
};
