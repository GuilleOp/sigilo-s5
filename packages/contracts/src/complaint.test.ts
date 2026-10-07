// Pruebas de los esquemas de denuncia: hechos validados contra catálogos y reglas de cada modo.
import { describe, expect, it } from 'vitest';
import { ComplaintFactsSchema, SubmitComplaintRequestSchema } from './complaint.ts';
import type { ComplaintFacts, SubmitComplaintRequest } from './complaint.ts';
import { HPKE_SUITE_V1 } from './envelope.ts';
import type { HpkeEnvelope } from './envelope.ts';

const FACTS: ComplaintFacts = {
  stateCode: '22',
  municipalityCode: '014',
  entityId: 'VE-OBRAS',
  offenseCode: 'LGRA-52',
  occurredPeriod: '2026-08',
  accused: 'Titular ficticio de la unidad de compras',
  description: 'Hechos sintéticos para las pruebas del contrato de la denuncia.',
};

const ENVELOPE: HpkeEnvelope = {
  v: 1,
  suite: HPKE_SUITE_V1,
  keyId: '0123456789abcdef',
  enc: 'AA',
  ct: 'AA',
};

function request(overrides: Partial<SubmitComplaintRequest>): unknown {
  return {
    version: 1,
    mode: 'anonymous',
    facts: FACTS,
    evidence: [],
    protectionRequested: false,
    reporterKeys: { boxPublicKey: 'AA', signingPublicKey: 'AA' },
    authVerifier: 'AA',
    ...overrides,
  };
}

describe('ComplaintFactsSchema', () => {
  it('acepta hechos con claves de los catálogos, con o sin municipio', () => {
    expect(ComplaintFactsSchema.parse(FACTS)).toEqual(FACTS);
    const withoutMunicipality: ComplaintFacts = { ...FACTS };
    delete withoutMunicipality.municipalityCode;
    expect(
      ComplaintFactsSchema.safeParse({ ...withoutMunicipality, stateCode: '09' }).success,
    ).toBe(true);
    expect(ComplaintFactsSchema.safeParse({ ...FACTS, offenseCode: 'CPF-222' }).success).toBe(true);
  });

  it('rechaza texto libre en los campos que se publican en datos abiertos', () => {
    for (const field of ['stateCode', 'entityId', 'offenseCode'] as const) {
      const result = ComplaintFactsSchema.safeParse({
        ...FACTS,
        [field]: 'Juan Perez es corrupto',
      });
      expect(result.success, field).toBe(false);
    }
    expect(ComplaintFactsSchema.safeParse({ ...FACTS, stateCode: '33' }).success).toBe(false);
    expect(ComplaintFactsSchema.safeParse({ ...FACTS, offenseCode: 'LGRA-1' }).success).toBe(false);
  });

  it('exige que el municipio pertenezca a la entidad', () => {
    const result = ComplaintFactsSchema.safeParse({ ...FACTS, stateCode: '09' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['municipalityCode']);
    expect(ComplaintFactsSchema.safeParse({ ...FACTS, municipalityCode: '099' }).success).toBe(
      false,
    );
    expect(ComplaintFactsSchema.safeParse({ ...FACTS, municipalityCode: '14' }).success).toBe(
      false,
    );
  });
});

describe('SubmitComplaintRequestSchema', () => {
  it('acepta el modo anonymous sin identidad y el modo sealed con identidad', () => {
    expect(SubmitComplaintRequestSchema.safeParse(request({})).success).toBe(true);
    const sealed = request({ mode: 'sealed', sealedIdentity: ENVELOPE, protectionRequested: true });
    expect(SubmitComplaintRequestSchema.safeParse(sealed).success).toBe(true);
    const sealedWithoutProtection = request({ mode: 'sealed', sealedIdentity: ENVELOPE });
    expect(SubmitComplaintRequestSchema.safeParse(sealedWithoutProtection).success).toBe(true);
  });

  it('rechaza el modo sealed sin identidad', () => {
    const result = SubmitComplaintRequestSchema.safeParse(request({ mode: 'sealed' }));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('El modo sealed requiere identidad cifrada.');
  });

  it('rechaza el modo anonymous con identidad o con solicitud de protección', () => {
    for (const overrides of [{ sealedIdentity: ENVELOPE }, { protectionRequested: true }]) {
      const result = SubmitComplaintRequestSchema.safeParse(request(overrides));
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe('El modo anonymous no admite identidad.');
    }
  });

  it('rechaza otra versión o hechos fuera de catálogo', () => {
    expect(
      SubmitComplaintRequestSchema.safeParse({ ...(request({}) as object), version: 2 }).success,
    ).toBe(false);
    const invalidFacts = request({ facts: { ...FACTS, entityId: 'ente-libre' } });
    expect(SubmitComplaintRequestSchema.safeParse(invalidFacts).success).toBe(false);
  });
});
