// Verificaciones observadas directamente en la red y en el HTML servido: terceros (PRV-01),
// scripts, estilos y fuentes externos (PRV-07) y atributos de cookies (PRV-12).
import { result } from '../catalog.ts';
import { classifyUrl } from '../capture/party.ts';
import type {
  CapturedCookie,
  CapturedPage,
  CapturedRequest,
  CheckResult,
  Evidence,
  PassiveCapture,
} from '../types.ts';
import { TRACKING_COOKIE_PATTERN } from './known-services.ts';

/** Máximo de evidencias por verificación, para que el reporte siga siendo legible. */
export const MAX_EVIDENCE_ITEMS = 25;

function requestEvidence(request: CapturedRequest, description: string): Evidence {
  const outcome = request.isBlocked
    ? `bloqueada por el validador (${request.blockReason ?? 'sin motivo'})`
    : `estatus ${request.status ?? 'sin respuesta'}`;
  return {
    kind: 'red',
    description: `${description} Página: ${request.page}; tipo: ${request.resourceType}; ${outcome}.`,
    url: request.url,
    value: request.method,
  };
}

function uniqueByUrl(requests: readonly CapturedRequest[]): CapturedRequest[] {
  const seen = new Set<string>();
  return requests.filter((request) => {
    const key = `${request.method} ${request.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Host de una URL HTTP, WebSocket o de servidor ICE (`stun:host:puerto`). */
function hostOf(url: string): string {
  const ice = /^(?:stuns?|turns?):\[?([^\]:/?]+)/i.exec(url);
  if (ice?.[1] !== undefined) return ice[1];
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** PRV-01: ninguna petición a terceros al cargar el inicio y el formulario. */
export function checkThirdPartyRequests(capture: PassiveCapture): CheckResult {
  const thirdParty = uniqueByUrl(capture.requests.filter((request) => request.party === 'tercero'));
  const sameSite = uniqueByUrl(
    capture.requests.filter((request) => request.party === 'mismo_sitio'),
  );
  const own = capture.requests.filter((request) => request.party === 'propio').length;
  if (own === 0 && thirdParty.length === 0) {
    return result('PRV-01', {
      status: 'no_aplica',
      summary: 'No se registró ninguna petición: el sitio no cargó en el navegador.',
    });
  }
  const webRtc = capture.requests.filter((request) => request.resourceType === 'webrtc');
  const evidence: Evidence[] = thirdParty
    .slice(0, MAX_EVIDENCE_ITEMS)
    .map((request) =>
      requestEvidence(
        request,
        request.resourceType === 'websocket'
          ? 'WebSocket a un tercero.'
          : request.resourceType === 'webrtc'
            ? 'Intento de WebRTC hacia un servidor ICE de tercero.'
            : 'Petición a un tercero.',
      ),
    );
  for (const attempt of webRtc.filter((request) => request.party !== 'tercero').slice(0, 5)) {
    evidence.push(
      requestEvidence(attempt, 'Intento de WebRTC: puede revelar la IP local y pública.'),
    );
  }
  if (sameSite.length > 0) {
    evidence.push({
      kind: 'nota',
      description: `${sameSite.length} petición(es) a subdominios del mismo dominio registrable; no se cuentan como terceros.`,
      ...(sameSite[0] === undefined ? {} : { url: sameSite[0].url }),
    });
  }
  evidence.push({
    kind: 'nota',
    description: `Se registraron ${capture.requests.length} peticiones (${own} al propio origen).`,
  });
  if (thirdParty.length > 0) {
    const hosts = [...new Set(thirdParty.map((request) => hostOf(request.url)))];
    return result('PRV-01', {
      status: 'no_cumple',
      summary: `La carga pidió recursos a ${hosts.length} dominio(s) de terceros: ${hosts.join(', ')}.`,
      evidence,
    });
  }
  if (webRtc.length > 0) {
    return result('PRV-01', {
      status: 'advertencia',
      summary:
        'Sin peticiones a terceros, pero la página intentó abrir WebRTC (el validador lo bloqueó): puede revelar la IP de quien denuncia.',
      evidence,
    });
  }
  return result('PRV-01', {
    status: 'cumple',
    summary: 'Ninguna petición a terceros durante la carga del inicio y del formulario.',
    evidence,
  });
}

/** Recurso externo declarado en el HTML. */
export interface HtmlExternalReference {
  tag: string;
  url: string;
  snippet: string;
}

const SCRIPT_TAG = /<script\b[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)[^>]*>/gi;
const LINK_TAG = /<link\b[^>]*>/gi;
const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const CSS_URL = /(?:@import\s+(?:url\()?|url\()\s*["']?([^"')\s]+)/gi;

function attributeOf(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return match === null ? null : (match[1] ?? match[2] ?? match[3] ?? null);
}

/**
 * Extrae del HTML los scripts, hojas de estilo, precargas y fuentes con URL absoluta o relativa al
 * protocolo. Heurística: análisis con expresiones regulares, sin construir el DOM; suficiente para
 * las etiquetas del documento servido, no para las que inserte JavaScript (esas las ve PRV-01).
 */
export function extractHtmlReferences(html: string): HtmlExternalReference[] {
  const references: HtmlExternalReference[] = [];
  for (const match of html.matchAll(SCRIPT_TAG)) {
    if (match[1] !== undefined)
      references.push({ tag: 'script', url: match[1], snippet: match[0] });
  }
  for (const match of html.matchAll(LINK_TAG)) {
    const tag = match[0];
    const rel = (attributeOf(tag, 'rel') ?? '').toLowerCase();
    const as = (attributeOf(tag, 'as') ?? '').toLowerCase();
    const href = attributeOf(tag, 'href');
    if (href === null) continue;
    const isStyle = rel.split(/\s+/).includes('stylesheet');
    const isPreload =
      /\b(?:preload|modulepreload)\b/.test(rel) && /^(?:script|style|font|)$/.test(as);
    if (isStyle || isPreload)
      references.push({ tag: `link rel="${rel}"`, url: href, snippet: tag });
  }
  for (const block of html.matchAll(STYLE_BLOCK)) {
    for (const match of (block[1] ?? '').matchAll(CSS_URL)) {
      if (match[1] !== undefined)
        references.push({ tag: 'style', url: match[1], snippet: match[0] });
    }
  }
  return references;
}

const EXTERNAL_RESOURCE_TYPES: ReadonlySet<string> = new Set(['script', 'stylesheet', 'font']);

/** PRV-07: sin scripts, estilos ni fuentes de terceros en el HTML (ni cargados después). */
export function checkThirdPartyAssets(capture: PassiveCapture): CheckResult {
  const target = new URL(capture.targetUrl);
  const evidence: Evidence[] = [];
  let pagesWithHtml = 0;
  for (const page of capture.pages) {
    if (page.html === '') continue;
    pagesWithHtml += 1;
    const pageUrl = new URL(page.finalUrl);
    for (const reference of extractHtmlReferences(page.html)) {
      let absolute: string;
      try {
        absolute = new URL(reference.url, pageUrl).href;
      } catch {
        continue;
      }
      if (classifyUrl(absolute, target) !== 'tercero') continue;
      evidence.push({
        kind: 'html',
        description: `Recurso de tercero en <${reference.tag}> del HTML de ${page.label}.`,
        url: absolute,
        snippet: reference.snippet.slice(0, 300),
      });
    }
    const linkHeader = page.headers.link;
    if (linkHeader !== undefined) {
      for (const match of linkHeader.matchAll(/<([^>]+)>/g)) {
        const url = match[1];
        if (url === undefined) continue;
        let absolute: string;
        try {
          absolute = new URL(url, pageUrl).href;
        } catch {
          continue;
        }
        if (classifyUrl(absolute, target) === 'tercero') {
          evidence.push({
            kind: 'cabecera',
            description: `Precarga de tercero en la cabecera Link de ${page.label}.`,
            url: absolute,
            name: 'link',
            value: linkHeader.slice(0, 300),
          });
        }
      }
    }
  }
  const loaded = uniqueByUrl(
    capture.requests.filter(
      (request) => request.party === 'tercero' && EXTERNAL_RESOURCE_TYPES.has(request.resourceType),
    ),
  );
  for (const request of loaded.slice(0, MAX_EVIDENCE_ITEMS)) {
    evidence.push(
      requestEvidence(request, 'Script, estilo o fuente de tercero pedido por la página.'),
    );
  }
  if (pagesWithHtml === 0) {
    return result('PRV-07', {
      status: 'no_aplica',
      summary: 'No se obtuvo el HTML de ninguna página.',
    });
  }
  if (evidence.length > 0) {
    return result('PRV-07', {
      status: 'no_cumple',
      summary: 'Hay scripts, estilos o fuentes servidos por terceros.',
      evidence: evidence.slice(0, MAX_EVIDENCE_ITEMS),
    });
  }
  return result('PRV-07', {
    status: 'cumple',
    summary: 'El HTML y la carga solo usan scripts, estilos y fuentes del propio sitio.',
  });
}

/** Interpreta una línea `Set-Cookie`. */
export function parseSetCookie(line: string, defaultDomain: string): CapturedCookie {
  const [pair = '', ...attributes] = line.split(';');
  const name = pair.split('=')[0]?.trim() ?? '';
  const lower = attributes.map((attribute) => attribute.trim().toLowerCase());
  const sameSite = lower.find((attribute) => attribute.startsWith('samesite='))?.split('=')[1];
  const domain = lower.find((attribute) => attribute.startsWith('domain='))?.split('=')[1];
  return {
    name,
    domain: domain ?? defaultDomain,
    isSecure: lower.includes('secure'),
    isHttpOnly: lower.includes('httponly'),
    sameSite:
      sameSite === 'strict'
        ? 'Strict'
        : sameSite === 'lax'
          ? 'Lax'
          : sameSite === 'none'
            ? 'None'
            : 'sin_valor',
    source: 'set-cookie',
  };
}

function cookiesOf(capture: PassiveCapture): CapturedCookie[] {
  const fromHeaders = capture.pages.flatMap((page: CapturedPage) =>
    page.setCookies.map((line) => parseSetCookie(line, new URL(page.finalUrl).hostname)),
  );
  const all = [...fromHeaders, ...capture.cookies];
  const seen = new Set<string>();
  return all.filter((cookie) => {
    const key = `${cookie.source}|${cookie.domain}|${cookie.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** PRV-12: cookies con `Secure`, `HttpOnly` y `SameSite`, y ninguna de rastreo. */
export function checkCookies(capture: PassiveCapture): CheckResult {
  const cookies = cookiesOf(capture);
  const isHttps = new URL(capture.targetUrl).protocol === 'https:';
  if (cookies.length === 0) {
    return result('PRV-12', {
      status: 'cumple',
      summary: 'El sitio no fijó ninguna cookie durante la carga.',
      evidence: [{ kind: 'nota', description: 'Sin Set-Cookie ni cookies en el navegador.' }],
    });
  }
  const evidence: Evidence[] = [];
  let hasFailure = false;
  let hasWarning = false;
  for (const cookie of cookies) {
    const problems: string[] = [];
    if (TRACKING_COOKIE_PATTERN.test(cookie.name))
      problems.push('nombre de cookie de rastreo conocida');
    if (!cookie.isSecure) problems.push('sin Secure');
    if (!cookie.isHttpOnly) problems.push('sin HttpOnly');
    if (cookie.sameSite === 'sin_valor') problems.push('sin SameSite');
    const isOnlyNoSecureLocal = !isHttps && problems.length === 1 && problems[0] === 'sin Secure';
    if (cookie.sameSite === 'None') hasWarning = true;
    if (problems.length > 0 && !isOnlyNoSecureLocal) hasFailure = true;
    if (isOnlyNoSecureLocal) hasWarning = true;
    evidence.push({
      kind: 'cookie',
      description:
        problems.length === 0
          ? `Cookie correcta (${cookie.source}), SameSite=${cookie.sameSite}.`
          : `Cookie (${cookie.source}): ${problems.join(', ')}.`,
      name: cookie.name,
      value: cookie.domain,
    });
  }
  const status = hasFailure ? 'no_cumple' : hasWarning ? 'advertencia' : 'cumple';
  return result('PRV-12', {
    status,
    summary:
      status === 'cumple'
        ? `Las ${cookies.length} cookie(s) tienen Secure, HttpOnly y SameSite.`
        : status === 'no_cumple'
          ? 'Hay cookies sin los atributos requeridos o de rastreo.'
          : 'Las cookies tienen atributos débiles (SameSite=None o sin Secure en HTTP local).',
    evidence: evidence.slice(0, MAX_EVIDENCE_ITEMS),
  });
}
