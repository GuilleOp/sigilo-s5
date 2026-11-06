// Constructores de capturas sintéticas para probar las verificaciones sin navegador.
import type { CapturedPage, CapturedRequest, CapturedResource, PassiveCapture } from '../types.ts';

/** Origen de las capturas sintéticas. */
export const SAMPLE_ORIGIN = 'https://denuncias.ejemplo.gob.mx';

/** Página capturada con cabeceras dadas (nombres en minúsculas). */
export function samplePage(overrides: Partial<CapturedPage> = {}): CapturedPage {
  return {
    label: 'inicio',
    url: `${SAMPLE_ORIGIN}/`,
    finalUrl: `${SAMPLE_ORIGIN}/`,
    status: 200,
    headers: {},
    setCookies: [],
    html: '<!doctype html><html><head></head><body></body></html>',
    storage: [],
    ...overrides,
  };
}

/** Petición registrada. */
export function sampleRequest(overrides: Partial<CapturedRequest> = {}): CapturedRequest {
  return {
    url: `${SAMPLE_ORIGIN}/app.js`,
    method: 'GET',
    resourceType: 'script',
    page: 'inicio',
    party: 'propio',
    status: 200,
    isBlocked: false,
    ...overrides,
  };
}

/** Recurso JavaScript con el cuerpo dado. */
export function sampleScript(body: string, url = `${SAMPLE_ORIGIN}/app.js`): CapturedResource {
  return { url, contentType: 'text/javascript', page: 'formulario', body, isTruncated: false };
}

/** Captura completa con valores por omisión razonables. */
export function sampleCapture(overrides: Partial<PassiveCapture> = {}): PassiveCapture {
  return {
    targetUrl: `${SAMPLE_ORIGIN}/`,
    pages: [samplePage()],
    requests: [sampleRequest()],
    resources: [],
    cookies: [],
    requestCount: 1,
    isRequestLimitReached: false,
    errors: [],
    ...overrides,
  };
}
