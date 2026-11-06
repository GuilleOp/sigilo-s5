// Reporte JSON estable (formato `schemaVersion: 1`, descrito en `report.schema.json`) y escritura
// de ambos reportes en disco.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ValidationReport } from '../types.ts';
import { renderHtmlReport } from './html-report.ts';

/** Ruta del esquema JSON del reporte. */
export const REPORT_SCHEMA_PATH = join(import.meta.dirname, '..', '..', 'report.schema.json');

/** Serializa el reporte con sangría de dos espacios y salto de línea final. */
export function renderJsonReport(report: ValidationReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

/** Zona horaria de la fecha de los archivos: la del centro de México. */
export const REPORT_TIME_ZONE = 'America/Mexico_City';

/** Nombre base de los archivos: `<prefijo>-AAAA-MM-DD`, con la fecha del centro de México. */
export function reportBaseName(prefix: string, date: Date): string {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return `${prefix}-${day}`;
}

/** Escribe `<base>.json` y `<base>.html` en `directory` y devuelve sus rutas. */
export function writeReports(
  report: ValidationReport,
  directory: string,
  baseName: string,
): { jsonPath: string; htmlPath: string } {
  mkdirSync(directory, { recursive: true });
  const jsonPath = join(directory, `${baseName}.json`);
  const htmlPath = join(directory, `${baseName}.html`);
  writeFileSync(jsonPath, renderJsonReport(report));
  writeFileSync(htmlPath, renderHtmlReport(report));
  return { jsonPath, htmlPath };
}
