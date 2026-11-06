// Pruebas de las verificaciones de cabeceras PRV-02 a PRV-06 sobre páginas sintéticas.
import { describe, expect, it } from 'vitest';
import { samplePage } from '../test-support/capture-builder.ts';
import { parseCsp, metaCspOf } from './csp.ts';
import {
  checkCsp,
  checkFraming,
  checkHsts,
  checkPermissionsPolicy,
  checkReferrerPolicy,
  effectiveReferrerPolicy,
  worstStatus,
} from './header-checks.ts';

const STRICT_CSP = "default-src 'self'; script-src 'self'; frame-ancestors 'none'";

describe('parseCsp y metaCspOf', () => {
  it('interpreta varias políticas y la meta del HTML', () => {
    const policies = parseCsp("default-src 'self', script-src 'none'");
    expect(policies).toHaveLength(2);
    expect(policies[0]?.get('default-src')).toEqual(["'self'"]);
    expect(
      metaCspOf('<meta http-equiv="Content-Security-Policy" content="default-src \'self\'">'),
    ).toBe("default-src 'self'");
  });
});

describe('PRV-02 CSP', () => {
  it('cumple con una CSP de cabecera estricta', () => {
    const check = checkCsp([samplePage({ headers: { 'content-security-policy': STRICT_CSP } })]);
    expect(check.status).toBe('cumple');
    expect(check.evidence[0]?.value).toBe(STRICT_CSP);
  });

  it('advierte si la CSP estricta solo está en meta y no cumple si la meta es débil', () => {
    const html = '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'">';
    const check = checkCsp([samplePage({ html })]);
    expect(check.status).toBe('advertencia');
    expect(check.summary).toContain('<meta>');
    const weak = '<meta http-equiv="Content-Security-Policy" content="default-src *">';
    expect(checkCsp([samplePage({ html: weak })]).status).toBe('no_cumple');
    expect(checkCsp([samplePage()]).status).toBe('no_cumple');
  });

  it('no cumple con fuentes prohibidas en scripts: *, data:, http: o https:', () => {
    for (const source of ['*', 'data:', 'http:', 'https:']) {
      const check = checkCsp([
        samplePage({
          headers: { 'content-security-policy': `default-src 'self'; script-src 'self' ${source}` },
        }),
      ]);
      expect(check.status, source).toBe('no_cumple');
      expect(check.summary).toContain(source);
    }
    const combined = checkCsp([
      samplePage({
        headers: {
          'content-security-policy': "default-src 'self'; script-src 'self' https: data: *",
        },
      }),
    ]);
    expect(combined.status).toBe('no_cumple');
  });

  it('una segunda política estricta prohíbe lo que la primera permite', () => {
    const check = checkCsp([
      samplePage({
        headers: {
          'content-security-policy': "default-src 'self'; script-src https:, script-src 'self'",
        },
      }),
    ]);
    expect(check.status).toBe('cumple');
  });

  it("no cumple con 'unsafe-inline' o 'unsafe-eval' en scripts", () => {
    const check = checkCsp([
      samplePage({
        headers: {
          'content-security-policy':
            "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        },
      }),
    ]);
    expect(check.status).toBe('no_cumple');
    expect(check.summary).toContain('unsafe-inline');
    expect(check.summary).toContain('unsafe-eval');
  });

  it('toma el peor resultado entre páginas', () => {
    const check = checkCsp([
      samplePage({ headers: { 'content-security-policy': STRICT_CSP } }),
      samplePage({ label: 'formulario' }),
    ]);
    expect(check.status).toBe('no_cumple');
    expect(check.summary.startsWith('formulario:')).toBe(true);
    expect(worstStatus(['cumple', 'advertencia', 'no_aplica'])).toBe('advertencia');
  });
});

describe('PRV-03 HSTS', () => {
  it('cumple con max-age de un año en HTTPS', () => {
    const page = samplePage({
      headers: { 'strict-transport-security': 'max-age=31536000; includeSubDomains' },
    });
    expect(checkHsts([page]).status).toBe('cumple');
  });

  it('aplica los umbrales del perfil: seis meses, un año e includeSubDomains', () => {
    const hsts = (value: string) =>
      checkHsts([samplePage({ headers: { 'strict-transport-security': value } })]).status;
    expect(hsts('max-age=60')).toBe('no_cumple');
    expect(hsts('max-age=15724799; includeSubDomains')).toBe('no_cumple');
    expect(hsts('max-age=15724800; includeSubDomains')).toBe('advertencia');
    expect(hsts('max-age=31536000')).toBe('advertencia');
    expect(hsts('max-age=63072000; includeSubDomains; preload')).toBe('cumple');
    expect(checkHsts([samplePage()]).status).toBe('no_cumple');
  });

  it('no aplica en HTTP local y no cumple en HTTP público', () => {
    const local = samplePage({ url: 'http://127.0.0.1:8787/', finalUrl: 'http://127.0.0.1:8787/' });
    expect(checkHsts([local]).status).toBe('no_aplica');
    const plain = samplePage({ url: 'http://ejemplo.org/', finalUrl: 'http://ejemplo.org/' });
    expect(checkHsts([plain]).status).toBe('no_cumple');
  });
});

describe('PRV-04 marcos', () => {
  it("cumple con frame-ancestors 'none' o con X-Frame-Options DENY", () => {
    expect(
      checkFraming([samplePage({ headers: { 'content-security-policy': STRICT_CSP } })]).status,
    ).toBe('cumple');
    expect(checkFraming([samplePage({ headers: { 'x-frame-options': 'deny' } })]).status).toBe(
      'cumple',
    );
  });

  it('advierte con SAMEORIGIN y no cumple sin protección', () => {
    expect(
      checkFraming([samplePage({ headers: { 'x-frame-options': 'SAMEORIGIN' } })]).status,
    ).toBe('advertencia');
    expect(checkFraming([samplePage()]).status).toBe('no_cumple');
  });
});

describe('PRV-05 Referrer-Policy', () => {
  it('cumple con no-referrer como última política reconocida de la lista', () => {
    const page = samplePage({ headers: { 'referrer-policy': 'origin, no-referrer' } });
    expect(checkReferrerPolicy([page]).status).toBe('cumple');
    const unknown = samplePage({ headers: { 'referrer-policy': 'no-referrer, desconocida' } });
    expect(checkReferrerPolicy([unknown]).status).toBe('cumple');
    expect(effectiveReferrerPolicy('no-referrer, unsafe-url, inventada')).toBe('unsafe-url');
  });

  it('advierte si solo está en meta y no cumple con otra política', () => {
    const meta = samplePage({ html: '<meta name="referrer" content="no-referrer">' });
    expect(checkReferrerPolicy([meta]).status).toBe('advertencia');
    const other = samplePage({ headers: { 'referrer-policy': 'strict-origin-when-cross-origin' } });
    expect(checkReferrerPolicy([other]).status).toBe('no_cumple');
  });
});

describe('PRV-06 Permissions-Policy', () => {
  const policy = (value: string) =>
    checkPermissionsPolicy([samplePage({ headers: { 'permissions-policy': value } })]);

  it('cumple con geolocalización y cámara en () y el micrófono en () o (self)', () => {
    expect(policy('geolocation=(), microphone=(), camera=(), usb=()').status).toBe('cumple');
    expect(policy('geolocation=(), microphone=(self), camera=()').status).toBe('cumple');
  });

  it('no cumple si geolocalización o cámara admiten (self), otro origen o *', () => {
    expect(policy('geolocation=(self), microphone=(self), camera=(self)').status).toBe('no_cumple');
    expect(policy('geolocation=(), microphone=*, camera=()').status).toBe('no_cumple');
    expect(policy('geolocation=("https://otro.org"), microphone=(), camera=()').status).toBe(
      'no_cumple',
    );
  });

  it('advierte si falta una función sin que ninguna esté abierta; no cumple sin cabecera', () => {
    const check = policy('geolocation=(), camera=()');
    expect(check.status).toBe('advertencia');
    expect(check.summary).toContain('microphone');
    expect(checkPermissionsPolicy([samplePage()]).status).toBe('no_cumple');
  });

  it('no aplica si ninguna página respondió', () => {
    expect(checkPermissionsPolicy([samplePage({ status: null })]).status).toBe('no_aplica');
  });
});
