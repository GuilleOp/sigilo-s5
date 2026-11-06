// Pruebas de la custodia: fecha límite contra la prescripción, máquina de estados, liberación con
// el recibo y doble cifrado.
import { describe, expect, it } from 'vitest';
import type { HpkeEnvelope } from '@sigilo/contracts';
import {
  generateBoxKeyPair,
  keyIdFor,
  openEnvelope,
  sealToPublicKey,
  utf8Encode,
} from '@sigilo/core';
import {
  advanceCustody,
  createCustody,
  custodyDeadline,
  deriveCustodyReleaseKeys,
  newCustodyId,
  openReleasedCustody,
  prescriptionSafeLimit,
  sealForCustody,
  signCustodyRelease,
} from './custody.ts';
import type { CustodyRecord } from './custody.ts';

const ENTROPY = Uint8Array.from({ length: 11 }, (_, index) => index);
const AUTHORITY = generateBoxKeyPair();
const CUSTODIAN = generateBoxKeyPair();
const AAD = utf8Encode('hechos');

async function authorityEnvelope(): Promise<HpkeEnvelope> {
  return sealToPublicKey(
    utf8Encode('{"hechos":"sintéticos"}'),
    { keyId: keyIdFor(AUTHORITY.publicKey), publicKey: AUTHORITY.publicKey },
    AAD,
  );
}

async function heldCustody(overrides: { chosenDeadline?: string } = {}): Promise<CustodyRecord> {
  const custodyId = newCustodyId();
  const sealed = await sealForCustody(
    await authorityEnvelope(),
    { keyId: keyIdFor(CUSTODIAN.publicKey), publicKey: CUSTODIAN.publicKey },
    custodyId,
  );
  return createCustody({
    custodyId,
    epoch: 1,
    tag: 'a'.repeat(64),
    createdOn: '2026-11-09',
    occurredPeriod: '2026-03',
    chosenDeadline: overrides.chosenDeadline ?? '2027-06-30',
    releasePublicKey: deriveCustodyReleaseKeys(ENTROPY).publicKey,
    sealed,
  });
}

describe('fecha límite de la custodia', () => {
  it('es el inicio del periodo + 3 años − 12 meses cuando la fecha elegida es posterior', () => {
    expect(prescriptionSafeLimit('2026-03')).toBe('2028-03-01');
    expect(prescriptionSafeLimit('2025-12')).toBe('2027-12-01');
    expect(custodyDeadline('2030-01-01', '2026-03')).toBe('2028-03-01');
    expect(custodyDeadline('2027-06-30', '2026-03')).toBe('2027-06-30');
    expect(() => custodyDeadline('2027-13-40', '2026-03')).toThrow('Fecha');
    expect(() => prescriptionSafeLimit('2026-3')).toThrow('Periodo');
  });

  it('nace liberada si la fecha límite ya llegó: nunca deja prescribir', async () => {
    const record = await heldCustody();
    const late = createCustody({
      ...record,
      occurredPeriod: '2023-01',
      releasePublicKey: deriveCustodyReleaseKeys(ENTROPY).publicKey,
    });
    expect(late.deadline).toBe('2025-01-01');
    expect(late.state).toBe('released');
    expect(late.release).toEqual({ reason: 'deadline', on: '2026-11-09' });
  });
});

describe('máquina de estados de la custodia', () => {
  it('se libera solo con otra fuente confirmada, no con la misma fuente', async () => {
    const record = await heldCustody();
    expect(record.state).toBe('held');
    const same = advanceCustody(record, {
      type: 'match_reported',
      confirmedOtherSources: 0,
      on: '2026-11-11',
    });
    expect(same).toBe(record);
    const released = advanceCustody(record, {
      type: 'match_reported',
      confirmedOtherSources: 1,
      on: '2026-11-12',
    });
    expect(released.release).toEqual({ reason: 'corroborated', on: '2026-11-12' });
    expect(record.state).toBe('held');
  });

  it('se libera a petición de la persona con su recibo y no con otra firma', async () => {
    const record = await heldCustody();
    const otherKeys = deriveCustodyReleaseKeys(new Uint8Array(11).fill(1));
    const forged = advanceCustody(record, {
      type: 'reporter_release',
      signature: signCustodyRelease(record.custodyId, otherKeys.privateKey),
      on: '2026-11-10',
    });
    expect(forged.state).toBe('held');
    const otherCustody = advanceCustody(record, {
      type: 'reporter_release',
      signature: signCustodyRelease(newCustodyId(), deriveCustodyReleaseKeys(ENTROPY).privateKey),
      on: '2026-11-10',
    });
    expect(otherCustody.state).toBe('held');
    const released = advanceCustody(record, {
      type: 'reporter_release',
      signature: signCustodyRelease(record.custodyId, deriveCustodyReleaseKeys(ENTROPY).privateKey),
      on: '2026-11-10',
    });
    expect(released.release).toEqual({ reason: 'reporter_request', on: '2026-11-10' });
  });

  it('se libera por fecha límite con el reloj y la liberación es final', async () => {
    const record = await heldCustody({ chosenDeadline: '2026-12-01' });
    expect(advanceCustody(record, { type: 'clock', on: '2026-11-30' }).state).toBe('held');
    const released = advanceCustody(record, { type: 'clock', on: '2026-12-01' });
    expect(released.release).toEqual({ reason: 'deadline', on: '2026-12-01' });
    const after = advanceCustody(released, {
      type: 'match_reported',
      confirmedOtherSources: 4,
      on: '2026-12-02',
    });
    expect(after).toBe(released);
    // Un evento tardío de coincidencia, después de la fecha límite, cuenta como fecha límite.
    const late = advanceCustody(record, {
      type: 'match_reported',
      confirmedOtherSources: 2,
      on: '2026-12-05',
    });
    expect(late.release?.reason).toBe('deadline');
    expect(() => advanceCustody(record, { type: 'clock', on: 'mañana' })).toThrow('Fecha');
  });
});

describe('doble cifrado de la custodia', () => {
  it('el custodio solo abre una custodia liberada y obtiene el sobre de la autoridad', async () => {
    const record = await heldCustody();
    await expect(openReleasedCustody(record, CUSTODIAN.privateKey)).rejects.toThrow('retenida');
    const released = advanceCustody(record, {
      type: 'match_reported',
      confirmedOtherSources: 1,
      on: '2026-11-12',
    });
    const inner = await openReleasedCustody(released, CUSTODIAN.privateKey);
    expect(inner.keyId).toBe(keyIdFor(AUTHORITY.publicKey));
    const plaintext = await openEnvelope(inner, AUTHORITY.privateKey, AAD);
    expect(new TextDecoder().decode(plaintext)).toContain('sintéticos');
  });

  it('el nodo (sin la llave del custodio) y el custodio con otra custodia no pueden abrirla', async () => {
    const record = await heldCustody();
    const released = advanceCustody(record, { type: 'clock', on: '2027-06-30' });
    await expect(openReleasedCustody(released, AUTHORITY.privateKey)).rejects.toThrow();
    await expect(
      openReleasedCustody({ ...released, custodyId: newCustodyId() }, CUSTODIAN.privateKey),
    ).rejects.toThrow();
  });
});
