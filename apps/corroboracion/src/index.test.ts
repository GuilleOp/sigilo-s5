// Pruebas del índice de coincidencias: solo nodos del directorio con firma válida, registro
// idempotente, horas fuera de rango y avisos firmados por nodo.
import { describe, expect, it } from 'vitest';
import { CORROBORATION_ROUTES, IndexNoticesPageSchema } from '@sigilo/contracts';
import { folioDigestFor, signIndexRegistration, signNoticesRequest } from '@sigilo/corroboracion';
import { demoCase } from '@sigilo/corroboracion/demo';
import {
  corroborateInBrowser,
  createTestCorroboration,
  postJson,
  registerFromNode,
} from './test-support.ts';

function baseRegistration(services: ReturnType<typeof createTestCorroboration>) {
  return {
    nodeId: 'node.queretaro',
    epoch: 1,
    tag: 'a'.repeat(64),
    folioDigest: folioDigestFor('K7Q2-M9XP-4RTD', services.nodeSecrets['node.queretaro']),
    receivedAt: '2026-11-09T11:50Z',
    entry: 'direct' as const,
    similarity: null,
  };
}

describe('índice de coincidencias', () => {
  it('rechaza con el mismo 401 un nodo desconocido y una firma de otro nodo', async () => {
    const services = createTestCorroboration();
    const unknown = signIndexRegistration(
      { ...baseRegistration(services), nodeId: 'node.desconocido' },
      services.network.nodes['node.queretaro'].signing.privateKey,
    );
    const foreign = signIndexRegistration(
      baseRegistration(services),
      services.network.nodes['node.federal'].signing.privateKey,
    );
    for (const body of [unknown, foreign]) {
      const response = await postJson(
        services.indexApp,
        CORROBORATION_ROUTES.indexRegistrations,
        body,
      );
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: { code: 'unauthorized', message: 'No autorizado.' },
      });
    }
  });

  it('registra de forma idempotente y no deja cambiar la etiqueta de un folio', async () => {
    const services = createTestCorroboration();
    const key = services.network.nodes['node.queretaro'].signing.privateKey;
    const registration = signIndexRegistration(baseRegistration(services), key);
    const first = await postJson(
      services.indexApp,
      CORROBORATION_ROUTES.indexRegistrations,
      registration,
    );
    const again = await postJson(
      services.indexApp,
      CORROBORATION_ROUTES.indexRegistrations,
      registration,
    );
    expect(first.status).toBe(200);
    expect(await again.json()).toEqual(await first.json());
    const changed = signIndexRegistration(
      { ...baseRegistration(services), tag: 'b'.repeat(64) },
      key,
    );
    const response = await postJson(
      services.indexApp,
      CORROBORATION_ROUTES.indexRegistrations,
      changed,
    );
    expect(response.status).toBe(400);
  });

  it('rechaza una hora del futuro y un resumen difuso alterado después de firmar', async () => {
    const services = createTestCorroboration();
    const key = services.network.nodes['node.queretaro'].signing.privateKey;
    const future = signIndexRegistration(
      { ...baseRegistration(services), receivedAt: '2026-11-09T13:00Z' },
      key,
    );
    expect(
      (await postJson(services.indexApp, CORROBORATION_ROUTES.indexRegistrations, future)).status,
    ).toBe(400);
    const registration = signIndexRegistration(baseRegistration(services), key);
    const bad = { ...registration, similarity: 'A'.repeat(86) };
    expect(
      (await postJson(services.indexApp, CORROBORATION_ROUTES.indexRegistrations, bad)).status,
    ).toBe(401);
  });

  it('entrega avisos solo al nodo que firma y con hora vigente', async () => {
    const services = createTestCorroboration();
    const marta = demoCase('case.marta');
    const luis = demoCase('case.luis');
    // Ambas llegan a nodos distintos en este caso, para comprobar el aviso entre nodos.
    const martaHere = { ...marta, nodeId: 'node.queretaro', receivedAt: '2026-11-09T11:00Z' };
    const luisHere = { ...luis, receivedAt: '2026-11-09T11:50Z' };
    const first = await corroborateInBrowser(services, marta.identifier, marta.narrative);
    await registerFromNode(services, martaHere, 'K7Q2-M9XP-4RT1', first);
    const second = await corroborateInBrowser(services, luis.identifier, luis.narrative);
    const registered = await registerFromNode(services, luisHere, 'D7Q2-M9XP-4RT5', second);
    expect(registered.status?.independentSources).toBe(2);

    const request = (
      nodeId: 'node.queretaro' | 'node.federal',
      requestedAt = '2026-11-09T12:00Z',
    ) =>
      signNoticesRequest(
        { nodeId, after: 0, requestedAt },
        services.network.nodes[nodeId].signing.privateKey,
      );
    const queretaro = await postJson(
      services.indexApp,
      CORROBORATION_ROUTES.indexNotices,
      request('node.queretaro'),
    );
    const page = IndexNoticesPageSchema.parse(await queretaro.json());
    expect(page.notices).toHaveLength(1);
    expect(page.notices[0]?.status.independentSources).toBe(2);
    expect(page.notices[0]?.status.folioDigest).toBe(
      folioDigestFor('K7Q2-M9XP-4RT1', services.nodeSecrets['node.queretaro']),
    );
    const federal = await postJson(
      services.indexApp,
      CORROBORATION_ROUTES.indexNotices,
      request('node.federal'),
    );
    expect(IndexNoticesPageSchema.parse(await federal.json()).notices).toEqual([]);
    const stale = await postJson(
      services.indexApp,
      CORROBORATION_ROUTES.indexNotices,
      request('node.queretaro', '2026-11-09T09:00Z'),
    );
    expect(stale.status).toBe(400);
    const forged = { ...request('node.queretaro'), nodeId: 'node.federal' };
    expect(
      (await postJson(services.indexApp, CORROBORATION_ROUTES.indexNotices, forged)).status,
    ).toBe(401);
  });
});
