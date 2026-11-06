// Redacción del reporte para publicarlo: quita fragmentos de código, rutas de recursos
// JavaScript, nombres de colecciones, campos y claves, y deja solo la conclusión general. Un
// reporte público de un sitio ajeno no debe convertirse en una guía para explotar sus fallas; el
// detalle completo se conserva fuera del repositorio para la divulgación privada.
import type { CapturedRequest, CheckResult, Evidence, ValidationReport } from '../types.ts';

/** `auto`: redacta si el sitio no es local; `ninguna`: no redacta; lista: solo esos ids. */
export type RedactionMode = 'auto' | 'ninguna' | readonly string[];

/** Aviso que se agrega al reporte redactado. */
export const REDACTION_NOTICE =
  'Reporte redactado: se omitieron fragmentos de código, rutas de recursos JavaScript y nombres de colecciones, campos y claves. El detalle completo se conserva fuera del repositorio para la divulgación privada.';

function originOf(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

/** Quita la consulta (puede llevar tokens) y, en recursos del sitio, la ruta. */
function redactRequestUrl(request: CapturedRequest): string {
  try {
    const url = new URL(request.url);
    if (request.party === 'tercero') return `${url.origin}${url.pathname}`;
    return `${url.origin}/[ruta redactada]`;
  } catch {
    return '[URL redactada]';
  }
}

function redactEvidence(items: readonly Evidence[]): Evidence[] {
  const code = items.filter((item) => item.kind === 'codigo');
  const kept: Evidence[] = items
    .filter((item) => item.kind !== 'codigo')
    .map((item) => {
      if (item.kind === 'red' && item.url !== undefined) {
        // La consulta puede llevar tokens o identificadores.
        return { ...item, url: item.url.split('?')[0] ?? item.url };
      }
      if (item.kind !== 'almacenamiento') return item;
      return {
        kind: 'almacenamiento',
        description: item.description,
        name: '[clave redactada]',
        ...(item.value === undefined ? {} : { value: `[${item.value.length} caracteres]` }),
      };
    });
  if (code.length > 0) {
    const origins = [...new Set(code.map((item) => originOf(item.url)).filter(Boolean))];
    kept.unshift({
      kind: 'codigo',
      description: `Evidencia de código redactada: ${code.length} fragmento(s) en recursos de ${origins.join(', ') || 'el sitio'}. El detalle técnico se conserva fuera del repositorio.`,
    });
  }
  return kept;
}

function withoutPrivate(check: CheckResult): CheckResult {
  const copy = { ...check };
  delete copy.redactedSummary;
  return copy;
}

function redactCheck(check: CheckResult): CheckResult {
  return {
    ...withoutPrivate(check),
    summary: check.redactedSummary ?? check.summary,
    evidence: redactEvidence(check.evidence),
  };
}

/** Quita los campos internos sin redactar (para reportes de sitios locales o privados). */
export function stripPrivateFields(report: ValidationReport): ValidationReport {
  return { ...report, checks: report.checks.map(withoutPrivate) };
}

/**
 * Redacta las verificaciones indicadas (`todas` o una lista de ids), las observaciones de código y
 * las URL de la red. Las cabeceras y los dominios de terceros se conservan: son evidencia pública.
 */
export function redactReport(
  report: ValidationReport,
  scope: 'todas' | readonly string[],
): ValidationReport {
  const inScope = (id: string): boolean => scope === 'todas' || scope.includes(id);
  const observations: Evidence[] = report.observations.map((item) =>
    item.kind === 'codigo'
      ? {
          kind: 'codigo',
          description: item.description.replace(/\/[^\s)]+/g, '[ruta redactada]'),
        }
      : item,
  );
  observations.push({ kind: 'nota', description: REDACTION_NOTICE });
  return {
    ...report,
    checks: report.checks.map((check) =>
      inScope(check.id) ? redactCheck(check) : withoutPrivate(check),
    ),
    observations,
    network: {
      ...report.network,
      requests: report.network.requests.map((request) => ({
        ...request,
        url: redactRequestUrl(request),
      })),
    },
  };
}
