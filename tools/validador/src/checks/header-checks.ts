// Verificaciones de cabeceras de seguridad del documento (PRV-02 a PRV-06), evaluadas en cada
// página visitada; el resultado global es el peor de las páginas.
import { result } from '../catalog.ts';
import { isLocalHost } from '../capture/party.ts';
import type { CapturedPage, CheckId, CheckResult, CheckStatus, Evidence } from '../types.ts';
import { effectiveScriptSources, hasFrameAncestorsNone, metaCspOf, parseCsp } from './csp.ts';

/** HSTS de al menos un año, como recomienda hstspreload.org. */
export const MIN_HSTS_MAX_AGE = 31_536_000;

const STATUS_SEVERITY: Record<CheckStatus, number> = {
  no_aplica: 0,
  cumple: 1,
  advertencia: 2,
  no_cumple: 3,
};

/** Devuelve el estado más grave de la lista (`no_aplica` si está vacía). */
export function worstStatus(statuses: readonly CheckStatus[]): CheckStatus {
  return statuses.reduce<CheckStatus>(
    (worst, status) => (STATUS_SEVERITY[status] > STATUS_SEVERITY[worst] ? status : worst),
    'no_aplica',
  );
}

/** Evaluación de una sola página. */
interface PageVerdict {
  status: CheckStatus;
  summary: string;
  evidence: Evidence[];
}

function headerEvidence(page: CapturedPage, name: string, description: string): Evidence {
  const value = page.headers[name];
  return {
    kind: 'cabecera',
    description,
    url: page.finalUrl,
    name,
    value: value ?? '(ausente)',
  };
}

/** Combina los veredictos por página en un resultado; las páginas sin respuesta se omiten. */
function combine(
  id: CheckId,
  pages: readonly CapturedPage[],
  evaluate: (page: CapturedPage) => PageVerdict,
): CheckResult {
  const reachable = pages.filter((page) => page.status !== null);
  if (reachable.length === 0) {
    return result(id, {
      status: 'no_aplica',
      summary: 'No se obtuvo ninguna página; no se pudieron leer las cabeceras.',
    });
  }
  const verdicts = reachable.map((page) => ({ page, verdict: evaluate(page) }));
  const status = worstStatus(verdicts.map(({ verdict }) => verdict.status));
  const worst = verdicts.find(({ verdict }) => verdict.status === status);
  const sameEverywhere = verdicts.every(
    ({ verdict }) => verdict.summary === worst?.verdict.summary,
  );
  const summary =
    worst === undefined
      ? ''
      : sameEverywhere
        ? worst.verdict.summary
        : `${worst.page.label}: ${worst.verdict.summary}`;
  return result(id, {
    status,
    summary,
    evidence: verdicts.flatMap(({ verdict }) => verdict.evidence),
  });
}

/**
 * Fuentes que el perfil prohíbe en la directiva efectiva de scripts: cualquiera de ellas permite
 * ejecutar código ajeno.
 */
export const FORBIDDEN_SCRIPT_SOURCES = [
  "'unsafe-inline'",
  "'unsafe-eval'",
  '*',
  'data:',
  'http:',
  'https:',
] as const;

/**
 * Problemas de una CSP según el perfil: `default-src 'self'` (o `'none'`) y ninguna fuente
 * prohibida en la directiva efectiva de scripts. Como el navegador aplica todas las políticas, una
 * fuente solo queda permitida si todas la permiten.
 */
export function cspProblems(value: string): string[] {
  const policies = parseCsp(value);
  const problems: string[] = [];
  const hasSelfDefault = policies.some((policy) => {
    const sources = policy.get('default-src');
    return sources !== undefined && (sources.includes("'self'") || sources.includes("'none'"));
  });
  if (!hasSelfDefault) problems.push("falta default-src 'self'");
  const defaultSources = policies.flatMap((policy) => policy.get('default-src') ?? []);
  if (defaultSources.some((source) => source === '*' || /^https?:$/.test(source))) {
    problems.push('default-src admite cualquier origen');
  }
  const scriptSourcesList = policies.map(effectiveScriptSources);
  const allowed = FORBIDDEN_SCRIPT_SOURCES.filter((forbidden) =>
    scriptSourcesList.every(
      (sources) => sources === null || sources.some((source) => source.toLowerCase() === forbidden),
    ),
  );
  if (allowed.length > 0) problems.push(`los scripts admiten ${allowed.join(', ')}`);
  return problems;
}

