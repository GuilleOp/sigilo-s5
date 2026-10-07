// Pruebas del bloque de identidad sellado: relleno fijo, AAD ligado al recibo, a las llaves y al
// contenido, vector fijo, rechazo del trasplante y validación.
import { x25519 } from '@noble/curves/ed25519.js';
import type { ComplaintDetail, IdentityBlock } from '@sigilo/contracts';
import { describe, expect, it } from 'vitest';
import { fromBase64Url, fromHex, toBase64Url } from './encoding.ts';
import {
  IDENTITY_PADDED_SIZE,
  computeContentDigest,
  identityContextFor,
  identityContextFromDetail,
  openIdentity,
  sealIdentity,
} from './identity.ts';
import type { IdentityContext, IdentityContextSource } from './identity.ts';
import { generateBoxKeyPair, keyIdFor } from './keys.ts';
import { deriveReceiptKeys } from './receipt-keys.ts';
import type { ReceiptKeys } from './receipt-keys.ts';
import { randomBytes } from './random.ts';
import { FIXED_CONTENT_DIGEST, FIXED_IDENTITY_ENVELOPE } from './test-vectors.ts';

const OPEN_ERROR = 'No se pudo abrir el sobre.';
// Datos sintéticos de prueba.
const BLOCK: IdentityBlock = {
  fullName: 'Persona Ficticia Pérez',
  contact: 'contacto@ejemplo.invalid',
  witnesses: ['Testigo Uno'],
  originalEvidenceSha256: ['a'.repeat(64)],
};
// Llave privada de Alice en RFC 7748 (solo para pruebas).
const FIXED_AUTHORITY_PRIVATE = fromHex(
  '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a',
);

function sourceFor(reporter: ReceiptKeys, description: string): IdentityContextSource {
  return {
    version: 1,
    mode: 'sealed',
    facts: {
      stateCode: '22',
      municipalityCode: '014',
      entityId: 'VE-OBRAS',
      offenseCode: 'LGRA-52',
      occurredPeriod: '2026-08',
      accused: 'Titular ficticio de la unidad de compras',
      description,
    },
    evidence: [],
    protectionRequested: true,
    authVerifier: reporter.authVerifier,
    reporterKeys: {
      boxPublicKey: toBase64Url(reporter.box.publicKey),
      signingPublicKey: toBase64Url(reporter.signing.publicKey),
    },
  };
}

const FIXED_DESCRIPTION = 'Hechos sintéticos para el vector fijo de la identidad sellada.';

function setup() {
  const authority = generateBoxKeyPair();
  const recipient = { keyId: keyIdFor(authority.publicKey), publicKey: authority.publicKey };
  const reporter = deriveReceiptKeys(randomBytes(11));
  const source = sourceFor(reporter, 'Hechos sintéticos de la denuncia A para la prueba.');
  return { authority, recipient, reporter, source, context: identityContextFor(source) };
}

describe('computeContentDigest e identityContextFor', () => {
  it('fija el digesto del contenido y toma solo sus campos', () => {
    const reporter = deriveReceiptKeys(fromHex('000102030405060708090a'));
    const source = sourceFor(reporter, FIXED_DESCRIPTION);
    expect(computeContentDigest(source)).toBe(FIXED_CONTENT_DIGEST);
    const withExtra = { ...source, sealedIdentity: FIXED_IDENTITY_ENVELOPE };
    expect(computeContentDigest(withExtra)).toBe(FIXED_CONTENT_DIGEST);
    expect(identityContextFor(source)).toEqual({
      authVerifier: reporter.authVerifier,
      reporterKeys: source.reporterKeys,
      contentDigest: FIXED_CONTENT_DIGEST,
    });
  });

  it('recalcula el mismo contexto desde el detalle de la autoridad', () => {
    const { source, context } = setup();
    const detail: ComplaintDetail = {
      summary: {
        folio: '0123-4567-89AB',
        mode: source.mode,
        status: 'received',
        receivedOn: '2026-10-20',
        stateCode: source.facts.stateCode,
        offenseCode: source.facts.offenseCode,
        protectionRequested: source.protectionRequested,
      },
      version: 1,
      facts: source.facts,
      evidence: [],
      reporterKeys: source.reporterKeys,
      authVerifier: source.authVerifier,
      messages: [],
      identityOpenedCount: 0,
    };
    expect(identityContextFromDetail(detail)).toEqual(context);
  });
});

