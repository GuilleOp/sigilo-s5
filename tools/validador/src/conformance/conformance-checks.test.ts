// Pruebas del modo conformidad contra el servidor de referencia en memoria y contra un nodo malo,
// ambos en 127.0.0.1.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sampleCapture, sampleScript } from '../test-support/capture-builder.ts';
import {
  BAD_NODE_FOLIO,
  startBadNode,
  startReferenceNode,
} from '../test-support/reference-node.ts';
import type { TestNode } from '../test-support/reference-node.ts';
import { createRequestBudget } from '../capture/policy.ts';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApiClient, jsonBodyOf } from './api-client.ts';
import {
  analyzeFolios,
  checkErrorResponses,
  checkFolioUnpredictability,
  checkIdentitySealing,
  checkIndistinguishableTracking,
  createReflectionMarker,
  decodeFolio,
  provokeErrors,
} from './conformance-checks.ts';
import type { ConformanceState } from './conformance-checks.ts';

describe('análisis de folios', () => {
  it('decodifica Base32 Crockford sin guiones', () => {
    expect(decodeFolio('0000-0000-0010')).toBe(32n);
    expect(decodeFolio('ÑÑ')).toBeNull();
  });

  it('marca como predecibles los folios con año y consecutivos', () => {
    const analysis = analyzeFolios(
      ['QJA-2026000001', 'QJA-2026000002'],
      new Date('2026-11-05T00:00:00Z'),
    );
    expect(analysis.isPredictable).toBe(true);
    expect(analysis.reasons.join(' ')).toContain('2026');
    expect(analysis.reasons.join(' ')).toContain('separados por solo');
  });

  it('acepta folios aleatorios sin prefijo común', () => {
    const analysis = analyzeFolios(
      ['7K3Q-9XZM-2P4D', 'H1WB-C6RT-YN8E', 'Q0FA-MV5J-K3SX'],
      new Date('2026-11-05T00:00:00Z'),
    );
    expect(analysis).toEqual({ isPredictable: false, reasons: [] });
  });
});

describe('contra el servidor de referencia', () => {
  let node: TestNode;
  beforeAll(async () => {
    node = await startReferenceNode();
  });
  afterAll(async () => {
    await node.close();
  });

  it('PRV-14, PRV-09, PRV-15 y API-02 cumplen', async () => {
    const client = createApiClient(node.url, createRequestBudget(100), 10_000);
    const state: ConformanceState = { folios: [] };
    const capture = sampleCapture({ resources: [] });
    const keysResponse = await fetch(new URL('/api/v1/keys', node.url));
    const keys = (await keysResponse.json()) as { authority: { boxPublicKey: string } };
    capture.resources.push(sampleScript(`const k="${keys.authority.boxPublicKey}"`));

    const sealing = await checkIdentitySealing(client, capture, state);
    expect(sealing.status, sealing.summary).toBe('cumple');
    expect(state.folios).toHaveLength(1);

    const folios = await checkFolioUnpredictability(client, state);
    expect(folios.status, folios.summary).toBe('cumple');
    expect(state.folios).toHaveLength(3);

    const tracking = await checkIndistinguishableTracking(client, state);
    expect(['cumple', 'advertencia']).toContain(tracking.status);
    expect(tracking.summary).not.toContain('permite saber');

    const marker = createReflectionMarker();
    await provokeErrors(client, marker);
    const errors = checkErrorResponses(client.exchanges(), marker);
    expect(errors.status, errors.summary).toBe('cumple');
  }, 60_000);

  it('PRV-14 advierte si la llave no está fijada en el código de la web', async () => {
    const client = createApiClient(node.url, createRequestBudget(100), 10_000);
    const check = await checkIdentitySealing(client, sampleCapture(), { folios: [] });
    expect(check.status).toBe('advertencia');
  }, 60_000);
});

describe('contra un nodo que incumple', () => {
  let node: TestNode;
  beforeAll(async () => {
    node = await startBadNode();
  });
  afterAll(async () => {
    await node.close();
  });

  it('PRV-14 no cumple con llaves sin formato', async () => {
    const client = createApiClient(node.url, createRequestBudget(100), 10_000);
    const check = await checkIdentitySealing(client, null, { folios: [] });
    expect(check.status).toBe('no_cumple');
  });

  it('PRV-15 no cumple si distingue folio inexistente de secreto equivocado', async () => {
    const client = createApiClient(node.url, createRequestBudget(100), 10_000);
    const check = await checkIndistinguishableTracking(client, { folios: [BAD_NODE_FOLIO] });
    expect(check.status).toBe('no_cumple');
    expect(check.summary).toContain('401');
  });

  it('PRV-15 no aplica sin un folio existente', async () => {
    const client = createApiClient(node.url, createRequestBudget(100), 10_000);
    expect((await checkIndistinguishableTracking(client, { folios: [] })).status).toBe('no_aplica');
  });

  it('API-02 no cumple con trazas, texto plano y reflejo de la entrada', async () => {
    const client = createApiClient(node.url, createRequestBudget(100), 10_000);
    const marker = createReflectionMarker();
    await provokeErrors(client, marker);
    const check = checkErrorResponses(client.exchanges(), marker);
    expect(check.status).toBe('no_cumple');
    const text = check.evidence.map((item) => item.description).join(' ');
    expect(text).toContain('traza de pila');
    expect(text).toContain('refleja la entrada');
  });

  it('el cliente respeta el tope de peticiones', async () => {
    const client = createApiClient(node.url, createRequestBudget(1), 10_000);
    await client.send({ purpose: 'uno', method: 'GET', path: '/api/v1/keys' });
    await expect(
      client.send({ purpose: 'dos', method: 'GET', path: '/api/v1/keys' }),
    ).rejects.toThrow('tope');
  });
});

describe('cliente de la API', () => {
  it('interpreta el JSON completo aunque el texto guardado se recorte a 64 KiB', async () => {
    const items = Array.from({ length: 5000 }, (_, index) => `elemento-${index}-xxxxxxxx`);
    const big = JSON.stringify({ items });
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(big);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const client = createApiClient(`http://127.0.0.1:${port}/`, createRequestBudget(5), 10_000);
    const exchange = await client.send({ purpose: 'grande', method: 'GET', path: '/x' });
    server.close();
    expect(big.length).toBeGreaterThan(64 * 1024);
    expect(exchange.bodyText.length).toBe(64 * 1024);
    expect((jsonBodyOf(exchange) as { items: string[] }).items).toHaveLength(5000);
  });
});
