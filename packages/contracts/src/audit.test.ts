// Pruebas del registro de bitácora del auditor: solo digestos y claves, esquema estricto.
import { describe, expect, it } from 'vitest';
import { AUDIT_LEDGER_EVENT_TYPE, AuditLedgerRecordSchema } from './audit.ts';

const DIGEST = 'a'.repeat(64);

const valid = {
  version: 1,
  type: AUDIT_LEDGER_EVENT_TYPE,
  ruleId: 'AUD-01',
  signalKey: 'signal.template-closure',
  engine: { kind: 'rules', rulesVersion: '1.0.0' },
  subjectKind: 'closure',
  subjectDigest: DIGEST,
  inputDigest: DIGEST,
  outputDigest: DIGEST,
  result: 'flagged',
  at: '2026-12-10',
};

describe('AuditLedgerRecordSchema', () => {
  it('acepta un registro de reglas y uno de modelo', () => {
    expect(AuditLedgerRecordSchema.parse(valid)).toEqual(valid);
    const model = {
      ...valid,
      ruleId: 'AUD-M1',
      signalKey: 'model.offense-suggestion',
      engine: {
        kind: 'model',
        adapterVersion: '1.0.0',
        modelName: 'qwen2.5:1.5b',
        modelDigest: DIGEST,
      },
      result: 'discarded',
    };
    expect(AuditLedgerRecordSchema.safeParse(model).success).toBe(true);
  });

  it('rechaza campos de más (por ejemplo, el texto analizado)', () => {
    expect(AuditLedgerRecordSchema.safeParse({ ...valid, text: 'relato' }).success).toBe(false);
    expect(
      AuditLedgerRecordSchema.safeParse({
        ...valid,
        engine: { kind: 'rules', rulesVersion: '1.0.0', prompt: 'x' },
      }).success,
    ).toBe(false);
  });

  it('rechaza regla, clave o digesto inválidos', () => {
    expect(AuditLedgerRecordSchema.safeParse({ ...valid, ruleId: 'AUD-99' }).success).toBe(false);
    expect(AuditLedgerRecordSchema.safeParse({ ...valid, signalKey: 'Señal' }).success).toBe(false);
    expect(AuditLedgerRecordSchema.safeParse({ ...valid, inputDigest: 'xyz' }).success).toBe(false);
  });
});