describe('identidad sellada', () => {
  it('hace ida y vuelta', async () => {
    const { authority, recipient, context } = setup();
    const envelope = await sealIdentity(BLOCK, recipient, context);
    expect(await openIdentity(envelope, authority.privateKey, context)).toEqual(BLOCK);
  });

  it('abre el vector fijo de regresión', async () => {
    const reporter = deriveReceiptKeys(fromHex('000102030405060708090a'));
    const context = identityContextFor(sourceFor(reporter, FIXED_DESCRIPTION));
    expect(FIXED_IDENTITY_ENVELOPE.keyId).toBe(
      keyIdFor(x25519.getPublicKey(FIXED_AUTHORITY_PRIVATE)),
    );
    expect(await openIdentity(FIXED_IDENTITY_ENVELOPE, FIXED_AUTHORITY_PRIVATE, context)).toEqual(
      BLOCK,
    );
  });

  it('oculta la longitud: bloques distintos producen el mismo tamaño', async () => {
    const { recipient, context } = setup();
    const small = await sealIdentity(
      { fullName: 'A', witnesses: [], originalEvidenceSha256: [] },
      recipient,
      context,
    );
    const large = await sealIdentity(BLOCK, recipient, context);
    // 4096 bytes de texto en claro más 16 de etiqueta.
    expect(fromBase64Url(small.ct)).toHaveLength(IDENTITY_PADDED_SIZE + 16);
    expect(fromBase64Url(large.ct)).toHaveLength(IDENTITY_PADDED_SIZE + 16);
  });

  it('descarta campos ajenos al esquema', async () => {
    const { authority, recipient, context } = setup();
    const extra = { ...BLOCK, extra: 'no debe viajar' } as IdentityBlock;
    const envelope = await sealIdentity(extra, recipient, context);
    expect(await openIdentity(envelope, authority.privateKey, context)).toEqual(BLOCK);
  });

  it('no abre si cambia cualquier parte del contexto o la llave', async () => {
    const { authority, recipient, context } = setup();
    const envelope = await sealIdentity(BLOCK, recipient, context);
    const other = deriveReceiptKeys(randomBytes(11));
    const variants: IdentityContext[] = [
      { ...context, authVerifier: other.authVerifier },
      {
        ...context,
        reporterKeys: { ...context.reporterKeys, boxPublicKey: toBase64Url(other.box.publicKey) },
      },
      {
        ...context,
        reporterKeys: {
          ...context.reporterKeys,
          signingPublicKey: toBase64Url(other.signing.publicKey),
        },
      },
      { ...context, contentDigest: '0'.repeat(64) },
      { ...context, contentDigest: 'no es un digesto' },
    ];
    for (const variant of variants) {
      await expect(openIdentity(envelope, authority.privateKey, variant)).rejects.toThrow(
        OPEN_ERROR,
      );
    }
    await expect(openIdentity(envelope, generateBoxKeyPair().privateKey, context)).rejects.toThrow(
      OPEN_ERROR,
    );
  });

  it('rechaza el trasplante: el sobre y el authVerifier de A no abren en la denuncia B', async () => {
    // Ataque: se arma B con hechos y llaves propias, pero con el sobre y el authVerifier de A.
    const { authority, recipient, reporter, context } = setup();
    const envelopeOfA = await sealIdentity(BLOCK, recipient, context);
    const attacker = deriveReceiptKeys(randomBytes(11));
    const complaintB = {
      ...sourceFor(attacker, 'Hechos sintéticos distintos de la denuncia B del atacante.'),
      authVerifier: reporter.authVerifier,
    };
    await expect(
      openIdentity(envelopeOfA, authority.privateKey, identityContextFor(complaintB)),
    ).rejects.toThrow(OPEN_ERROR);
    // Aunque copie también las llaves de A, los hechos de B cambian el digesto del contenido.
    const withKeysOfA = { ...complaintB, reporterKeys: context.reporterKeys };
    await expect(
      openIdentity(envelopeOfA, authority.privateKey, identityContextFor(withKeysOfA)),
    ).rejects.toThrow(OPEN_ERROR);
  });

  it('rechaza bloques inválidos sin citar sus datos', async () => {
    const { recipient, context } = setup();
    const invalid = { ...BLOCK, fullName: '' };
    await expect(sealIdentity(invalid, recipient, context)).rejects.toThrow(
      'El bloque de identidad no es válido.',
    );
  });

  it('rechaza bloques que exceden 4096 bytes', async () => {
    const { recipient, context } = setup();
    const huge: IdentityBlock = {
      fullName: 'Ñ'.repeat(200),
      contact: 'Ñ'.repeat(200),
      witnesses: Array<string>(10).fill('Ñ'.repeat(500)),
      originalEvidenceSha256: [],
    };
    await expect(sealIdentity(huge, recipient, context)).rejects.toThrow('excede 4096 bytes');
  });

  it('rechaza un contexto mal formado al sellar', async () => {
    const { recipient, context } = setup();
    await expect(
      sealIdentity(BLOCK, recipient, { ...context, authVerifier: 'no válido' }),
    ).rejects.toThrow('contexto');
  });
});
