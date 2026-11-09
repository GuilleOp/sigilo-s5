// Pruebas de las funciones de las cuentas: combinaciones admitidas, compatibilidad con el archivo
// de cuentas anterior y el corte entre investigación y substanciación (LGRA art. 3 y 115).
import { describe, expect, it } from 'vitest';
import {
  AuthorityAccountRecordSchema,
  functionForStage,
  functionInChargeAt,
  isAllowedFunctionSet,
} from './authority-access.ts';

const RECORD = {
  accountId: 'acct-00000000000000aa',
  username: 'oic-equipamiento.persona1',
  authorityId: 'authority.oic-prueba',
  passwordHash: `scrypt$15$8$1$${'A'.repeat(22)}$${'B'.repeat(43)}`,
};

describe('funciones de una cuenta', () => {
  it('admite una sola función o recepción e investigación juntas, en cualquier orden', () => {
    for (const set of [
      ['intake'],
      ['investigation'],
      ['supervision'],
      ['substantiation'],
      ['intake', 'investigation'],
      ['investigation', 'intake'],
    ] as const) {
      expect(isAllowedFunctionSet(set), set.join('+')).toBe(true);
    }
  });

  it('nunca combina substanciación ni supervisión con otra función, ni repite', () => {
    for (const set of [
      [],
      ['investigation', 'substantiation'],
      ['intake', 'substantiation'],
      ['intake', 'supervision'],
      ['investigation', 'supervision'],
      ['intake', 'intake'],
    ] as const) {
      expect(isAllowedFunctionSet(set), set.join('+')).toBe(false);
    }
  });

  it('lee el archivo anterior con una sola `function` como `functions`', () => {
    expect(AuthorityAccountRecordSchema.parse({ ...RECORD, function: 'intake' })).toEqual({
      ...RECORD,
      functions: ['intake'],
    });
    expect(
      AuthorityAccountRecordSchema.parse({ ...RECORD, functions: ['intake', 'investigation'] })
        .functions,
    ).toEqual(['intake', 'investigation']);
    expect(
      AuthorityAccountRecordSchema.safeParse({
        ...RECORD,
        functions: ['investigation', 'substantiation'],
      }).success,
    ).toBe(false);
    // Las dos formas a la vez no se admiten (objeto estricto).
    expect(
      AuthorityAccountRecordSchema.safeParse({
        ...RECORD,
        function: 'intake',
        functions: ['intake'],
      }).success,
    ).toBe(false);
  });

  it('investigación llega hasta el IPRA; lo posterior es de substanciación', () => {
    expect(functionForStage('investigation')).toBe('investigation');
    expect(functionForStage('qualification')).toBe('investigation');
    expect(functionForStage('report_filed')).toBe('investigation');
    for (const stage of [
      'case_file_sent',
      'evidence_hearing',
      'closing_arguments',
      'instruction_closed',
      'resolution',
    ] as const) {
      expect(functionForStage(stage)).toBe('substantiation');
    }
    expect(functionForStage('criminal_investigation')).toBe('investigation');
    expect(functionForStage('sentence')).toBe('investigation');
    // Presentado el informe, el expediente ya es de la substanciadora.
    expect(functionInChargeAt('qualification')).toBe('investigation');
    expect(functionInChargeAt('report_filed')).toBe('substantiation');
  });
});