/** PRV-02: CSP como cabecera estricta; si solo está en `<meta>` y es estricta, advertencia. */
export function checkCsp(pages: readonly CapturedPage[]): CheckResult {
  return combine('PRV-02', pages, (page) => {
    const header = page.headers['content-security-policy'];
    const evidence = [
      headerEvidence(page, 'content-security-policy', 'CSP enviada como cabecera.'),
    ];
    if (header === undefined) {
      const meta = metaCspOf(page.html);
      const reportOnly = page.headers['content-security-policy-report-only'];
      if (meta !== null) {
        evidence.push({
          kind: 'html',
          description:
            'CSP declarada solo en <meta>: no admite frame-ancestors ni protege la respuesta.',
          url: page.finalUrl,
          snippet: meta,
        });
      }
      if (reportOnly !== undefined) {
        evidence.push(
          headerEvidence(page, 'content-security-policy-report-only', 'CSP solo de reporte.'),
        );
      }
      if (meta !== null && cspProblems(meta).length === 0) {
        return {
          status: 'advertencia',
          summary: 'La CSP es estricta pero solo está en <meta>; debe enviarse como cabecera.',
          evidence,
        };
      }
      return {
        status: 'no_cumple',
        summary:
          meta === null
            ? 'No hay Content-Security-Policy como cabecera.'
            : `La CSP solo está en <meta> y es insuficiente: ${cspProblems(meta).join('; ')}.`,
        evidence,
      };
    }
    const problems = cspProblems(header);
    if (problems.length === 0) {
      return {
        status: 'cumple',
        summary: 'CSP como cabecera, restrictiva para scripts.',
        evidence,
      };
    }
    return { status: 'no_cumple', summary: `CSP insuficiente: ${problems.join('; ')}.`, evidence };
  });
}

/** HSTS mínimo aceptable del perfil (seis meses); por debajo, no cumple. */
export const MIN_ACCEPTABLE_HSTS_MAX_AGE = 15_724_800;

/**
 * PRV-03: HSTS en HTTPS con `max-age` de un año e `includeSubDomains`. Entre seis meses y un año,
 * o sin `includeSubDomains`, advertencia; por debajo de seis meses o sin cabecera, no cumple. En
 * HTTP local no aplica; en HTTP público no cumple (no hay HTTPS).
 */
export function checkHsts(pages: readonly CapturedPage[]): CheckResult {
  return combine('PRV-03', pages, (page) => {
    const url = new URL(page.finalUrl);
    const evidence = [headerEvidence(page, 'strict-transport-security', 'HSTS del documento.')];
    if (url.protocol !== 'https:') {
      return isLocalHost(url.hostname)
        ? {
            status: 'no_aplica',
            summary:
              'Sitio local por HTTP: HSTS solo aplica sobre HTTPS (verificar en el despliegue).',
            evidence,
          }
        : { status: 'no_cumple', summary: 'El sitio se sirve por HTTP, sin HTTPS.', evidence };
    }
    const header = page.headers['strict-transport-security'];
    if (header === undefined) {
      return { status: 'no_cumple', summary: 'No envía Strict-Transport-Security.', evidence };
    }
    const maxAge = /max-age\s*=\s*"?(\d+)"?/i.exec(header);
    const seconds = maxAge?.[1] === undefined ? 0 : Number(maxAge[1]);
    const hasSubdomains = /(?:^|;)\s*includesubdomains\s*(?:;|$)/i.test(header);
    if (seconds < MIN_ACCEPTABLE_HSTS_MAX_AGE) {
      return {
        status: 'no_cumple',
        summary: `HSTS con max-age de ${seconds} s, menor a seis meses.`,
        evidence,
      };
    }
    if (seconds < MIN_HSTS_MAX_AGE) {
      return {
        status: 'advertencia',
        summary: `HSTS con max-age de ${seconds} s, menor a un año.`,
        evidence,
      };
    }
    if (!hasSubdomains) {
      return {
        status: 'advertencia',
        summary: 'HSTS de un año pero sin includeSubDomains.',
        evidence,
      };
    }
    return {
      status: 'cumple',
      summary: 'HSTS con max-age de al menos un año e includeSubDomains.',
      evidence,
    };
  });
}

/** PRV-04: `frame-ancestors 'none'` en la CSP de cabecera o `X-Frame-Options: DENY`. */
export function checkFraming(pages: readonly CapturedPage[]): CheckResult {
  return combine('PRV-04', pages, (page) => {
    const csp = page.headers['content-security-policy'];
    const xfo = page.headers['x-frame-options']?.trim().toUpperCase();
    const evidence = [
      headerEvidence(page, 'x-frame-options', 'Protección contra marcos (antigua).'),
      headerEvidence(page, 'content-security-policy', 'Directiva frame-ancestors de la CSP.'),
    ];
    if ((csp !== undefined && hasFrameAncestorsNone(parseCsp(csp))) || xfo === 'DENY') {
      return { status: 'cumple', summary: 'La página no puede incrustarse en marcos.', evidence };
    }
    const allowsSelf =
      xfo === 'SAMEORIGIN' ||
      (csp !== undefined &&
        parseCsp(csp).some((policy) => policy.get('frame-ancestors')?.join(' ') === "'self'"));
    if (allowsSelf) {
      return {
        status: 'advertencia',
        summary: 'Solo se permite enmarcar desde el mismo origen; el estándar pide prohibirlo.',
        evidence,
      };
    }
    return {
      status: 'no_cumple',
      summary: "Sin frame-ancestors 'none' ni X-Frame-Options: DENY.",
      evidence,
    };
  });
}

