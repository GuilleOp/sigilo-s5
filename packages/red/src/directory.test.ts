// Pruebas del directorio firmado: firma de la operación, cofirmas m de n, alteraciones y versiones.
import { describe, expect, it } from 'vitest';
import type { SignedAuthorityDirectory } from '@sigilo/contracts';
import { generateSigningKeyPair } from '@sigilo/core';
import {
  DIRECTORY_GENESIS_DIGEST,
  cosignDirectory,
  directoryDigest,
  directoryProblems,
  findAuthority,
  findNode,
  isAuthorityValidOn,
  signDirectory,
  trustAnchorFromDirectory,
  verifyDirectoryUpdate,
  verifySignedDirectory,
  witnessKeyOf,
} from './directory.ts';
import { DEMO_WITNESS_IDS, demoWitnessPrivateKey } from './demo-network.ts';
import { FIXTURE_DAY, createNetworkFixture } from './test-fixtures.ts';

function clone(signed: SignedAuthorityDirectory): SignedAuthorityDirectory {
  return structuredClone(signed);
}

describe('directorio firmado', () => {
  it('verifica con la raíz fijada cuando lo cofirman los tres testigos', () => {
    const { signed, trust } = createNetworkFixture();
    const result = verifySignedDirectory(signed, trust);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.witnesses).toEqual([...DEMO_WITNESS_IDS].sort());
  });

  it('vale con 2 de 3 testigos (uno apagado) y no con 1', () => {
    const two = createNetworkFixture(['observer.cpc-queretaro', 'node.queretaro']);
    expect(verifySignedDirectory(two.signed, two.trust).valid).toBe(true);
    const one = createNetworkFixture(['observer.cpc-queretaro']);
    expect(verifySignedDirectory(one.signed, one.trust)).toEqual({
      valid: false,
      reason: 'witnesses',
    });
  });

  it('rechaza un campo alterado aunque se recalcule el digesto', () => {
    const { signed, trust } = createNetworkFixture();
    const tampered = clone(signed);
    const authority = tampered.directory.authorities[0];
    if (authority === undefined) throw new Error('sin autoridades');
    authority.nodeId = 'node.queretaro';
    expect(verifySignedDirectory(tampered, trust)).toEqual({ valid: false, reason: 'digest' });
    tampered.digest = directoryDigest(tampered.directory);
    expect(verifySignedDirectory(tampered, trust)).toEqual({ valid: false, reason: 'operator' });
  });

  it('rechaza una llave de autoridad sustituida', () => {
    const { signed, trust } = createNetworkFixture();
    const tampered = clone(signed);
    const authority = tampered.directory.authorities[0];
    if (authority === undefined) throw new Error('sin autoridades');
    authority.signingPublicKey = 'A'.repeat(43);
    tampered.digest = directoryDigest(tampered.directory);
    expect(verifySignedDirectory(tampered, trust).valid).toBe(false);
  });

  it('no cuenta cofirmas repetidas, de desconocidos ni con otra llave', () => {
    const { signed, trust, keys } = createNetworkFixture(['observer.cpc-queretaro']);
    const repeated = clone(signed);
    const first = repeated.witnessSignatures[0];
    if (first === undefined) throw new Error('sin cofirmas');
    repeated.witnessSignatures.push({ ...first });
    expect(verifySignedDirectory(repeated, trust).valid).toBe(false);
    const forged = clone(signed);
    forged.witnessSignatures.push({ ...first, witnessId: 'observer.university-ejemplo' });
    expect(verifySignedDirectory(forged, trust).valid).toBe(false);
    expect(() =>
      cosignDirectory(signed, 'observer.university-ejemplo', keys.operator.privateKey),
    ).toThrow(/llave/u);
  });

  it('rechaza la firma de otra operación y un directorio mal formado', () => {
    const { signed, trust } = createNetworkFixture();
    const other = generateSigningKeyPair();
    expect(() => signDirectory(signed.directory, other.privateKey)).toThrow();
    expect(verifySignedDirectory({ directory: {} }, trust)).toEqual({
      valid: false,
      reason: 'malformed',
    });
    const otherTrust = { ...trust, operatorKeyId: '0'.repeat(16) };
    expect(verifySignedDirectory(signed, otherTrust)).toEqual({ valid: false, reason: 'trust' });
  });

  it('el testigo recalcula el digesto antes de cofirmar', () => {
    const { signed, keys } = createNetworkFixture([]);
    const lying = { ...clone(signed), digest: 'f'.repeat(64) };
    expect(() =>
      cosignDirectory(lying, 'node.queretaro', demoWitnessPrivateKey(keys, 'node.queretaro')),
    ).toThrow(/digesto/u);
    expect(() => cosignDirectory(signed, 'observer.ajeno', keys.operator.privateKey)).toThrow(
      /testigo/u,
    );
  });

  it('detecta incoherencias internas', () => {
    const { signed } = createNetworkFixture();
    const directory = structuredClone(signed.directory);
    expect(directoryProblems(directory)).toEqual([]);
    const authority = directory.authorities[0];
    if (authority === undefined) throw new Error('sin autoridades');
    authority.supervisorId = 'authority.no-existe';
    directory.witnessPolicy.threshold = 9;
    directory.previousDigest = 'a'.repeat(64);
    expect(directoryProblems(directory)).toHaveLength(3);
  });

  it('acepta solo la versión siguiente cofirmada por m de los testigos anteriores', () => {
    const { signed, keys } = createNetworkFixture();
    const nextDirectory = {
      ...structuredClone(signed.directory),
      serial: 2,
      previousDigest: signed.digest,
      issuedOn: '2026-11-10',
    };
    let next = signDirectory(nextDirectory, keys.operator.privateKey);
    expect(verifyDirectoryUpdate(signed, next)).toEqual({ valid: false, reason: 'witnesses' });
    for (const id of ['observer.cpc-queretaro', 'observer.university-ejemplo']) {
      next = cosignDirectory(next, id, demoWitnessPrivateKey(keys, id));
    }
    expect(verifyDirectoryUpdate(signed, next).valid).toBe(true);
    const skipped = signDirectory({ ...nextDirectory, serial: 3 }, keys.operator.privateKey);
    let skippedSigned = skipped;
    for (const id of DEMO_WITNESS_IDS) {
      skippedSigned = cosignDirectory(skippedSigned, id, demoWitnessPrivateKey(keys, id));
    }
    expect(verifyDirectoryUpdate(signed, skippedSigned)).toEqual({
      valid: false,
      reason: 'sequence',
    });
  });

  it('impide volver a una versión anterior con el serial mínimo fijado (H10, poc9)', () => {
    const { signed, keys, trust } = createNetworkFixture();
    const nextDirectory = {
      ...structuredClone(signed.directory),
      serial: 2,
      previousDigest: signed.digest,
      issuedOn: '2026-11-10',
    };
    let next = signDirectory(nextDirectory, keys.operator.privateKey);
    for (const id of DEMO_WITNESS_IDS) {
      next = cosignDirectory(next, id, demoWitnessPrivateKey(keys, id));
    }
    // Sin serial mínimo, la versión 1 (con llaves ya revocadas) sigue verificando: el hallazgo.
    expect(verifySignedDirectory(signed, trust).valid).toBe(true);
    const pinned = { ...trust, minDirectorySerial: 2 };
    expect(verifySignedDirectory(signed, pinned)).toEqual({ valid: false, reason: 'rollback' });
    expect(verifySignedDirectory(next, pinned).valid).toBe(true);
  });

  it('rechaza un directorio vencido o demasiado antiguo cuando se conoce el día', () => {
    const { signed, keys, trust } = createNetworkFixture();
    const expiring = signDirectory(
      { ...structuredClone(signed.directory), validUntil: '2026-11-20' },
      keys.operator.privateKey,
    );
    let cosigned = expiring;
    for (const id of DEMO_WITNESS_IDS) {
      cosigned = cosignDirectory(cosigned, id, demoWitnessPrivateKey(keys, id));
    }
    expect(verifySignedDirectory(cosigned, trust, { today: '2026-11-20' }).valid).toBe(true);
    expect(verifySignedDirectory(cosigned, trust, { today: '2026-11-21' })).toEqual({
      valid: false,
      reason: 'expired',
    });
    // Sin el día no se comprueba el vencimiento (servidores que verifican al arrancar).
    expect(verifySignedDirectory(cosigned, trust).valid).toBe(true);
    const fresh = { ...trust, maxDirectoryAgeDays: 30 };
    expect(verifySignedDirectory(signed, fresh, { today: '2026-12-09' }).valid).toBe(true);
    expect(verifySignedDirectory(signed, fresh, { today: '2026-12-10' })).toEqual({
      valid: false,
      reason: 'stale',
    });
    expect(verifySignedDirectory(signed, fresh)).toEqual({ valid: false, reason: 'stale' });
    expect(
      directoryProblems({ ...signed.directory, validUntil: '2026-11-01' }).join(' '),
    ).toContain('vence antes');
  });

  it('expone búsquedas, vigencia y llaves de testigos', () => {
    const { signed } = createNetworkFixture();
    const { directory } = signed;
    expect(directory.previousDigest).toBe(DIRECTORY_GENESIS_DIGEST);
    const authority = findAuthority(directory, 'authority.comptroller-queretaro');
    expect(authority?.nodeId).toBe('node.queretaro');
    expect(findNode(directory, 'node.federal')?.isCommonNode).toBe(true);
    expect(authority && isAuthorityValidOn(authority, FIXTURE_DAY)).toBe(true);
    expect(authority && isAuthorityValidOn(authority, '2026-11-08')).toBe(false);
    expect(witnessKeyOf(directory, 'node.queretaro')?.keyId).toBe(
      findNode(directory, 'node.queretaro')?.signingKeyId,
    );
    expect(witnessKeyOf(directory, 'observer.nadie')).toBeNull();
    expect(trustAnchorFromDirectory(directory).threshold).toBe(2);
  });
});
