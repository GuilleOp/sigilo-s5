// Prueba de extremo a extremo del escenario (docs/demo-escenario.md): Marta y Luis sobre el mismo
// ocid ficticio dan 2 personas independientes; las 3 denuncias del atacante dan 1 con marca de
// posible campaña; el evaluador no guarda nada que permita recuperar el identificador y el índice
// no puede distinguir a quién se acusa.
import { existsSync, readFileSync } from 'node:fs';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  CORROBORATION_ROUTES,
  EvaluationCountsPageSchema,
  IndexNoticesPageSchema,
} from '@sigilo/contracts';
import type { CorroborationStatus } from '@sigilo/contracts';
import { fromBase64Url, toHex, utf8Encode } from '@sigilo/core';
import {
  corroborationInput,
  corroborationLabel,
  generateEvaluatorKeyPair,
  normalizeIdentifier,
  signNoticesRequest,
  verifyEvaluationCount,
} from '@sigilo/corroboracion';
import type { CorroborationIdentifier, CorroborationKeys } from '@sigilo/corroboracion';
import { DEMO_CASES, DEMO_HONEST_DIRECTOR, DEMO_OCID } from '@sigilo/corroboracion/demo';
import { ristretto255_oprf } from '@noble/curves/ed25519.js';
import { readInteger, readText } from './database.ts';
import {
  corroborateInBrowser,
  createTestCorroboration,
  postJson,
  confirmFromNode,
  registerFromNode,
} from './test-support.ts';

const FOLIOS: Record<string, string> = {
  'case.marta': 'K7Q2-M9XP-4RT1',
  'case.attack-1': 'A7Q2-M9XP-4RT2',
  'case.attack-2': 'B7Q2-M9XP-4RT3',
  'case.attack-3': 'C7Q2-M9XP-4RT4',
  'case.luis': 'D7Q2-M9XP-4RT5',
};

function plusMinutes(tenMinute: string, minutes: number): string {
  return new Date(Date.parse(tenMinute) + minutes * 60_000).toISOString();
}

/** Bytes de la base y de sus archivos WAL y SHM, si existen. */
function databaseBytes(path: string): Buffer {
  return Buffer.concat(
    [path, `${path}-wal`, `${path}-shm`]
      .filter((file) => existsSync(file))
      .map((file) => readFileSync(file)),
  );
}

/** Formas en que un valor podría aparecer en disco: texto, hexadecimal, Base64URL y bytes. */
function forms(bytes: Uint8Array): Buffer[] {
  const raw = Buffer.from(bytes);
  return [raw, Buffer.from(toHex(bytes)), Buffer.from(raw.toString('base64url'))];
}

