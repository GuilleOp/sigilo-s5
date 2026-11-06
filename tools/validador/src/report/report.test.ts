// Pruebas de los reportes: el JSON cumple `report.schema.json` y el HTML es autocontenido,
// escapa el contenido y muestra cada estado con ícono y texto.
import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { CHECKS, result } from '../catalog.ts';
import type { ValidationReport } from '../types.ts';
import { USER_AGENT } from '../version.ts';
import { escapeHtml, renderHtmlReport, STATUS_LABELS } from './html-report.ts';
import { renderJsonReport, REPORT_SCHEMA_PATH, reportBaseName } from './json-report.ts';

function sampleReport(): ValidationReport {
  const statuses = ['cumple', 'no_cumple', 'advertencia', 'no_aplica'] as const;
  const checks = CHECKS.map((check, index) =>
    result(check.id, {
      status: statuses[index % 4] ?? 'cumple',
      summary: `Resumen <b>${check.id}</b>`,
      isHeuristic: index % 2 === 0,
      evidence: [
        {
          kind: 'codigo',
          description: 'Fragmento',
          url: 'https://ejemplo.org/a.js',
          snippet: '<script>alert(1)</script>',
        },
      ],
    }),
  );
  return {
    schemaVersion: 1,
    tool: { name: 'sigilo-validar', version: '0.1.0', userAgent: USER_AGENT },
    mode: 'pasivo',
    target: {
      url: 'https://ejemplo.org/',
      pages: [{ label: 'inicio', url: 'https://ejemplo.org/' }],
    },
    startedAt: '2026-11-05T10:00:00.000Z',
    finishedAt: '2026-11-05T10:00:05.000Z',
    limits: { maxRequests: 400, navigationTimeoutMs: 30000, maxResourceBytes: 4194304 },
    summary: { cumple: 5, no_cumple: 4, advertencia: 4, no_aplica: 4 },
    checks,
    observations: [
      { kind: 'cabecera', description: 'Tecnología', name: 'x-powered-by', value: 'Next.js' },
    ],
    network: {
      requestCount: 1,
      isRequestLimitReached: false,
      requests: [
        {
          url: 'https://ejemplo.org/',
          method: 'GET',
          resourceType: 'document',
          page: 'inicio',
          party: 'propio',
          status: 200,
          isBlocked: false,
        },
      ],
    },
    errors: [],
  };
}

describe('reporte JSON', () => {
  it('cumple el esquema documentado', () => {
    const schema = JSON.parse(readFileSync(REPORT_SCHEMA_PATH, 'utf8')) as object;
    const validate = new Ajv2020({ strict: true }).compile(schema);
    const parsed = JSON.parse(renderJsonReport(sampleReport())) as unknown;
    expect(validate(parsed), JSON.stringify(validate.errors)).toBe(true);
  });

  it('nombra los archivos con el prefijo y la fecha', () => {
    expect(reportBaseName('demo-oficial', new Date('2026-11-05T23:00:00Z'))).toBe(
      'demo-oficial-2026-11-05',
    );
  });
});

describe('reporte HTML', () => {
  const html = renderHtmlReport(sampleReport());

  it('no carga recursos externos', () => {
    expect(html).not.toMatch(/<(?:script|link|img|iframe)\b/i);
    expect(html).not.toMatch(/(?:src|href)\s*=\s*["']https?:/i);
    expect(html).toContain("default-src 'none'");
  });

  it('escapa el contenido de la evidencia', () => {
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain(escapeHtml('<script>alert(1)</script>'));
    expect(html).not.toContain('<b>PRV-01</b>');
  });

  it('usa una tabla con encabezados y estados con ícono y texto', () => {
    expect(html).toContain('<caption>');
    expect(html).toContain('<th scope="col">Resultado</th>');
    expect(html).toContain('<th scope="row">');
    for (const label of Object.values(STATUS_LABELS)) {
      expect(html).toContain(
        `<span class="icon" aria-hidden="true">${label.icon}</span> ${label.text}`,
      );
    }
    expect(html).toContain('lang="es-MX"');
  });
});
