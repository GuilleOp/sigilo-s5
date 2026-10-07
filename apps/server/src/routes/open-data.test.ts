// Pruebas del CSV de datos abiertos: agregación por celda y supresión de celdas pequeñas.
import { describe, expect, it } from 'vitest';
import { OPEN_DATA_MIN_CELL, ROUTES } from '@sigilo/contracts';
import {
  buildComplaintRequest,
  createReporter,
  createTestServer,
  submitComplaint,
} from '../test-support/harness.ts';
import type { TestServer } from '../test-support/harness.ts';

async function submitMany(server: TestServer, count: number, stateCode: string): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const request = await buildComplaintRequest(server, {
      mode: 'anonymous',
      reporter: createReporter(),
      stateCode,
    });
    await submitComplaint(server, request);
  }
}

describe('GET open-data CSV', () => {
  it('publica las celdas grandes y suprime las menores al umbral', async () => {
    const server = createTestServer();
    await submitMany(server, OPEN_DATA_MIN_CELL, '22');
    await submitMany(server, 2, '09');
    const response = await server.app.request(ROUTES.openDataCsv);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(await response.text()).toBe(
      [
        'entidad,conducta,mes_recepcion,estatus,denuncias',
        `22,LGRA-52,2026-10,received,${OPEN_DATA_MIN_CELL}`,
        'suprimidas,2',
        '',
      ].join('\r\n'),
    );
  });

  it('incluye la fila de suprimidas aunque no haya datos', async () => {
    const server = createTestServer();
    const text = await (await server.app.request(ROUTES.openDataCsv)).text();
    expect(text).toBe('entidad,conducta,mes_recepcion,estatus,denuncias\r\nsuprimidas,0\r\n');
  });
});
