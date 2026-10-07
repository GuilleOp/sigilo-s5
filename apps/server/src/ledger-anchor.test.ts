// Pruebas del anclaje: cabeza verificada, archivo diario, consistencia con el anclaje anterior y
// detección de una bitácora reescrita, leyendo de la base o de la API.
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { ROUTES } from '@sigilo/contracts';
import type { KeysFile } from '@sigilo/contracts';
import { computeEventHash, generateSigningKeyPair, toBase64Url } from '@sigilo/core';
import { readLedgerRows } from './test-support/ledger-rows.ts';
import { openDatabase } from './db/database.ts';
import {
  anchorLedger,
  apiAnchorSource,
  databaseAnchorSource,
  MISSING_DATABASE_MESSAGE,
  readLatestAnchor,
} from './ledger-anchor.ts';
import type { AnchorSource } from './ledger-anchor.ts';
import {
  buildComplaintRequest,
  createReporter,
  createTestServer,
  submitComplaint,
} from './test-support/harness.ts';
import type { TestServer } from './test-support/harness.ts';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

interface Deployment {
  server: TestServer;
  dataDir: string;
  anchorsDir: string;
}

/** Servidor con la base en disco y `keys.json` coherente con sus llaves. */
function deploy(): Deployment {
  const dataDir = mkdtempSync(join(tmpdir(), 'sigilo-anchor-'));
  directories.push(dataDir);
  const server = createTestServer({ db: openDatabase(join(dataDir, 'sigilo.db')) });
  const keysFile: KeysFile = {
    version: 1,
    publicKeys: server.keys.publicKeySet,
    server: { signingPrivateKey: toBase64Url(server.keys.serverSigningPrivateKey) },
  };
  writeFileSync(join(dataDir, 'keys.json'), JSON.stringify(keysFile));
  return { server, dataDir, anchorsDir: join(dataDir, 'anchors') };
}

async function submitSome(server: TestServer, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const request = await buildComplaintRequest(server, {
      mode: 'anonymous',
      reporter: createReporter(),
    });
    await submitComplaint(server, request);
  }
}

/** El servidor publica los días cerrados en su primera consulta pública del día. */
async function publishAt(server: TestServer, date: Date): Promise<void> {
  await server.advanceTo(date);
  await server.app.request(ROUTES.ledgerHead);
}

async function anchorOn(deployment: Deployment, date: Date, source?: AnchorSource) {
  const now = () => date;
  if (source === undefined) await publishAt(deployment.server, date);
  const used = source ?? databaseAnchorSource(deployment.dataDir, now);
  try {
    return await anchorLedger({
      source: used,
      serverPublicKey: deployment.server.serverPublicKey,
      anchorsDir: deployment.anchorsDir,
      now,
    });
  } finally {
    used.close();
  }
}

