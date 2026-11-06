// Pruebas de la sonda de borradores (PRV-10 conformidad) con un sitio local que guarda lo escrito
// más allá de los primeros 2000 caracteres y repartido en IndexedDB.
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequestBudget } from '../capture/policy.ts';
import { TEST_HOST_RULES } from '../test-support/fixture-sites.ts';
import { probeDraftStorage } from './draft-probe.ts';

const PAGE = `<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><title>Borrador</title>
<script src="/guarda.js"></script></head><body><form><textarea name="hechos"></textarea></form></body></html>`;

/** Guarda lo escrito tras 3000 caracteres de relleno y en IndexedDB, para probar el recorte. */
const SCRIPT = `document.addEventListener('input', (evento) => {
  const valor = evento.target.value;
  localStorage.setItem('relleno', 'x'.repeat(3000) + valor);
  const abrir = indexedDB.open('borradores', 1);
  abrir.onupgradeneeded = () => abrir.result.createObjectStore('pasos', { autoIncrement: true });
  abrir.onsuccess = () => {
    const tienda = abrir.result.transaction('pasos', 'readwrite').objectStore('pasos');
    for (let i = 0; i < 40; i += 1) tienda.add({ relleno: 'y'.repeat(100) });
    tienda.add({ texto: valor });
  };
});`;

let server: Server;
let url = '';

beforeAll(async () => {
  server = createServer((request, response) => {
    const isScript = (request.url ?? '').startsWith('/guarda.js');
    response.writeHead(200, {
      'Content-Type': isScript ? 'text/javascript' : 'text/html; charset=utf-8',
    });
    response.end(isScript ? SCRIPT : PAGE);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/formulario`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('probeDraftStorage', () => {
  it('encuentra la marca aunque esté después del recorte de 2000 caracteres', async () => {
    const check = await probeDraftStorage({
      formUrl: url,
      marker: 'MARCASINTETICA123',
      navigationTimeoutMs: 15_000,
      budget: createRequestBudget(50),
      hostResolverRules: TEST_HOST_RULES,
    });
    expect(check.status, check.summary).toBe('no_cumple');
    const areas = check.evidence.map((item) => item.description).join(' ');
    expect(areas).toContain('localStorage');
    expect(areas).toContain('indexedDB');
  }, 60_000);
});
