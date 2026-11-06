// Pruebas del arranque del enrutador: configuración, archivos de llaves, verificación del
// directorio contra la raíz fijada y contra la versión guardada, y reenvío TCP del contenedor.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { keyIdFor, toBase64Url } from '@sigilo/core';
import { cosignDirectory, demoWitnessPrivateKey, signDirectory } from '@sigilo/red';
import { loadRouterConfig, loadRouterFiles, parseNodeUrls } from './config.ts';
import { createLoopbackProxy } from './container/loopback-proxy.ts';
import { openRouterDatabase } from './database.ts';
import { loadDirectoryStore } from './directory-store.ts';
import { createNationalLedgerService } from './national-ledger-service.ts';
import { TEST_DAY, createTestNetwork } from './test-support.ts';

describe('configuración', () => {
  it('lee los valores por omisión y las direcciones internas de los nodos', () => {
    const config = loadRouterConfig({});
    expect(config).toMatchObject({ host: '127.0.0.1', port: 8790, collectIntervalSeconds: 600 });
    expect(
      parseNodeUrls(
        'node.queretaro=http://nodo-queretaro:8080, node.federal=http://nodo-federal:8080',
      ),
    ).toEqual({
      'node.queretaro': 'http://nodo-queretaro:8080',
      'node.federal': 'http://nodo-federal:8080',
    });
  });

  it('rechaza valores inválidos', () => {
    expect(() => parseNodeUrls('nodo=http://x')).toThrow();
    expect(() => parseNodeUrls('node.a=ftp://x')).toThrow();
    expect(() => loadRouterConfig({ SIGILO_ROUTER_PORT: '99999' })).toThrow();
    expect(() => loadRouterConfig({ SIGILO_ROUTER_HOST: '192.0.2.1' })).toThrow();
    expect(() => loadRouterConfig({ SIGILO_ROUTER_COLLECT_INTERVAL_SECONDS: '0' })).toThrow();
  });

  it('lee los archivos del directorio de datos y comprueba la llave de la operación', () => {
    const network = createTestNetwork();
    const dir = mkdtempSync(join(tmpdir(), 'sigilo-enrutador-datos-'));
    expect(() => loadRouterFiles(dir)).toThrow(/red:demo/u);
    writeFileSync(join(dir, 'directory.json'), JSON.stringify(network.signed));
    writeFileSync(join(dir, 'trust.json'), JSON.stringify(network.trust));
    const keyFile = {
      version: 1,
      keyId: keyIdFor(network.keys.operator.publicKey),
      signingPrivateKey: toBase64Url(network.keys.operator.privateKey),
    };
    writeFileSync(join(dir, 'operator-key.json'), JSON.stringify(keyFile));
    expect(loadRouterFiles(dir).directory.digest).toBe(network.signed.digest);
    writeFileSync(
      join(dir, 'operator-key.json'),
      JSON.stringify({ ...keyFile, keyId: '0'.repeat(16) }),
    );
    expect(() => loadRouterFiles(dir)).toThrow(/no corresponde/u);
  });
});

describe('directorio al arrancar', () => {
  it('lo guarda una vez, acepta la versión siguiente cofirmada y rechaza alteraciones o retrocesos', () => {
    const network = createTestNetwork();
    const db = openRouterDatabase(':memory:');
    const national = createNationalLedgerService({
      db,
      operatorPrivateKey: network.keys.operator.privateKey,
    });
    loadDirectoryStore(db, network.signed, network.trust, national, TEST_DAY);
    loadDirectoryStore(db, network.signed, network.trust, national, TEST_DAY);
    expect(national.entries(0, 10)).toHaveLength(1);
    const unsigned = signDirectory(
      { ...network.signed.directory, serial: 2, previousDigest: network.signed.digest },
      network.keys.operator.privateKey,
    );
    expect(() => loadDirectoryStore(db, unsigned, network.trust, national, TEST_DAY)).toThrow(
      /witnesses/u,
    );
    let next = unsigned;
    for (const id of ['observer.cpc-queretaro', 'node.queretaro']) {
      next = cosignDirectory(next, id, demoWitnessPrivateKey(network.keys, id));
    }
    const store = loadDirectoryStore(db, next, network.trust, national, TEST_DAY);
    expect(store.directory().serial).toBe(2);
    expect(national.entries(0, 10).map((entry) => entry.type)).toEqual([
      'directory.version',
      'directory.version',
    ]);
    expect(() => loadDirectoryStore(db, network.signed, network.trust, national, TEST_DAY)).toThrow(
      /retrocede/u,
    );
  });

  it('no arranca con un directorio sin cofirmas suficientes', () => {
    const network = createTestNetwork();
    const db = openRouterDatabase(':memory:');
    const national = createNationalLedgerService({
      db,
      operatorPrivateKey: network.keys.operator.privateKey,
    });
    const weak = {
      ...network.signed,
      witnessSignatures: network.signed.witnessSignatures.slice(0, 1),
    };
    expect(() => loadDirectoryStore(db, weak, network.trust, national, TEST_DAY)).toThrow(
      /witnesses/u,
    );
  });
});

describe('reenvío TCP del contenedor', () => {
  it('publica el puerto local del servidor sin alterar las respuestas', async () => {
    const upstream = createServer((_request, response) => response.end('hola desde el nodo'));
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const proxy = createLoopbackProxy((upstream.address() as AddressInfo).port);
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${(proxy.address() as AddressInfo).port}/`);
      expect(await response.text()).toBe('hola desde el nodo');
    } finally {
      await new Promise((resolve) => proxy.close(resolve));
      await new Promise((resolve) => upstream.close(resolve));
    }
  });
});