/** Valores válidos de Referrer-Policy; el navegador ignora los desconocidos. */
const REFERRER_POLICIES: ReadonlySet<string> = new Set([
  'no-referrer',
  'no-referrer-when-downgrade',
  'same-origin',
  'origin',
  'strict-origin',
  'origin-when-cross-origin',
  'strict-origin-when-cross-origin',
  'unsafe-url',
]);

/** Política vigente de Referrer-Policy: el último token reconocido de la lista. */
export function effectiveReferrerPolicy(value: string): string {
  const tokens = value
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => REFERRER_POLICIES.has(token));
  return tokens.at(-1) ?? '';
}

/** PRV-05: `Referrer-Policy: no-referrer` como cabecera. */
export function checkReferrerPolicy(pages: readonly CapturedPage[]): CheckResult {
  return combine('PRV-05', pages, (page) => {
    const header = page.headers['referrer-policy'];
    const evidence = [headerEvidence(page, 'referrer-policy', 'Política de referente.')];
    if (header !== undefined && effectiveReferrerPolicy(header) === 'no-referrer') {
      return { status: 'cumple', summary: 'Referrer-Policy: no-referrer.', evidence };
    }
    const meta = /<meta\b[^>]*name\s*=\s*["']?referrer["']?[^>]*>/i.exec(page.html)?.[0];
    if (meta !== undefined) {
      evidence.push({
        kind: 'html',
        description: 'Política declarada en <meta>.',
        url: page.finalUrl,
        snippet: meta,
      });
    }
    if (header === undefined && meta !== undefined && /no-referrer["'\s>]/i.test(meta)) {
      return {
        status: 'advertencia',
        summary:
          'no-referrer solo en <meta>; falta la cabecera (no cubre las respuestas que no son HTML).',
        evidence,
      };
    }
    return {
      status: 'no_cumple',
      summary:
        header === undefined
          ? 'No envía Referrer-Policy; el navegador usa strict-origin-when-cross-origin.'
          : `Referrer-Policy es "${header}", no no-referrer.`,
      evidence,
    };
  });
}

/** Funciones que PRV-06 exige restringir. */
const RESTRICTED_FEATURES = ['geolocation', 'microphone', 'camera'] as const;

/**
 * Lista de permitidos de cada función en `Permissions-Policy` (sintaxis de diccionario
 * estructurado: `geolocation=(), camera=(self)`).
 */
export function parsePermissionsPolicy(value: string): Map<string, string> {
  const features = new Map<string, string>();
  for (const member of value.split(',')) {
    const separator = member.indexOf('=');
    if (separator === -1) continue;
    features.set(
      member.slice(0, separator).trim().toLowerCase(),
      member.slice(separator + 1).trim(),
    );
  }
  return features;
}

/** PRV-06: `Permissions-Policy` restringe geolocalización, micrófono y cámara. */
export function checkPermissionsPolicy(pages: readonly CapturedPage[]): CheckResult {
  return combine('PRV-06', pages, (page) => {
    const header = page.headers['permissions-policy'];
    const evidence = [headerEvidence(page, 'permissions-policy', 'Política de permisos.')];
    if (header === undefined) {
      const legacy = page.headers['feature-policy'];
      if (legacy !== undefined)
        evidence.push(headerEvidence(page, 'feature-policy', 'Cabecera antigua.'));
      return {
        status: 'no_cumple',
        summary:
          'No envía Permissions-Policy: la página puede pedir ubicación, micrófono y cámara.',
        evidence,
      };
    }
    const features = parsePermissionsPolicy(header);
    // Perfil: geolocalización y cámara en `()`; el micrófono en `()` o `(self)` (dictado local).
    const accepted = (feature: (typeof RESTRICTED_FEATURES)[number], allowlist: string): boolean =>
      allowlist === '()' || (feature === 'microphone' && allowlist === '(self)');
    const missing: string[] = [];
    const open: string[] = [];
    for (const feature of RESTRICTED_FEATURES) {
      const allowlist = features.get(feature)?.replace(/\s+/g, '');
      if (allowlist === undefined) missing.push(feature);
      else if (!accepted(feature, allowlist)) open.push(`${feature}=${allowlist}`);
    }
    if (open.length > 0) {
      return { status: 'no_cumple', summary: `Sin restringir: ${open.join(', ')}.`, evidence };
    }
    if (missing.length > 0) {
      return {
        status: 'advertencia',
        summary: `La política no declara: ${missing.join(', ')} (quedan con su valor por omisión).`,
        evidence,
      };
    }
    return {
      status: 'cumple',
      summary: 'Geolocalización, micrófono y cámara restringidos.',
      evidence,
    };
  });
}
