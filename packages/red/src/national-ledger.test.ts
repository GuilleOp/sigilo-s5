// Pruebas de la bitácora nacional: cadena, cabeza cofirmada m de n, inclusión de una cabeza de
// nodo y lo que comprueba un testigo antes de cofirmar.
import { describe, expect, it } from 'vitest';
import { LEDGER_GENESIS_HASH } from '@sigilo/contracts';
import type { NationalHead, NationalLedgerEntry, SignedLedgerHead } from '@sigilo/contracts';
import { keyIdFor, signLedgerHead } from '@sigilo/core';
import { demoWitnessPrivateKey } from './demo-network.ts';
import {
  buildDirectoryEntry,
  buildNodeHeadEntry,
  compareNodeHeads,
  computeNationalEntryHash,
  cosignNationalHead,
  isValidNationalCosignature,
  signNationalHead,
  verifyNationalChain,
  verifyNationalExtension,
  verifyNationalHead,
  verifyNodeHeadInclusion,
  verifyNodeHeadSignature,
} from './national-ledger.ts';
import { findNode } from './directory.ts';
import { FIXTURE_DAY, createNetworkFixture } from './test-fixtures.ts';

const fixture = createNetworkFixture();
const { keys, signed, trust } = fixture;

function nodeHead(nodeId: 'node.queretaro' | 'node.federal', seq: number, hash: string) {
  const privateKey = keys.nodes[nodeId].signing.privateKey;
  return signLedgerHead(
    { seq, hash, at: FIXTURE_DAY, serverKeyId: keyIdFor(keys.nodes[nodeId].signing.publicKey) },
    privateKey,
  );
}

function buildLedger(): NationalLedgerEntry[] {
  const entries: NationalLedgerEntry[] = [];
  const push = (make: (previous: NationalLedgerEntry | null) => NationalLedgerEntry) =>
    entries.push(make(entries.at(-1) ?? null));
  push((previous) => buildDirectoryEntry(previous, signed, FIXTURE_DAY));
  push((previous) =>
    buildNodeHeadEntry(
      previous,
      'node.queretaro',
      nodeHead('node.queretaro', 0, LEDGER_GENESIS_HASH),
      FIXTURE_DAY,
    ),
  );
  push((previous) =>
    buildNodeHeadEntry(
      previous,
      'node.federal',
      nodeHead('node.federal', 4, 'a'.repeat(64)),
      FIXTURE_DAY,
    ),
  );
  push((previous) =>
    buildNodeHeadEntry(
      previous,
      'node.queretaro',
      nodeHead('node.queretaro', 2, 'b'.repeat(64)),
      '2026-11-10',
    ),
  );
  return entries;
}

function headFor(entries: readonly NationalLedgerEntry[]): NationalHead {
  const last = entries.at(-1);
  if (last === undefined) throw new Error('sin entradas');
  return {
    v: 1,
    seq: last.seq,
    hash: last.hash,
    at: last.at,
    directorySerial: 1,
    operatorKeyId: trust.operatorKeyId,
  };
}

function cosigned(head: NationalHead, witnessIds: readonly string[]) {
  const result = signNationalHead(head, keys.operator.privateKey);
  for (const id of witnessIds) {
    result.cosignatures.push(cosignNationalHead(head, id, demoWitnessPrivateKey(keys, id)));
  }
  return result;
}