describe('anchorLedger', () => {
  it('escribe un archivo por día con la cabeza pública firmada', async () => {
    const deployment = deploy();
    await submitSome(deployment.server, 2);
    const first = await anchorOn(deployment, new Date('2026-10-21T08:00:00Z'));
    expect(first.created).toBe(true);
    expect(first.path.endsWith('2026-10-21.json')).toBe(true);
    expect(first.anchor).toMatchObject({ version: 1, anchoredOn: '2026-10-21', head: { seq: 1 } });
    expect(readLatestAnchor(deployment.anchorsDir)).toEqual(first.anchor);
    // Repetir el mismo día no cambia nada.
    const again = await anchorOn(deployment, new Date('2026-10-21T20:00:00Z'));
    expect(again.created).toBe(false);

    await deployment.server.advanceTo(new Date('2026-10-21T09:00:00Z'));
    await submitSome(deployment.server, 1);
    const next = await anchorOn(deployment, new Date('2026-10-22T08:00:00Z'));
    expect(next.anchor.head.seq).toBe(2);
    expect(readdirSync(deployment.anchorsDir).sort()).toEqual([
      '2026-10-21.json',
      '2026-10-22.json',
    ]);
  });

  it('detecta una bitácora reescrita que ya no contiene el anclaje anterior', async () => {
    const deployment = deploy();
    await submitSome(deployment.server, 2);
    await anchorOn(deployment, new Date('2026-10-21T08:00:00Z'));
    // Un operador con acceso a la base reescribe un evento ya anclado.
    const db = new DatabaseSync(join(deployment.dataDir, 'sigilo.db'));
    db.exec('DROP TRIGGER ledger_events_no_update;');
    db.prepare('UPDATE ledger_events SET hash = ? WHERE seq = 1').run('e'.repeat(64));
    db.close();
    await expect(anchorOn(deployment, new Date('2026-10-22T08:00:00Z'))).rejects.toThrow(
      'posible reescritura',
    );
  });

  it('rechaza una cabeza firmada por otra llave', async () => {
    const deployment = deploy();
    const now = () => new Date('2026-10-21T08:00:00Z');
    const source = databaseAnchorSource(deployment.dataDir, now);
    await expect(
      anchorLedger({
        source,
        serverPublicKey: generateSigningKeyPair().publicKey,
        anchorsDir: deployment.anchorsDir,
        now,
      }),
    ).rejects.toThrow('llave fijada');
    source.close();
  });

  it('lee la cabeza y los eventos de la API pública', async () => {
    const deployment = deploy();
    const { server } = deployment;
    await submitSome(server, 2);
    await anchorOn(deployment, new Date('2026-10-21T08:00:00Z'));
    await server.advanceTo(new Date('2026-10-22T08:00:00Z'));
    const fetcher: typeof fetch = async (input) => server.app.request(String(input));
    const result = await anchorOn(
      deployment,
      new Date('2026-10-22T08:00:00Z'),
      apiAnchorSource('http://127.0.0.1:8787', fetcher),
    );
    expect(result.anchor.head.seq).toBe(1);
    expect(result.path.endsWith('2026-10-22.json')).toBe(true);
  });

  it('recalcula los hashes: rechaza un evento posterior al anclaje alterado sin recalcular', async () => {
    const deployment = deploy();
    await submitSome(deployment.server, 1);
    await anchorOn(deployment, new Date('2026-10-21T08:00:00Z'));
    await deployment.server.advanceTo(new Date('2026-10-21T09:00:00Z'));
    await submitSome(deployment.server, 2);
    await publishAt(deployment.server, new Date('2026-10-22T08:00:00Z'));
    // Se cambia el contenido del último evento, conservando su hash almacenado (el de la cabeza).
    const db = new DatabaseSync(join(deployment.dataDir, 'sigilo.db'));
    db.exec('DROP TRIGGER ledger_events_no_update;');
    db.prepare('UPDATE ledger_events SET payload_digest = ? WHERE seq = 2').run('f'.repeat(64));
    db.close();
    await expect(anchorOn(deployment, new Date('2026-10-22T08:00:00Z'))).rejects.toThrow(
      'posible reescritura',
    );
  });

  it('rechaza una cadena reescrita con hashes recalculados desde el anclaje', async () => {
    const deployment = deploy();
    await submitSome(deployment.server, 2);
    await anchorOn(deployment, new Date('2026-10-21T08:00:00Z'));
    const db = new DatabaseSync(join(deployment.dataDir, 'sigilo.db'));
    db.exec('DROP TRIGGER ledger_events_no_update;');
    // Quien controla la base reescribe el evento anclado y recalcula su hash: ya no coincide.
    const [first, second] = readLedgerRows(db);
    if (first === undefined || second === undefined) throw new Error('Faltan eventos.');
    const forged = { ...second, payloadDigest: 'a'.repeat(64) };
    db.prepare('UPDATE ledger_events SET payload_digest = ?, hash = ? WHERE seq = ?').run(
      forged.payloadDigest,
      computeEventHash(forged),
      second.seq,
    );
    db.close();
    await expect(anchorOn(deployment, new Date('2026-10-22T08:00:00Z'))).rejects.toThrow(
      'el evento anclado cambió',
    );
  });

  it('sin anclaje previo verifica la cadena completa desde el génesis', async () => {
    const deployment = deploy();
    await submitSome(deployment.server, 3);
    await publishAt(deployment.server, new Date('2026-10-21T08:00:00Z'));
    const db = new DatabaseSync(join(deployment.dataDir, 'sigilo.db'));
    db.exec('DROP TRIGGER ledger_events_no_update;');
    db.prepare('UPDATE ledger_events SET at = ? WHERE seq = 0').run('2026-10-19');
    db.close();
    await expect(anchorOn(deployment, new Date('2026-10-21T08:00:00Z'))).rejects.toThrow(
      'no es íntegra',
    );
  });

  it('da un mensaje claro si la base local no existe y crea el directorio de anclajes', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'sigilo-anchor-'));
    directories.push(dataDir);
    expect(() => databaseAnchorSource(dataDir, () => new Date())).toThrow(MISSING_DATABASE_MESSAGE);
    const deployment = deploy();
    const nested = join(deployment.anchorsDir, 'nuevo');
    const now = () => new Date('2026-10-21T08:00:00Z');
    const source = databaseAnchorSource(deployment.dataDir, now);
    try {
      const result = await anchorLedger({
        source,
        serverPublicKey: deployment.server.serverPublicKey,
        anchorsDir: nested,
        now,
      });
      expect(result.created).toBe(true);
      expect(readdirSync(nested)).toEqual(['2026-10-21.json']);
    } finally {
      source.close();
    }
  });
});
