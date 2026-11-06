// Nodos de prueba del modo conformidad: el servidor de referencia en memoria (con una web mínima
// que fija la llave de la autoridad) y un nodo «malo» que filtra trazas y distingue los fallos.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { buildPublicKeySet, generateBoxKeyPair, generateSigningKeyPair } from '@sigilo/core';
import { createApp } from '../../../../apps/server/src/app.ts';
import { openDatabase } from '../../../../apps/server/src/db/database.ts';
import { createMemoryEvidenceStore } from '../../../../apps/server/src/storage/evidence-store.ts';
import type { ServerKeys } from '../../../../apps/server/src/keys-file.ts';

/** Llaves nuevas del despliegue de prueba. */
function generateServerKeys(): ServerKeys {
  const server = generateSigningKeyPair();
  const authorityBox = generateBoxKeyPair();
  const authoritySigning = generateSigningKeyPair();
  return {
    publicKeySet: buildPublicKeySet({
      serverSigningPublicKey: server.publicKey,
      authorityBoxPublicKey: authorityBox.publicKey,
      authoritySigningPublicKey: authoritySigning.publicKey,
    }),
    serverSigningPrivateKey: server.privateKey,
    authoritySigningPublicKey: authoritySigning.publicKey,
  };
}

/** Nodo levantado en 127.0.0.1. */
export interface TestNode {
  url: string;
  close(): Promise<void>;
}

/**
 * Servidor de referencia con base en memoria, prueba de trabajo de 4 bits y una web mínima cuyo
 * paquete contiene la llave pública de la autoridad (como hace `keys:generate` con la web real).
 */
export async function startReferenceNode(): Promise<TestNode> {
  const webDir = mkdtempSync(join(tmpdir(), 'sigilo-validador-web-'));
  const keys = generateServerKeys();
  const boxKey = keys.publicKeySet.authority.boxPublicKey;
  writeFileSync(
    join(webDir, 'index.html'),
    '<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><title>Referencia</title><script type="module" src="/app.js"></script></head><body><form><textarea name="hechos"></textarea><button type="button">Continuar</button></form></body></html>',
  );
  writeFileSync(join(webDir, 'app.js'), `export const PINNED = ${JSON.stringify(boxKey)};`);
  const db = openDatabase(':memory:');
  const app = createApp({
    db,
    keys,
    evidenceStore: createMemoryEvidenceStore(),
    now: () => new Date(),
    // El freno global no espera de verdad en las pruebas.
    sleep: async () => undefined,
    powBits: 4,
    webDistDir: webDir,
  });
  const server = await new Promise<ReturnType<typeof serve>>((resolve) => {
    const instance = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 }, () =>
      resolve(instance),
    );
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          db.close();
          rmSync(webDir, { recursive: true, force: true });
          resolve();
        });
      }),
  };
}

/** Folio que el nodo malo reconoce como existente. */
export const BAD_NODE_FOLIO = '0000-0000-0001';

/**
 * Nodo que incumple: llaves sin formato, errores en texto plano con traza y reflejo de la
 * entrada, y respuestas distintas para folio inexistente y secreto equivocado.
 */
export async function startBadNode(): Promise<TestNode> {
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
    });
    request.on('end', () => {
      const url = new URL(request.url ?? '/', 'http://local');
      if (url.pathname === '/api/v1/keys') {
        response.writeHead(200, {
          'Content-Type': 'application/json',
          'X-Powered-By': 'Sintetico',
        });
        response.end('{"llaves":"sin formato"}');
        return;
      }
      if (url.pathname === '/api/v1/tracking' && request.method === 'POST') {
        const isKnown = body.includes(BAD_NODE_FOLIO);
        response.writeHead(isKnown ? 401 : 404, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            error: {
              code: isKnown ? 'unauthorized' : 'not_found',
              message: isKnown ? 'Secreto incorrecto.' : 'El folio no existe.',
            },
          }),
        );
        return;
      }
      response.writeHead(500, { 'Content-Type': 'text/plain', 'X-Powered-By': 'Sintetico' });
      response.end(
        `TypeError: no se pudo procesar ${url.pathname}${url.search} ${body}\n    at handler (/home/app/server.js:10:5)`,
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