describe('bitácora nacional', () => {
  it('encadena entradas y detecta un eslabón alterado', () => {
    const entries = buildLedger();
    expect(verifyNationalChain(entries)).toEqual({ valid: true });
    const tampered = structuredClone(entries);
    const entry = tampered[2];
    if (entry?.type !== 'node.head') throw new Error('entrada inesperada');
    entry.nodeHead.seq = 5;
    expect(verifyNationalChain(tampered)).toMatchObject({ valid: false, reason: 'hash' });
    entry.hash = computeNationalEntryHash(entry);
    expect(verifyNationalChain(tampered)).toMatchObject({ valid: false, reason: 'link' });
    expect(() =>
      buildNodeHeadEntry(
        entries.at(-1) ?? null,
        'node.federal',
        nodeHead('node.federal', 5, 'c'.repeat(64)),
        '2026-11-01',
      ),
    ).toThrow();
  });

  it('la cabeza nacional vale con 2 de 3 testigos y no con 1', () => {
    const head = headFor(buildLedger());
    expect(
      verifyNationalHead(cosigned(head, ['observer.cpc-queretaro', 'node.queretaro']), trust),
    ).toMatchObject({ valid: true });
    expect(verifyNationalHead(cosigned(head, ['observer.cpc-queretaro']), trust)).toEqual({
      valid: false,
      reason: 'witnesses',
    });
    const forged = cosigned(head, ['observer.cpc-queretaro', 'node.queretaro']);
    forged.head.seq += 1;
    expect(verifyNationalHead(forged, trust)).toEqual({ valid: false, reason: 'operator' });
    const cosignature = cosignNationalHead(
      head,
      'observer.university-ejemplo',
      demoWitnessPrivateKey(keys, 'observer.university-ejemplo'),
    );
    expect(isValidNationalCosignature(head, cosignature, trust)).toBe(true);
    expect(isValidNationalCosignature({ ...head, seq: 0 }, cosignature, trust)).toBe(false);
  });

  it('prueba que la cabeza de un nodo está incluida', () => {
    const entries = buildLedger();
    const head = cosigned(headFor(entries), [
      'observer.cpc-queretaro',
      'observer.university-ejemplo',
    ]);
    const entry = entries[2];
    if (entry?.type !== 'node.head') throw new Error('entrada inesperada');
    const expected = { nodeId: 'node.federal', seq: 4, hash: 'a'.repeat(64) };
    const proof = { entry, chain: entries.slice(2), head };
    expect(verifyNodeHeadInclusion(proof, trust, expected)).toEqual({
      valid: true,
      nationalSeq: 2,
    });
    expect(verifyNodeHeadInclusion(proof, trust, { ...expected, seq: 5 })).toEqual({
      valid: false,
      reason: 'entry',
    });
    expect(
      verifyNodeHeadInclusion({ ...proof, chain: [entry, ...entries.slice(4)] }, trust, expected),
    ).toEqual({ valid: false, reason: 'head-mismatch' });
    const gap = [entry, entries[3], entries[3]];
    expect(verifyNodeHeadInclusion({ ...proof, chain: gap }, trust, expected)).toEqual({
      valid: false,
      reason: 'chain',
    });
    const weak = cosigned(headFor(entries), ['observer.cpc-queretaro']);
    expect(verifyNodeHeadInclusion({ ...proof, head: weak }, trust, expected)).toEqual({
      valid: false,
      reason: 'head',
    });
  });

  it('el testigo cofirma solo si la bitácora creció y las cabezas de nodo son válidas', () => {
    const entries = buildLedger();
    const pending = cosigned(headFor(entries), []);
    const initial = { lastEntry: null, nodeHeads: {}, directorySerial: 0 };
    const first = verifyNationalExtension(
      initial,
      entries.slice(0, 4),
      pending,
      signed.directory,
      trust,
    );
    expect(first.valid).toBe(true);
    if (!first.valid) return;
    expect(first.state.lastEntry?.seq).toBe(3);
    // Una reescritura de la historia ya cofirmada no se acepta.
    const rewritten = [buildDirectoryEntry(null, signed, FIXTURE_DAY)];
    const fake = cosigned(headFor(rewritten), []);
    expect(verifyNationalExtension(first.state, rewritten, fake, signed.directory, trust)).toEqual({
      valid: false,
      reason: 'regression',
    });
    // Una cabeza de nodo que retrocede, o firmada por otra llave, tampoco.
    const back = [
      ...entries,
      buildNodeHeadEntry(
        entries.at(-1) ?? null,
        'node.queretaro',
        nodeHead('node.queretaro', 1, 'd'.repeat(64)),
        '2026-11-10',
      ),
    ];
    expect(
      verifyNationalExtension(
        first.state,
        back.slice(3),
        cosigned(headFor(back), []),
        signed.directory,
        trust,
      ),
    ).toEqual({ valid: false, reason: 'node-history' });
    const otherKey: SignedLedgerHead = signLedgerHead(
      {
        seq: 9,
        hash: 'e'.repeat(64),
        at: '2026-11-10',
        serverKeyId: keyIdFor(keys.operator.publicKey),
      },
      keys.operator.privateKey,
    );
    const alien = [
      ...entries,
      buildNodeHeadEntry(entries.at(-1) ?? null, 'node.federal', otherKey, '2026-11-10'),
    ];
    expect(
      verifyNationalExtension(
        first.state,
        alien.slice(3),
        cosigned(headFor(alien), []),
        signed.directory,
        trust,
      ),
    ).toEqual({ valid: false, reason: 'node-head' });
  });

  it('compara cabezas de nodo y verifica su firma con el directorio', () => {
    const genesis = nodeHead('node.queretaro', 0, LEDGER_GENESIS_HASH);
    const first = nodeHead('node.queretaro', 0, 'f'.repeat(64));
    const later = nodeHead('node.queretaro', 3, 'a'.repeat(64));
    expect(compareNodeHeads(null, genesis)).toBe('new');
    expect(compareNodeHeads(genesis, first)).toBe('new');
    expect(compareNodeHeads(first, first)).toBe('unchanged');
    expect(compareNodeHeads(later, first)).toBe('rollback');
    expect(compareNodeHeads(later, nodeHead('node.queretaro', 3, 'b'.repeat(64)))).toBe('fork');
    const node = findNode(signed.directory, 'node.queretaro');
    const federal = findNode(signed.directory, 'node.federal');
    if (node === undefined || federal === undefined) throw new Error('sin nodos');
    expect(verifyNodeHeadSignature(first, node)).toBe(true);
    expect(verifyNodeHeadSignature(first, federal)).toBe(false);
  });
});
