// Pruebas del CSV de datos abiertos: solo meses completos, redondeo, supresión de celdas pequeñas,
// clave principal de la conducta e instantáneas mensuales congeladas.
import { describe, expect, it } from 'vitest';
import { ROUTES } from '@sigilo/contracts';
import {
  buildComplaintRequest,
  createReporter,
  createTestServer,
  NEXT_MONTH,
  postJson,
  submitComplaint,
  TEST_TOKEN,
} from '../test-support/harness.ts';
import type { TestServer } from '../test-support/harness.ts';

const HEADER = 'entidad,conducta,mes_recepcion,estatus,denuncias';

async function submitMany(
  server: TestServer,
  count: number,
  stateCode: string,
  offenseCode = 'LGRA-52',
): Promise<string[]> {
  const folios: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const request = await buildComplaintRequest(server, {
      mode: 'anonymous',
      reporter: createReporter(),
      stateCode,
      offenseCode,
    });
    folios.push((await submitComplaint(server, request)).folio);
  }
  return folios;
}

async function readCsv(server: TestServer): Promise<string> {
  return (await server.app.request(ROUTES.openDataCsv)).text();
}

describe('GET open-data CSV', () => {
  it('no publica el mes en curso', async () => {
    const server = createTestServer();
    await submitMany(server, 7, '22');
    const response = await server.app.request(ROUTES.openDataCsv);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(await response.text()).toBe(`${HEADER}\r\nsuprimidas,,,,0\r\n`);
  });

  it('publica meses completos con conteos redondeados y suprime las celdas menores que 5', async () => {
    const server = createTestServer();
    await submitMany(server, 7, '22');
    await submitMany(server, 3, '09');
    server.setNow(NEXT_MONTH);
    // Lo recibido en el mes nuevo no aparece todavía.
    await submitMany(server, 6, '14');
    expect(await readCsv(server)).toBe(
      [HEADER, '22,LGRA-52,2026-10,received,5', 'suprimidas,,,,5', ''].join('\r\n'),
    );
  });

  it('incluye la fila de suprimidas con todas las columnas aunque no haya datos', async () => {
    const server = createTestServer();
    expect(await readCsv(server)).toBe(`${HEADER}\r\nsuprimidas,,,,0\r\n`);
  });

  it('agrega las claves equivalentes del CPF en la clave principal', async () => {
    const server = createTestServer();
    await submitMany(server, 3, '22', 'LGRA-52');
    await submitMany(server, 3, '22', 'CPF-222');
    server.setNow(NEXT_MONTH);
    expect(await readCsv(server)).toBe(
      [HEADER, '22,LGRA-52,2026-10,received,5', 'suprimidas,,,,0', ''].join('\r\n'),
    );
  });

  it('congela cada mes al cerrarse: los cambios de estatus posteriores no lo alteran', async () => {
    const server = createTestServer();
    const folios = await submitMany(server, 7, '22');
    server.setNow(NEXT_MONTH);
    const frozen = await readCsv(server);
    expect(frozen).toContain('22,LGRA-52,2026-10,received,5');
    for (const folio of folios.slice(0, 3)) {
      await postJson(server.app, ROUTES.authorityStatus(folio), { status: 'routing' }, TEST_TOKEN);
    }
    expect(await readCsv(server)).toBe(frozen);
  });
});
