#!/usr/bin/env node
// CLI `sigilo-validar <url> [--modo pasivo|conformidad] [--salida carpeta]`: ejecuta una corrida
// y escribe el reporte en JSON y HTML. Escribe su avance en stdout con process.stdout.write.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { defaultCapturePath, writeSavedCapture } from './capture/saved-capture.ts';
import type { RedactionMode } from './report/redaction.ts';
import { reportBaseName, writeReports } from './report/json-report.ts';
import { DEFAULT_RUN_OPTIONS, runValidation } from './run.ts';
import type { SavedCapture } from './run.ts';
import type { ValidationMode } from './types.ts';
import { TOOL_NAME, TOOL_VERSION, USER_AGENT } from './version.ts';

const USAGE = `Uso: ${TOOL_NAME} <url> [opciones]
       ${TOOL_NAME} --desde-captura <archivo> [opciones]

Opciones:
  --modo pasivo|conformidad   pasivo (por omisión): solo GET a recursos públicos.
                              conformidad: además envía denuncias sintéticas al nodo.
  --salida <carpeta>          Carpeta de los reportes (por omisión: estandar/reportes).
  --nombre <prefijo>          Prefijo del archivo (por omisión: el host). Se agrega -AAAA-MM-DD.
  --formulario <ruta>         Ruta del formulario (por omisión: ${DEFAULT_RUN_OPTIONS.formPath}).
  --openapi <archivo>         Especificación para API-01 (por omisión: estandar/openapi.yaml del repositorio).
  --max-peticiones <n>        Tope de peticiones de la corrida (por omisión: ${DEFAULT_RUN_OPTIONS.maxRequests}).
  --tiempo-limite <ms>        Tiempo máximo por navegación (por omisión: ${DEFAULT_RUN_OPTIONS.navigationTimeoutMs}).
  --permitir-terceros         Deja salir las peticiones a terceros (por omisión se registran y bloquean).
  --guardar-captura           Guarda lo observado (cabeceras, red y código) con cookies y
                              almacenamiento enmascarados, en el directorio temporal del sistema.
  --archivo-captura <archivo> Ruta de la captura (implica --guardar-captura); mejor fuera del repositorio.
  --desde-captura <archivo>   Analiza una captura guardada sin hacer ninguna petición (modo pasivo).
  --redactar <auto|ninguna|ids>
                              Redacción de la evidencia de código. auto (por omisión): redacta si el
                              sitio no es local. ninguna: reporte completo (solo para divulgación
                              privada, fuera del repositorio). Ids separados por comas: solo esas.
  --confirmo-nodo-propio      Necesario para el modo conformidad contra un host que no es local:
                              declara que el nodo es propio o que hay autorización.
  --ayuda                     Muestra esta ayuda.

Código de salida: 0 sin incumplimientos, 1 con al menos un «no cumple», 2 error de uso o de ejecución.
`;

function write(text: string): void {
  process.stdout.write(text);
}

function parsePositiveInteger(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1)
    throw new Error(`${name} debe ser un entero positivo.`);
  return parsed;
}