describe('escenario de corroboración ciega', () => {
  const services = createTestCorroboration({ requireConfirmation: true });
  const results = new Map<
    string,
    { keys: CorroborationKeys; status: CorroborationStatus; sentToEvaluator: string[] }
  >();
  const nodeBodies: string[] = [];

  beforeAll(async () => {
    for (const item of DEMO_CASES) {
      services.clock.set(plusMinutes(item.receivedAt, 5));
      const browser = await corroborateInBrowser(services, item.identifier, item.narrative);
      const registered = await registerFromNode(services, item, FOLIOS[item.key] ?? '', browser);
      expect(registered.response.status, item.key).toBe(200);
      if (registered.status === null) throw new Error('Sin estado.');
      nodeBodies.push(registered.body);
      let status = registered.status;
      // Las autoridades aceptan las denuncias de Marta y de Luis; las del atacante siguen sin
      // aceptar (el nodo las confirmaría o las daría de baja después).
      if (item.key === 'case.marta' || item.key === 'case.luis') {
        expect(status.isRevealed).toBe(false);
        const confirmed = await confirmFromNode(services, 'node.federal', FOLIOS[item.key] ?? '');
        if (confirmed.status === null) throw new Error('Sin confirmación.');
        status = confirmed.status;
      }
      results.set(item.key, {
        keys: browser.keys,
        status,
        sentToEvaluator: browser.sentToEvaluator,
      });
    }
  });

  const result = (key: string) => {
    const found = results.get(key);
    if (found === undefined) throw new Error(`Falta ${key}.`);
    return found;
  };

  it('Marta y Luis sobre el mismo ocid ficticio cuentan como 2 personas independientes', () => {
    expect(result('case.marta').keys.tag).toBe(result('case.luis').keys.tag);
    const luis = result('case.luis').status;
    expect(luis.complaints).toBe(2);
    expect(luis.independentSources).toBe(2);
    expect(luis.sameOriginCount).toBe(1);
    expect(luis.flags).toEqual([]);
    expect(result('case.marta').status.groupId).toBe(luis.groupId);
  });

  it('las 3 denuncias del atacante cuentan como 1 fuente, con marca de posible campaña', () => {
    const tags = new Set(
      ['case.attack-1', 'case.attack-2', 'case.attack-3'].map((key) => result(key).keys.tag),
    );
    expect(tags.size).toBe(1);
    expect(tags.has(result('case.marta').keys.tag)).toBe(false);
    const third = result('case.attack-3').status;
    expect(third.complaints).toBe(3);
    expect(third.independentSources).toBe(1);
    expect(third.sameOriginCount).toBe(3);
    expect(third.flags).toEqual(['possible_same_origin', 'possible_campaign']);
    expect(third.signals).toEqual(expect.arrayContaining(['similar_text', 'burst']));
  });

  it('avisa al nodo de Marta que su grupo subió a 2 fuentes, sin decir qué otro folio fue', async () => {
    services.clock.set('2026-11-12T16:40:00Z');
    const request = signNoticesRequest(
      { nodeId: 'node.federal', after: 0, requestedAt: '2026-11-12T16:40Z' },
      services.network.nodes['node.federal'].signing.privateKey,
    );
    const response = await postJson(services.indexApp, CORROBORATION_ROUTES.indexNotices, request);
    expect(response.status).toBe(200);
    const page = IndexNoticesPageSchema.parse(await response.json());
    const martaDigest = result('case.marta').status.folioDigest;
    const forMarta = page.notices.filter((notice) => notice.status.folioDigest === martaDigest);
    expect(forMarta.at(-1)?.status.independentSources).toBe(2);
    const text = JSON.stringify(page);
    expect(text).not.toContain(result('case.luis').status.folioDigest);
    expect(text).not.toContain('node.');
  });

  it('el evaluador no guarda nada que permita recuperar el identificador', () => {
    const tables = services.evaluatorDb
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => readText(row, 'name'));
    expect(tables).toEqual(['evaluation_counts', 'spent_challenges']);
    const total = services.evaluatorDb
      .prepare('SELECT SUM(evaluations) AS total FROM evaluation_counts')
      .get();
    expect(total === undefined ? 0 : readInteger(total, 'total')).toBe(DEMO_CASES.length);

    services.evaluatorDb.exec('PRAGMA wal_checkpoint(PASSIVE);');
    const disk = databaseBytes(services.evaluatorDbPath);
    const secrets: Buffer[] = [];
    for (const item of DEMO_CASES) {
      const { keys, sentToEvaluator } = result(item.key);
      const request = JSON.parse(sentToEvaluator[1] ?? '{}') as { blinded: string };
      secrets.push(...forms(fromBase64Url(request.blinded)));
      secrets.push(...forms(fromHexBytes(keys.tag)), ...forms(keys.similarityKey));
      secrets.push(Buffer.from(corroborationLabel(item.identifier)));
      secrets.push(Buffer.from(normalizeIdentifier(item.identifier)));
    }
    secrets.push(Buffer.from('IFFE'), Buffer.from('FICTICIO'), Buffer.from('VE-PROGRAMAS'));
    for (const secret of secrets) expect(disk.includes(secret)).toBe(false);
  });

  it('el índice solo ve etiquetas: no hay identificadores en su base ni en lo que recibe', () => {
    services.indexDb.exec('PRAGMA wal_checkpoint(PASSIVE);');
    const disk = databaseBytes(services.indexDbPath);
    const received = Buffer.from(nodeBodies.join('\n'));
    for (const text of ['IFFE', 'iffe', 'FICTICIO', 'Ficticio', 'VE-PROGRAMAS', 'ocds', 'OCDS']) {
      expect(disk.includes(Buffer.from(text)), text).toBe(false);
      expect(received.includes(Buffer.from(text)), text).toBe(false);
    }
    for (const folio of Object.values(FOLIOS)) {
      expect(disk.includes(Buffer.from(folio))).toBe(false);
    }
  });

  it('el índice no puede distinguir a quién se acusa con un diccionario sin la llave', () => {
    const tags = new Set(
      services.indexDb
        .prepare('SELECT DISTINCT tag FROM registrations')
        .all()
        .map((row) => readText(row, 'tag')),
    );
    expect(tags.size).toBe(2);
    // Diccionario de la lista pública: incluye a las dos personas e identificadores realmente
    // denunciados, con todas las derivaciones que no requieren al evaluador.
    const candidates: CorroborationIdentifier[] = [
      { kind: 'ocid', ocid: DEMO_OCID },
      DEMO_HONEST_DIRECTOR,
      { kind: 'ocid', ocid: 'ocds-fict00-DFPS-LP-2026-0007' },
      { kind: 'servidor', name: 'Servidor Ficticio Uno', entityId: 'VE-INSTITUTO' },
    ];
    const rogue = generateEvaluatorKeyPair();
    for (const candidate of candidates) {
      const input = corroborationInput(candidate);
      const guesses = [
        toHex(sha256(input)),
        toHex(sha256(utf8Encode(normalizeIdentifier(candidate)))),
        toHex(
          hkdf(sha256, input, new Uint8Array(0), utf8Encode('sigilo/v1/corroboration/tag'), 32),
        ),
      ];
      // Ni siquiera con un evaluador propio: la salida depende de la llave privada del evaluador.
      const blind = ristretto255_oprf.voprf.blind(input);
      const evaluation = ristretto255_oprf.voprf.blindEvaluate(
        rogue.secretKey,
        rogue.publicKey,
        blind.blinded,
      );
      const output = ristretto255_oprf.voprf.finalize(
        input,
        blind.blind,
        evaluation.evaluated,
        blind.blinded,
        rogue.publicKey,
        evaluation.proof,
      );
      guesses.push(
        toHex(
          hkdf(sha256, output, new Uint8Array(0), utf8Encode('sigilo/v1/corroboration/tag'), 32),
        ),
      );
      for (const guess of guesses) expect(tags.has(guess)).toBe(false);
    }
  });

  it('la consulta dirigida solo es posible en línea contra el evaluador y queda en su conteo', async () => {
    // Quien ve etiquetas y adivina un nombre puede preguntarle al evaluador (riesgo del ADR 0006);
    // cada pregunta exige prueba de trabajo y suma al conteo diario publicado.
    services.clock.set('2026-11-13T09:00:00Z');
    const probe = await corroborateInBrowser(services, { kind: 'ocid', ocid: DEMO_OCID }, '');
    expect(probe.keys.tag).toBe(result('case.marta').keys.tag);
    services.clock.set('2026-11-14T09:00:00Z');
    const response = await services.evaluatorApp.request(
      `${CORROBORATION_ROUTES.evaluationCounts}?from=2026-11-09`,
    );
    const page = EvaluationCountsPageSchema.parse(await response.json());
    expect(page.counts.map((count) => [count.day, count.evaluations])).toEqual([
      ['2026-11-09', 1],
      ['2026-11-10', 0],
      ['2026-11-11', 3],
      ['2026-11-12', 1],
      ['2026-11-13', 1],
    ]);
    for (const count of page.counts) {
      expect(verifyEvaluationCount(count, services.evaluatorKey)).toBe(true);
    }
  });
});

function fromHexBytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}
