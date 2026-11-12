#!/usr/bin/env node
// CLI del perfil «conexión PDN»: `npm run validate:pdn -- --token-url <url> --consulta-url <url>`.
// Las credenciales llegan por variables de entorno para que no queden en el historial de la
// terminal. Escribe el reporte en JSON y su resumen en stdout.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { TOOL_NAME, TOOL_VERSION } from '../version.ts';
import { runPdnProfile } from './pdn-profile.ts';
import type { PdnEnvironment } from './pdn-profile.ts';

const USAGE = `Uso: ${TOOL_NAME} perfil «conexión PDN»
  npm run validate:pdn -- --token-url <url> --consulta-url <url> [opciones]

Reproduce los casos de ValidAPI (protocolo de conexión de la SESNA) contra el nodo de un estado.
Credenciales por variables de entorno: SIGILO_PDN_CLIENT_ID y SIGILO_PDN_CLIENT_SECRET (obligatorias),
SIGILO_PDN_USERNAME y SIGILO_PDN_PASSWORD (flujo password; sin ellas, client_credentials) y
SIGILO_PDN_SCOPE (opcional).

Opciones:
  --token-url <url>           Ruta del token (debe contener /oauth/token).
  --consulta-url <url>        Ruta de la estadística (…/v1/denuncias/estadisticas).
  --autoridades-url <url>     Catálogo de autoridades (por omisión, <consulta-url>/autoridades).
  --ambiente desarrollo|productivo
                              En productivo, http es «no aprobado» (por omisión: desarrollo).
  --esperar-vencimiento       Espera expires_in segundos y comprueba que el token ya no sirve.
  --salida <carpeta>          Carpeta del reporte (por omisión: estandar/reportes).
  --nombre <prefijo>          Prefijo del archivo (por omisión: el host). Se agrega -pdn-AAAA-MM-DD.
  --ayuda                     Muestra esta ayuda.

Código de salida: 0 sin casos «no aprobado», 1 con al menos uno, 2 error de uso.
`;

function requiredEnv(name: string): string {
  const value = process.env[name] ?? '';
  if (value === '') throw new Error(`Falta la variable de entorno ${name}.`);
  return value;
}

function httpUrl(name: string, value: string | undefined): string {
  if (value === undefined) throw new Error(`Falta ${name}.`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} no es una URL válida.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${name} debe ser http o https.`);
  }
  return url.href;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      'token-url': { type: 'string' },
      'consulta-url': { type: 'string' },
      'autoridades-url': { type: 'string' },
      ambiente: { type: 'string', default: 'desarrollo' },
      'esperar-vencimiento': { type: 'boolean', default: false },
      salida: { type: 'string', default: 'estandar/reportes' },
      nombre: { type: 'string' },
      ayuda: { type: 'boolean', default: false },
    },
  });
  if (values.ayuda) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (values.ambiente !== 'desarrollo' && values.ambiente !== 'productivo') {
    throw new Error('--ambiente debe ser desarrollo o productivo.');
  }
  const environment: PdnEnvironment = values.ambiente;
  const tokenUrl = httpUrl('--token-url', values['token-url']);
  const queryUrl = httpUrl('--consulta-url', values['consulta-url']);
  const authorities = values['autoridades-url'];
  const username = process.env.SIGILO_PDN_USERNAME;
  const password = process.env.SIGILO_PDN_PASSWORD;
  const scope = process.env.SIGILO_PDN_SCOPE;
  process.stdout.write(
    `${TOOL_NAME} ${TOOL_VERSION} · perfil conexión PDN · ambiente ${environment}\n`,
  );
  const report = await runPdnProfile({
    tokenUrl,
    queryUrl,
    ...(authorities === undefined
      ? {}
      : { authoritiesUrl: httpUrl('--autoridades-url', authorities) }),
    credentials: {
      clientId: requiredEnv('SIGILO_PDN_CLIENT_ID'),
      clientSecret: requiredEnv('SIGILO_PDN_CLIENT_SECRET'),
      ...(username === undefined || username === '' ? {} : { username }),
      ...(password === undefined || password === '' ? {} : { password }),
      ...(scope === undefined || scope === '' ? {} : { scope }),
    },
    environment,
    waitForExpiry: values['esperar-vencimiento'],
  });
  for (const item of report.cases) {
    process.stdout.write(`  ${item.id}  ${item.status.padEnd(11)} ${item.title}: ${item.detail}\n`);
  }
  const prefix = values.nombre ?? new URL(queryUrl).host.replace(/[^a-zA-Z0-9.-]/gu, '-');
  mkdirSync(values.salida, { recursive: true });
  const path = join(values.salida, `${prefix}-pdn-${report.startedAt.slice(0, 10)}.json`);
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
  const { summary } = report;
  process.stdout.write(
    `Resumen: ${summary.aprobado} aprobado, ${summary.no_aprobado} no aprobado, ${summary.advertencia} advertencia, ${summary.no_evaluado} no evaluado.\nReporte: ${path}\n`,
  );
  return summary.no_aprobado > 0 ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Error desconocido.'}\n`);
    process.stderr.write(USAGE);
    process.exitCode = 2;
  },
);
