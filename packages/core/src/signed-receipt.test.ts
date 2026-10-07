// Pruebas del comprobante firmado: digesto de la solicitud, firma y manipulación.
import type { SignedReceipt, SubmitComplaintRequest } from '@sigilo/contracts';
import { describe, expect, it } from 'vitest';
import { fromBase64Url, fromHex, toBase64Url } from './encoding.ts';
import { generateSigningKeyPair, keyIdFor } from './keys.ts';
import { computeSubmissionDigest, signReceipt, verifyReceipt } from './signed-receipt.ts';
import type { UnsignedReceipt } from './signed-receipt.ts';

// Solicitud sintética de prueba.
const REQUEST: SubmitComplaintRequest = {
  version: 1,
  mode: 'anonymous',
  facts: {
    stateCode: '22',
    entityId: 'ente-ficticio',
    offenseCode: 'LGRA-52',
    occurredPeriod: '2026-08',
    accused: 'Cargo ficticio',
    description: 'Descripción sintética de hechos para pruebas.',
  },
  evidence: [],
  protectionRequested: false,
  reporterKeys: { boxPublicKey: 'AAAA', signingPublicKey: 'BBBB' },
  authVerifier: 'CCCC',
};

// Semilla del vector 1 de RFC 8032 como llave del servidor de prueba.
const SERVER_SECRET = fromHex('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60');
const SERVER_PUBLIC = fromHex('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a');

function unsignedReceipt(): UnsignedReceipt {
  return {
    folio: '0123-4567-89AB',
    submissionDigest: computeSubmissionDigest(REQUEST),
    receivedOn: '2026-10-06',
    ledgerSeq: 0,
    serverKeyId: keyIdFor(SERVER_PUBLIC),
  };
}

describe('computeSubmissionDigest', () => {
  it('fija el digesto de la forma canónica', () => {
    expect(computeSubmissionDigest(REQUEST)).toBe(
      'f045c68be7659df7cfe91c362a43d7aea11fa4293117fba345d442e48b896381',
    );
  });

  it('no depende del orden de las propiedades', () => {
    const reordered = Object.fromEntries(
      Object.entries(REQUEST).reverse(),
    ) as SubmitComplaintRequest;
    expect(Object.keys(reordered)[0]).toBe('authVerifier');
    expect(computeSubmissionDigest(reordered)).toBe(computeSubmissionDigest(REQUEST));
    expect(computeSubmissionDigest({ ...REQUEST, protectionRequested: true })).not.toBe(
      computeSubmissionDigest(REQUEST),
    );
  });
});

describe('comprobante firmado', () => {
  it('fija la firma determinista y la verifica', () => {
    const receipt = signReceipt(unsignedReceipt(), SERVER_SECRET);
    expect(receipt.signature).toBe(
      '1e15eM0yAdKNlxoRCSk8RwA6aytrhNnP6QF6niVxBeLXwJI4FL7hQKfRcFickK7YRa12dMff-NRuH6IXUA4vDQ',
    );
    expect(verifyReceipt(receipt, SERVER_PUBLIC)).toBe(true);
  });

  it('rechaza cualquier campo o firma alterados', () => {
    const receipt = signReceipt(unsignedReceipt(), SERVER_SECRET);
    const signature = fromBase64Url(receipt.signature);
    signature[0] = (signature[0] ?? 0) ^ 1;
    const tampered: SignedReceipt[] = [
      { ...receipt, folio: '0123-4567-89AC' },
      { ...receipt, ledgerSeq: 1 },
      { ...receipt, receivedOn: '2026-10-07' },
      { ...receipt, submissionDigest: '0'.repeat(64) },
      { ...receipt, signature: toBase64Url(signature) },
      { ...receipt, signature: '***' },
    ];
    for (const candidate of tampered) {
      expect(verifyReceipt(candidate, SERVER_PUBLIC)).toBe(false);
    }
  });

  it('rechaza otra llave del servidor', () => {
    const receipt = signReceipt(unsignedReceipt(), SERVER_SECRET);
    const other = generateSigningKeyPair();
    expect(verifyReceipt(receipt, other.publicKey)).toBe(false);
    expect(
      verifyReceipt({ ...receipt, serverKeyId: keyIdFor(other.publicKey) }, other.publicKey),
    ).toBe(false);
  });

  it('rechaza firmar con keyId ajeno o datos inválidos', () => {
    expect(() =>
      signReceipt({ ...unsignedReceipt(), serverKeyId: '0000000000000000' }, SERVER_SECRET),
    ).toThrow('identificador de llave');
    expect(() => signReceipt({ ...unsignedReceipt(), folio: 'malo' }, SERVER_SECRET)).toThrow();
  });
});
