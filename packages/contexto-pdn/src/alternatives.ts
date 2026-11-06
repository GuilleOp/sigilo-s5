// Fuentes alternativas que la autoridad puede consultar por su cuenta cuando no hay cobertura.
// El sistema solo las sugiere; nunca las consulta automáticamente (ADR 0008).

import { citeSource } from './citation.ts';
import { NO_COVERAGE_TEXT } from './coverage.ts';
import type { CheckKind, NoCoverageReason, PdnSystem, SourceInfo, Verification } from './types.ts';

/** Sugerencias por sistema. */
export const ALTERNATIVE_SOURCES: Readonly<Record<PdnSystem, readonly string[]>> = {
  S1: [
    'Versión pública de las declaraciones en el portal de transparencia de la institución.',
    'Unidad de transparencia de la institución (solicitud de acceso a la información).',
  ],
  S2: [
    'Directorio y estructura orgánica publicados en el portal de transparencia de la institución.',
    'Manual de organización de la institución.',
  ],
  S3S: [
    'Registro de servidores públicos sancionados de la entidad o del órgano interno de control.',
    'Periódico oficial de la entidad o Diario Oficial de la Federación.',
    'Portal de transparencia de la autoridad que resolvió.',
  ],
  S3P: [
    'Registro de particulares sancionados de la entidad.',
    'Periódico oficial de la entidad o Diario Oficial de la Federación.',
  ],
  S6: [
    'Sistema de compras públicas de la entidad o de la Federación.',
    'Portal de transparencia de la institución compradora (contratos y adjudicaciones).',
  ],
  L69B: [
    'Listado publicado por la autoridad fiscal y su publicación en el Diario Oficial de la Federación.',
  ],
};

/** Verificación «sin cobertura» con el motivo, la cita de la fuente y las alternativas. */
export function noCoverage(
  check: CheckKind,
  info: SourceInfo,
  reason: NoCoverageReason,
  detail: string,
  title = 'No podemos comprobarlo',
): Verification {
  const citation = citeSource(info);
  return {
    check,
    outcome: 'no_coverage',
    reason,
    title,
    explanation: `${NO_COVERAGE_TEXT[reason]} ${detail} (${citation.text}).`
      .replace(/\s+/gu, ' ')
      .trim(),
    evidence: [],
    citations: [citation],
    alternatives: ALTERNATIVE_SOURCES[info.system],
  };
}
