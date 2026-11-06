// Pruebas de la redacción del reporte y del enmascarado de la captura guardada.
import { describe, expect, it } from 'vitest';
import { result } from '../catalog.ts';
import { maskCapture, maskSetCookie } from '../capture/saved-capture.ts';
import { checkDraftStoragePassive, checkFolioPatternPassive } from '../checks/static-checks.ts';
import { sampleCapture, samplePage, sampleScript } from '../test-support/capture-builder.ts';
import type { ValidationReport } from '../types.ts';
import { USER_AGENT } from '../version.ts';
import { reportBaseName } from './json-report.ts';
import { REDACTION_NOTICE, redactReport, stripPrivateFields } from './redaction.ts';

/** Código sintético escrito para la prueba (no copia código de ningún sitio). */
const FOLIO_CODE = [
  'const PATRON=/^QJA-\\d{4}\\d{6}$/;',
  'function nuevoFolio(){const anio=new Date().getFullYear();',
  'const sufijo=String(Math.floor(Math.random()*999999)).padStart(6,"0");',
  'const folio="QJA-".concat(anio).concat(sufijo);',
  'return existeFolioRemoto("coleccionSecreta",{campoInterno:folio})?null:folio}',
].join('');

const DRAFT_CODE =
  'let k="app.formulario.draft";function g(v){window.localStorage.setItem(k,JSON.stringify({values:v}))}';

function reportWith(checks: ValidationReport['checks']): ValidationReport {
  return {
    schemaVersion: 1,
    tool: { name: 'sigilo-validar', version: '0.1.0', userAgent: USER_AGENT },
    mode: 'pasivo',
    target: { url: 'https://ejemplo.org/', pages: [] },
    startedAt: '2026-11-05T10:00:00.000Z',
    finishedAt: '2026-11-05T10:00:01.000Z',
    limits: { maxRequests: 1, navigationTimeoutMs: 1, maxResourceBytes: 1 },
    summary: { cumple: 0, no_cumple: 0, advertencia: 0, no_aplica: 0 },
    checks,
    observations: [
      {
        kind: 'codigo',
        description: 'Usa ALTCHA con el reto servido en /api/reto?accion=crear (propio origen).',
        url: 'https://ejemplo.org/_next/static/chunks/abc.js',
        snippet: 'altcha-widget',
      },
    ],
    network: {
      requestCount: 2,
      isRequestLimitReached: false,
      requests: [
        {
          url: 'https://ejemplo.org/_next/static/chunks/pagina-123.js?v=1',
          method: 'GET',
          resourceType: 'script',
          page: 'formulario',
          party: 'propio',
          status: 200,
          isBlocked: false,
        },
        {
          url: 'https://api.tercero.example/geocode?access_token=pk.secreto',
          method: 'GET',
          resourceType: 'fetch',
          page: 'formulario',
          party: 'tercero',
          status: null,
          isBlocked: true,
        },
      ],
    },
    errors: [],
  };
}

describe('redactReport', () => {
  const capture = sampleCapture({
    resources: [sampleScript(FOLIO_CODE), sampleScript(DRAFT_CODE, 'https://ejemplo.org/b.js')],
    pages: [
      samplePage({
        html: '<p>Tu avance se guarda sólo en este dispositivo durante 24 horas.</p>',
        storage: [{ area: 'localStorage', key: 'app.formulario.draft', value: '{"hechos":"x"}' }],
      }),
    ],
  });
  const folio = checkFolioPatternPassive(capture);
  const draft = checkDraftStoragePassive(capture);
  const redacted = redactReport(reportWith([folio, draft]), 'todas');
  const json = JSON.stringify(redacted);

  it('deja en PRV-09 y PRV-10 solo la conclusión general', () => {
    expect(redacted.checks[0]?.summary).toBe(
      'El folio se genera en el navegador con un generador no criptográfico, en un espacio aproximado de 10^6 valores por año, y el navegador consulta si un folio existe. El detalle técnico se conserva fuera del repositorio.',
    );
    expect(redacted.checks[1]?.summary).toContain(
      'guarda un borrador en localStorage durante 24 horas',
    );
  });

  it('no publica código, rutas de recursos, colecciones, campos, claves ni tokens', () => {
    for (const secret of [
      'existeFolioRemoto',
      'coleccionSecreta',
      'campoInterno',
      'Math.random',
      'app.formulario.draft',
      'pagina-123.js',
      '_next/static',
      'pk.secreto',
      '/api/reto',
      'QJA-',
    ]) {
      expect(json, secret).not.toContain(secret);
    }
    expect(redacted.observations.at(-1)?.description).toBe(REDACTION_NOTICE);
    expect(redacted.network.requests[1]?.url).toBe('https://api.tercero.example/geocode');
  });

  it('nunca escribe el campo interno redactedSummary', () => {
    expect(json).not.toContain('redactedSummary');
    const plain = stripPrivateFields(reportWith([folio]));
    expect(JSON.stringify(plain)).not.toContain('redactedSummary');
    expect(plain.checks[0]?.summary).toBe(folio.summary);
  });

  it('con una lista de ids redacta solo esas verificaciones', () => {
    const other = result('PRV-08', {
      status: 'advertencia',
      summary: 'Usa dictado.',
      evidence: [{ kind: 'codigo', description: 'x', snippet: 'webkitSpeechRecognition' }],
    });
    const partial = redactReport(reportWith([folio, other]), ['PRV-09']);
    expect(partial.checks[1]?.evidence[0]?.snippet).toBe('webkitSpeechRecognition');
    expect(JSON.stringify(partial.checks[0])).not.toContain('existeFolioRemoto');
  });
});

describe('captura guardada', () => {
  it('enmascara valores de cookies y almacenamiento conservando nombres y longitudes', () => {
    expect(maskSetCookie('sesion=SECRETO-123; Path=/; HttpOnly')).toBe(
      'sesion=[valor enmascarado]; Path=/; HttpOnly',
    );
    const masked = maskCapture({
      schemaVersion: 1,
      capturedAt: '2026-11-05T00:00:00.000Z',
      pages: [],
      capture: sampleCapture({
        pages: [
          samplePage({
            setCookies: ['s=SECRETO; Secure'],
            storage: [{ area: 'localStorage', key: 'clave', value: 'dato-sensible' }],
          }),
        ],
      }),
    });
    const text = JSON.stringify(masked);
    expect(text).not.toContain('SECRETO');
    expect(text).not.toContain('dato-sensible');
    expect(masked.capture.pages[0]?.storage[0]?.value).toHaveLength('dato-sensible'.length);
  });
});

describe('reportBaseName', () => {
  it('usa la fecha del centro de México', () => {
    // 03:00 UTC del 6 de noviembre aún es el 5 de noviembre en la Ciudad de México.
    expect(reportBaseName('demo', new Date('2026-11-06T03:00:00Z'))).toBe('demo-2026-11-05');
  });
});
