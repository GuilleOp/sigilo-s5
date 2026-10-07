// Pruebas del registro de peticiones: contadores por hora sin las rutas de la persona denunciante
// y sin orden de llegada, una línea por petición solo en desarrollo, y nada en modo `off`.
import { describe, expect, it } from 'vitest';
import { ROUTES } from '@sigilo/contracts';
import { createRequestLog } from './request-log.ts';
import type { RequestLogLine, RequestLogMode } from './request-log.ts';
import {
  buildComplaintRequest,
  createReporter,
  createTestServer,
  getAsAuthority,
  submitComplaint,
} from '../test-support/harness.ts';

function serverWith(mode: RequestLogMode) {
  const lines: RequestLogLine[] = [];
  let now = new Date('2026-10-20T15:10:00Z');
  const requestLog = createRequestLog({ mode, now: () => now, write: (line) => lines.push(line) });
  const server = createTestServer({ requestLog, now: () => now });
  return { server, lines, requestLog, setNow: (date: Date) => (now = date) };
}

describe('createRequestLog', () => {
  it('en modo aggregate cuenta por hora, sin rutas de la persona denunciante, llaves ni bitácora', async () => {
    const { server, lines, requestLog, setNow } = serverWith('aggregate');
    const request = await buildComplaintRequest(server, {
      mode: 'anonymous',
      reporter: createReporter(),
    });
    await submitComplaint(server, request);
    await server.app.request(ROUTES.ledgerHead);
    await server.app.request(`${ROUTES.ledgerEvents}?from=0`);
    await server.app.request(ROUTES.keys);
    await getAsAuthority(server.app, ROUTES.authorityComplaints);
    await getAsAuthority(server.app, ROUTES.authorityComplaints);
    await server.app.request(ROUTES.openDataCsv);
    await server.app.request(`${ROUTES.powChallenge}?purpose=complaint`);
    expect(lines).toEqual([]);

    // La primera petición contada de la hora siguiente escribe el resumen de la anterior.
    setNow(new Date('2026-10-20T16:01:00Z'));
    await server.app.request(ROUTES.keys);
    expect(lines).toEqual([]);
    await server.app.request(ROUTES.openDataCsv);
    expect(lines).toEqual([
      {
        hour: '2026-10-20T15:00Z',
        counts: [
          { method: 'GET', route: ROUTES.authorityComplaints, status: 200, count: 2 },
          { method: 'GET', route: ROUTES.openDataCsv, status: 200, count: 1 },
        ],
      },
    ]);
    for (const route of [ROUTES.complaints, ROUTES.keys, ROUTES.ledgerHead, ROUTES.ledgerEvents]) {
      expect(JSON.stringify(lines)).not.toContain(`"${route}"`);
    }
    requestLog.flush();
    expect(lines.at(-1)).toEqual({
      hour: '2026-10-20T16:00Z',
      counts: [{ method: 'GET', route: ROUTES.openDataCsv, status: 200, count: 1 }],
    });
    requestLog.flush();
    expect(lines).toHaveLength(2);
  });

  it('en modo requests escribe una línea por petición sin identificadores', async () => {
    const { server, lines } = serverWith('requests');
    await server.app.request(ROUTES.authorityComplaint('AAAA-AAAA-AAAA'));
    expect(lines).toEqual([
      { method: 'GET', route: expect.any(String), status: 401, durationMs: expect.any(Number) },
    ]);
    expect(JSON.stringify(lines)).not.toContain('AAAA-AAAA-AAAA');
  });

  it('en modo off no escribe nada', async () => {
    const { server, lines, requestLog } = serverWith('off');
    await server.app.request(ROUTES.openDataCsv);
    requestLog.flush();
    expect(lines).toEqual([]);
  });
});
