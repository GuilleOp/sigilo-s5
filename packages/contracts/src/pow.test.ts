// Pruebas del reto de prueba de trabajo: forma del token y límites de la dificultad.
import { describe, expect, it } from 'vitest';
import { MAX_POW_BITS, PowChallengeSchema, PowPurposeSchema } from './pow.ts';

describe('PowChallengeSchema', () => {
  it('acepta un token de dos partes y dificultades entre 0 y el máximo', () => {
    expect(PowChallengeSchema.safeParse({ token: 'abc.def', bits: 0 }).success).toBe(true);
    expect(PowChallengeSchema.safeParse({ token: 'abc.def', bits: MAX_POW_BITS }).success).toBe(
      true,
    );
    for (const challenge of [
      { token: 'abc', bits: 8 },
      { token: 'abc.def:1', bits: 8 },
      { token: 'abc.def', bits: MAX_POW_BITS + 1 },
      { token: 'abc.def', bits: -1 },
      { token: `${'a'.repeat(600)}.b`, bits: 8 },
    ]) {
      expect(PowChallengeSchema.safeParse(challenge).success, JSON.stringify(challenge)).toBe(
        false,
      );
    }
  });

  it('solo admite los propósitos de las escrituras protegidas', () => {
    expect(PowPurposeSchema.options).toEqual(['complaint', 'message']);
  });
});