/** Interpreta `--redactar`. Lanza error con un id que no tiene la forma del estándar. */
function parseRedaction(value: string): RedactionMode {
  if (value === 'auto' || value === 'ninguna') return value;
  const ids = value
    .split(',')
    .map((id) => id.trim().toUpperCase())
    .filter(Boolean);
  if (ids.length === 0 || ids.some((id) => !/^(?:PRV|API|SEC)-\d{2}$/.test(id))) {
    throw new Error('--redactar debe ser auto, ninguna o una lista de ids (p. ej. PRV-09,PRV-10).');
  }
  return ids;
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      modo: { type: 'string', default: 'pasivo' },
      salida: { type: 'string', default: 'estandar/reportes' },
      nombre: { type: 'string' },
      formulario: { type: 'string', default: DEFAULT_RUN_OPTIONS.formPath },
      openapi: { type: 'string', default: DEFAULT_RUN_OPTIONS.openApiPath },
      'max-peticiones': { type: 'string' },
      'tiempo-limite': { type: 'string' },
      'permitir-terceros': { type: 'boolean', default: false },
      'guardar-captura': { type: 'boolean', default: false },
      'archivo-captura': { type: 'string' },
      redactar: { type: 'string', default: 'auto' },
      'confirmo-nodo-propio': { type: 'boolean', default: false },
      'desde-captura': { type: 'string' },
      ayuda: { type: 'boolean', default: false },
    },
  });
  if (values.ayuda) {
    write(USAGE);
    return 0;
  }
  const savedPath = values['desde-captura'];
  const saved =
    savedPath === undefined
      ? undefined
      : (JSON.parse(readFileSync(savedPath, 'utf8')) as SavedCapture);
  if (saved !== undefined && saved.schemaVersion !== 1) {
    throw new Error('La captura guardada no tiene un formato reconocido.');
  }
  const url = positionals[0] ?? saved?.capture.targetUrl;
  if (url === undefined || positionals.length > 1) {
    process.stderr.write(USAGE);
    return 2;
  }
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new Error('La URL no es válida.');
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new Error('Solo se admiten URL http o https.');
  }
  if (values.modo !== 'pasivo' && values.modo !== 'conformidad') {
    throw new Error('--modo debe ser pasivo o conformidad.');
  }
  const mode: ValidationMode = values.modo;
  const startedAt = saved === undefined ? new Date() : new Date(saved.capturedAt);
  write(`${TOOL_NAME} ${TOOL_VERSION} · modo ${mode} · ${target.href}\n`);
  if (saved !== undefined)
    write(`Analizando la captura del ${saved.capturedAt}, sin peticiones.\n`);
  write(`User-Agent: ${USER_AGENT}\n`);
  if (mode === 'conformidad') {
    write('Atención: el modo conformidad envía denuncias sintéticas al nodo.\n');
  }
  const report = await runValidation({
    url: target.href,
    mode,
    formPath: values.formulario,
    openApiPath: values.openapi,
    maxRequests: parsePositiveInteger(
      '--max-peticiones',
      values['max-peticiones'],
      DEFAULT_RUN_OPTIONS.maxRequests,
    ),
    navigationTimeoutMs: parsePositiveInteger(
      '--tiempo-limite',
      values['tiempo-limite'],
      DEFAULT_RUN_OPTIONS.navigationTimeoutMs,
    ),
    maxResourceBytes: DEFAULT_RUN_OPTIONS.maxResourceBytes,
    allowThirdParty: values['permitir-terceros'],
    ...(saved === undefined ? {} : { savedCapture: saved }),
    redaction: parseRedaction(values.redactar),
    isOwnNodeConfirmed: values['confirmo-nodo-propio'],
    onCapture: (capture) => {
      const explicit = values['archivo-captura'];
      if (!values['guardar-captura'] && explicit === undefined) return;
      const path = writeSavedCapture(
        capture,
        explicit ?? defaultCapturePath(target.host, startedAt),
      );
      write(`Captura guardada (cookies y almacenamiento enmascarados) en ${path}\n`);
    },
  });
  for (const check of report.checks) {
    write(`  ${check.id}  ${check.status.padEnd(11)} ${check.summary}\n`);
  }
  for (const error of report.errors) write(`  Error: ${error}\n`);
  const prefix = values.nombre ?? target.host.replace(/[^a-zA-Z0-9.-]/g, '-');
  const { jsonPath, htmlPath } = writeReports(
    report,
    values.salida,
    reportBaseName(prefix, startedAt),
  );
  const { summary } = report;
  write(
    `Resumen: ${summary.cumple} cumple, ${summary.no_cumple} no cumple, ${summary.advertencia} advertencia, ${summary.no_aplica} no aplica. Peticiones: ${report.network.requestCount}.\n`,
  );
  write(`Reportes: ${jsonPath} y ${htmlPath}\n`);
  return summary.no_cumple > 0 ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Error desconocido.'}\n`);
    process.exitCode = 2;
  },
);
