// Pruebas del semáforo de turnado de la bandeja del S5 con el reloj del nodo: sin turnar en el
// buzón, turnada sin aceptar, días hábiles y denuncias que ya no esperan.
import { describe, expect, it } from 'vitest';
import { ComplaintDetailSchema, ComplaintSummarySchema, ROUTES } from '@sigilo/contracts';
import { z } from 'zod';
import {
  buildComplaintRequest,
  createReporter,
  createTestServer,
  getAsAuthority,
  procedureAs,
  submitComplaint,
  TEST_AUTHORITIES,
  testToken,
} from '../test-support/harness.ts';
import type { TestAccountName, TestServer } from '../test-support/harness.ts';

async function list(server: TestServer, name: TestAccountName) {
  const response = await getAsAuthority(server.app, ROUTES.authorityComplaints, testToken(name));
  expect(response.status).toBe(200);
  return z.array(ComplaintSummarySchema.strict()).parse(await response.json());
}

async function detail(server: TestServer, name: TestAccountName, folio: string) {
  const response = await getAsAuthority(
    server.app,
    ROUTES.authorityComplaint(folio),
    testToken(name),
  );
  return ComplaintDetailSchema.parse(await response.json());
}

/** Denuncia recibida el martes 20 de octubre de 2026 (día legal), en el buzón general. */
async function setup() {
  const server = createTestServer();
  const request = await buildComplaintRequest(server, {
    mode: 'anonymous',
    reporter: createReporter(),
  });
  const { folio } = await submitComplaint(server, request);
  return { server, folio };
}

describe('semáforo de turnado', () => {
  it('sin turnar: a tiempo, por vencer al día hábil y vencida al segundo', async () => {
    const { server, folio } = await setup();
    const today = (await list(server, 'inboxIntake')).find((item) => item.folio === folio);
    expect(today?.turnSemaphore).toEqual({
      waitingFor: 'routing',
      status: 'a_tiempo',
      sinceOn: '2026-10-20',
      elapsedDays: 0,
      warningOn: '2026-10-21',
      overdueOn: '2026-10-22',
    });
    server.setNow(new Date('2026-10-21T18:00:00Z'));
    expect((await list(server, 'inboxIntake'))[0]?.turnSemaphore?.status).toBe('por_vencer');
    server.setNow(new Date('2026-10-22T18:00:00Z'));
    expect((await list(server, 'inboxIntake'))[0]?.turnSemaphore?.status).toBe('vencida');
    // El detalle trae el mismo semáforo en su resumen.
    expect((await detail(server, 'inboxIntake', folio)).summary.turnSemaphore?.status).toBe(
      'vencida',
    );
  });

  it('cuenta días hábiles: el fin de semana no vence una denuncia del viernes', async () => {
    const { server, folio } = await setup();
    // Se turna el viernes 23 de octubre; el lunes 26 apenas cumple un día hábil.
    server.setNow(new Date('2026-10-23T17:00:00Z'));
    const routed = await procedureAs(server, 'inboxIntake', folio, {
      action: 'route',
      authorityId: TEST_AUTHORITIES.oic,
      note: 'Se turna al órgano interno de control del ente (nota sintética).',
    });
    expect(routed.status).toBe(200);
    server.setNow(new Date('2026-10-25T17:00:00Z'));
    const sunday = (await list(server, 'oicIntake'))[0]?.turnSemaphore;
    expect(sunday).toMatchObject({ waitingFor: 'acceptance', status: 'a_tiempo', elapsedDays: 0 });
    server.setNow(new Date('2026-10-26T17:00:00Z'));
    expect((await list(server, 'oicIntake'))[0]?.turnSemaphore?.status).toBe('por_vencer');
    server.setNow(new Date('2026-10-27T17:00:00Z'));
    expect((await list(server, 'oicIntake'))[0]?.turnSemaphore).toMatchObject({
      status: 'vencida',
      sinceOn: '2026-10-23',
      overdueOn: '2026-10-27',
    });
  });

  it('se reinicia al devolverse al buzón y desaparece al aceptarse', async () => {
    const { server, folio } = await setup();
    await procedureAs(server, 'inboxIntake', folio, {
      action: 'route',
      authorityId: TEST_AUTHORITIES.oic,
      note: 'Se turna al órgano interno de control del ente (nota sintética).',
    });
    server.setNow(new Date('2026-10-28T17:00:00Z'));
    expect((await list(server, 'oicIntake'))[0]?.turnSemaphore?.status).toBe('vencida');
    await procedureAs(server, 'oicIntake', folio, {
      action: 'return',
      note: 'No nos corresponde: se devuelve al buzón general (sintético).',
    });
    expect((await list(server, 'inboxIntake'))[0]?.turnSemaphore).toMatchObject({
      waitingFor: 'routing',
      status: 'a_tiempo',
      sinceOn: '2026-10-28',
    });
    await procedureAs(server, 'inboxIntake', folio, {
      action: 'route',
      authorityId: TEST_AUTHORITIES.oic,
      note: 'Se vuelve a turnar al órgano interno de control (nota sintética).',
    });
    expect(
      (
        await procedureAs(server, 'oicIntake', folio, {
          action: 'accept',
        })
      ).status,
    ).toBe(200);
    const accepted = (await list(server, 'oicIntake'))[0];
    expect(accepted?.managementState).toBe('accepted');
    expect(accepted?.turnSemaphore).toBeUndefined();
  });
});
