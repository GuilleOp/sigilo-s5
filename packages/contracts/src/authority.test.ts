// Pruebas del detalle de la autoridad: campos para recalcular el contexto y coherencia interna.
import { describe, expect, it } from 'vitest';
import { ComplaintDetailSchema, OpenIdentityResponseSchema } from './authority.ts';
import type { ComplaintDetail } from './authority.ts';

const DETAIL: ComplaintDetail = {
  summary: {
    folio: '0123-4567-89AB',
    mode: 'sealed',
    status: 'received',
    receivedOn: '2026-10-20',
    stateCode: '22',
    offenseCode: 'LGRA-52',
    protectionRequested: true,
  },
  version: 1,
  facts: {
    stateCode: '22',
    entityId: 'VE-OBRAS',
    offenseCode: 'LGRA-52',
    occurredPeriod: '2026-08',
    accused: 'Titular ficticio',
    description: 'Hechos sintéticos para la prueba del detalle de la autoridad.',
  },
  evidence: [],
  reporterKeys: { boxPublicKey: 'AA', signingPublicKey: 'AA' },
  authVerifier: 'AA',
  messages: [],
  identityOpenedCount: 0,
};

describe('ComplaintDetailSchema', () => {
  it('acepta un detalle coherente con versión, llaves y verificador', () => {
    expect(ComplaintDetailSchema.parse(DETAIL)).toEqual(DETAIL);
    const withoutVerifier: Partial<ComplaintDetail> = { ...DETAIL };
    delete withoutVerifier.authVerifier;
    expect(ComplaintDetailSchema.safeParse(withoutVerifier).success).toBe(false);
  });

  it('rechaza un resumen que no corresponde a los hechos', () => {
    const mismatch = { ...DETAIL, summary: { ...DETAIL.summary, stateCode: '09' } };
    expect(ComplaintDetailSchema.safeParse(mismatch).success).toBe(false);
  });

  it('rechaza identidad o protección en modo anonymous', () => {
    const anonymous = { ...DETAIL, summary: { ...DETAIL.summary, mode: 'anonymous' as const } };
    expect(ComplaintDetailSchema.safeParse(anonymous).success).toBe(false);
    const clean = { ...anonymous, summary: { ...anonymous.summary, protectionRequested: false } };
    expect(ComplaintDetailSchema.safeParse(clean).success).toBe(true);
    expect(ComplaintDetailSchema.safeParse({ ...clean, identityOpenedCount: 1 }).success).toBe(
      false,
    );
  });
});

describe('OpenIdentityResponseSchema', () => {
  it('ya no lleva el verificador: el contexto sale del detalle', () => {
    const envelope = {
      v: 1,
      suite: 'DHKEM-X25519-HKDF-SHA256/HKDF-SHA256/ChaCha20Poly1305',
      keyId: '0123456789abcdef',
      enc: 'AA',
      ct: 'AA',
    };
    const parsed = OpenIdentityResponseSchema.parse({
      sealedIdentity: envelope,
      ledgerSeq: 1,
      authVerifier: 'AA',
    });
    expect(parsed).toEqual({ sealedIdentity: envelope, ledgerSeq: 1 });
  });
});
