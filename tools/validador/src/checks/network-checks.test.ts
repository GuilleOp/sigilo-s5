// Pruebas de PRV-01, PRV-07 y PRV-12 sobre capturas sintéticas.
import { describe, expect, it } from 'vitest';
import {
  SAMPLE_ORIGIN,
  sampleCapture,
  samplePage,
  sampleRequest,
} from '../test-support/capture-builder.ts';
import {
  checkCookies,
  checkThirdPartyAssets,
  checkThirdPartyRequests,
  extractHtmlReferences,
  parseSetCookie,
} from './network-checks.ts';

describe('PRV-01 terceros en la red', () => {
  it('cumple solo con peticiones propias o del mismo sitio', () => {
    const capture = sampleCapture({
      requests: [
        sampleRequest(),
        sampleRequest({ url: 'https://www.ejemplo.gob.mx/logo.svg', party: 'mismo_sitio' }),
      ],
    });
    const check = checkThirdPartyRequests(capture);
    expect(check.status).toBe('cumple');
    expect(check.evidence.some((item) => item.description.includes('subdominios'))).toBe(true);
  });

  it('no cumple con un tercero, aunque el validador lo haya bloqueado', () => {
    const capture = sampleCapture({
      requests: [
        sampleRequest(),
        sampleRequest({
          url: 'https://api.mapbox.com/styles/v1/x',
          party: 'tercero',
          isBlocked: true,
          blockReason: 'petición a un tercero',
          status: null,
        }),
      ],
    });
    const check = checkThirdPartyRequests(capture);
    expect(check.status).toBe('no_cumple');
    expect(check.summary).toContain('api.mapbox.com');
    expect(check.evidence[0]?.url).toBe('https://api.mapbox.com/styles/v1/x');
  });

  it('no aplica si no hubo ninguna petición', () => {
    expect(checkThirdPartyRequests(sampleCapture({ requests: [] })).status).toBe('no_aplica');
  });
});

describe('PRV-07 recursos de terceros en el HTML', () => {
  it('extrae scripts, hojas de estilo, precargas de fuentes e @import', () => {
    const html = `<script src="https://cdn.ejemplo.net/a.js"></script>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=X">
<link rel="preload" as="font" href="/f.woff2">
<link rel="icon" href="https://otro.net/i.png">
<style>@import url("https://fonts.googleapis.com/x.css");</style>`;
    const urls = extractHtmlReferences(html).map((reference) => reference.url);
    expect(urls).toEqual([
      'https://cdn.ejemplo.net/a.js',
      'https://fonts.googleapis.com/css2?family=X',
      '/f.woff2',
      'https://fonts.googleapis.com/x.css',
    ]);
  });

  it('no cumple con una fuente de Google en el HTML y cumple con recursos propios', () => {
    const bad = sampleCapture({
      pages: [
        samplePage({ html: '<link rel="stylesheet" href="https://fonts.googleapis.com/css2">' }),
      ],
    });
    expect(checkThirdPartyAssets(bad).status).toBe('no_cumple');
    const good = sampleCapture({
      pages: [
        samplePage({
          html: `<script src="${SAMPLE_ORIGIN}/a.js"></script><script src="/b.js"></script>`,
        }),
      ],
    });
    expect(checkThirdPartyAssets(good).status).toBe('cumple');
  });

  it('detecta precargas de terceros en la cabecera Link', () => {
    const capture = sampleCapture({
      pages: [
        samplePage({
          headers: { link: '<https://cdn.ejemplo.net/f.woff2>; rel=preload; as=font' },
        }),
      ],
    });
    const check = checkThirdPartyAssets(capture);
    expect(check.status).toBe('no_cumple');
    expect(check.evidence[0]?.kind).toBe('cabecera');
  });
});

describe('PRV-12 cookies', () => {
  it('interpreta Set-Cookie', () => {
    expect(parseSetCookie('id=1; Path=/; Secure; HttpOnly; SameSite=Lax', 'x.org')).toEqual({
      name: 'id',
      domain: 'x.org',
      isSecure: true,
      isHttpOnly: true,
      sameSite: 'Lax',
      source: 'set-cookie',
    });
  });

  it('cumple sin cookies o con cookies completas', () => {
    expect(checkCookies(sampleCapture()).status).toBe('cumple');
    const capture = sampleCapture({
      pages: [samplePage({ setCookies: ['sesion=1; Secure; HttpOnly; SameSite=Strict'] })],
    });
    expect(checkCookies(capture).status).toBe('cumple');
  });

  it('no cumple con cookies de rastreo o sin atributos', () => {
    const capture = sampleCapture({
      pages: [
        samplePage({ setCookies: ['_ga=GA1.1.1; Secure; HttpOnly; SameSite=Lax', 'tema=oscuro'] }),
      ],
    });
    const check = checkCookies(capture);
    expect(check.status).toBe('no_cumple');
    expect(check.evidence.map((item) => item.description).join(' ')).toContain('rastreo');
  });

  it('solo advierte la falta de Secure en HTTP local', () => {
    const local = 'http://127.0.0.1:8787/';
    const capture = sampleCapture({
      targetUrl: local,
      pages: [
        samplePage({ url: local, finalUrl: local, setCookies: ['s=1; HttpOnly; SameSite=Strict'] }),
      ],
    });
    expect(checkCookies(capture).status).toBe('advertencia');
  });
});
