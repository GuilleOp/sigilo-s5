// Pruebas del comprobante firmado: digesto de la solicitud, firma y manipulación.
import type { ComplaintDetail, SignedReceipt, SubmitComplaintRequest } from '@sigilo/contracts';
import { describe, expect, it } from 'vitest';
import { fromBase64Url, fromHex, toBase64Url } from './encoding.ts';
import { generateSigningKeyPair, keyIdFor } from './keys.ts';
import { canonicalize, sha256Hex } from './canonical-json.ts';
import { receivedPayloadDigest } from './ledger.ts';
import {
  computeSubmissionDigest,
  sealedIdentityDigest,
  signReceipt,
  submissionDigestFromDetail,
  submissionDigestInput,
  verifyReceipt,
} from './signed-receipt.ts';
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

const FOLIO = '0123-4567-89AB';

const SEALED_REQUEST: SubmitComplaintRequest = {
  ...REQUEST,
  mode: 'sealed',
  protectionRequested: true,
  sealedIdentity: {
    v: 1,
    suite: 'DHKEM-X25519-HKDF-SHA256/HKDF-SHA256/ChaCha20Poly1305',
    keyId: '0123456789abcdef',
    enc: 'AA',
    ct: 'AA',
  },
};

function unsignedReceipt(): UnsignedReceipt {
  const submissionDigest = computeSubmissionDigest(REQUEST);
  return {
    folio: FOLIO,
    submissionDigest,
    receivedOn: '2026-10-06',
    payloadDigest: receivedPayloadDigest(FOLIO, submissionDigest),
    serverKeyId: keyIdFor(SERVER_PUBLIC),
  };
}

function detailOf(request: SubmitComplaintRequest): ComplaintDetail {
  return {
    summary: {
      folio: FOLIO,
      mode: request.mode,
      status: 'received',
      receivedOn: '2026-10-06',
      stateCode: request.facts.stateCode,
      offenseCode: request.facts.offenseCode,
      protectionRequested: request.protectionRequested,
    },
    version: 1,
    facts: request.facts,
    evidence: request.evidence,
    reporterKeys: request.reporterKeys,
    authVerifier: request.authVerifier,
    ...(request.sealedIdentity === undefined
      ? {}
      : { sealedIdentityDigest: sealedIdentityDigest(request.sealedIdentity) }),
    messages: [],
    identityOpenedCount: 0,
  };
}

describe('computeSubmissionDigest', () => {
  it('fija el digesto de la forma canónica', () => {
    expect(computeSubmissionDigest(REQUEST)).toBe(
      'f045c68be7659df7cfe91c362a43d7aea11fa4293117fba345d442e48b896381',
    );
  });

  it('sustituye el sobre de identidad por su digesto', () => {
    const { sealedIdentity } = SEALED_REQUEST;
    if (sealedIdentity === undefined) throw new Error('falta el sobre');
    const input = submissionDigestInput(SEALED_REQUEST);
    expect(input.sealedIdentity).toBe(sha256Hex(canonicalize(sealedIdentity)));
    expect(computeSubmissionDigest(SEALED_REQUEST)).toBe(sha256Hex(canonicalize(input)));
    expect(computeSubmissionDigest(SEALED_REQUEST)).toBe(
      'c06b3b4bf00a682e4cafc0c6680f2d8640190d9c1cc820f7fc8cc605bf48a657',
    );
    const otherEnvelope = { ...sealedIdentity, ct: 'AB' };
    expect(computeSubmissionDigest({ ...SEALED_REQUEST, sealedIdentity: otherEnvelope })).not.toBe(
      computeSubmissionDigest(SEALED_REQUEST),
    );
  });

  it('la autoridad lo recalcula desde el detalle, en ambos modos', () => {
    for (const request of [REQUEST, SEALED_REQUEST]) {
      expect(submissionDigestFromDetail(detailOf(request))).toBe(computeSubmissionDigest(request));
    }
    // Si el servidor cambia las llaves del buzón, el digesto ya no coincide.
    const detail = detailOf(REQUEST);
    const swapped = { ...detail, reporterKeys: { ...detail.reporterKeys, boxPublicKey: 'ZZZZ' } };
    expect(submissionDigestFromDetail(swapped)).not.toBe(computeSubmissionDigest(REQUEST));
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
      'Gu7IV7Ooqm4WbxL6VV-TmN3Cz9suqpytP6OF3UK63DXssYWWbK3s2ofTQdjXsr6iiy496i_JO7YXJZbwwMbwDQ',
    );
    expect(verifyReceipt(receipt, SERVER_PUBLIC)).toBe(true);
  });

  it('rechaza cualquier campo o firma alterados', () => {
    const receipt = signReceipt(unsignedReceipt(), SERVER_SECRET);
    const signature = fromBase64Url(receipt.signature);
    signature[0] = (signature[0] ?? 0) ^ 1;
    const tampered: SignedReceipt[] = [
      { ...receipt, folio: '0123-4567-89AC' },
      { ...receipt, payloadDigest: 'c'.repeat(64) },
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
    expect(() =>
      signReceipt({ ...unsignedReceipt(), payloadDigest: 'c'.repeat(64) }, SERVER_SECRET),
    ).toThrow('identificador del evento');
  });
});
