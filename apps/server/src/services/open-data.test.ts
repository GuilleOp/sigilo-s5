// Pruebas unitarias del CSV: escape de campos, redondeo, supresión y mes vigente.
import { describe, expect, it } from 'vitest';
import { buildOpenDataCsv, currentMonth, escapeCsvField, roundToMultiple } from './open-data.ts';

const POLICY = { minCell: 5, rounding: 5 };

describe('escapeCsvField', () => {
  it('entrecomilla comas, comillas y saltos de línea', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('di "hola"')).toBe('"di ""hola"""');
    expect(escapeCsvField('a\nb')).toBe('"a\nb"');
  });

  it('neutraliza valores que empiezan como fórmula', () => {
    expect(escapeCsvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(escapeCsvField('+1')).toBe("'+1");
    expect(escapeCsvField('LGRA-52')).toBe('LGRA-52');
  });
});

describe('roundToMultiple y currentMonth', () => {
  it('redondea al múltiplo de 5 más cercano', () => {
    expect([0, 2, 3, 5, 7, 8, 12, 13].map((n) => roundToMultiple(n, 5))).toEqual([
      0, 0, 5, 5, 5, 10, 10, 15,
    ]);
  });

  it('toma el mes UTC', () => {
    expect(currentMonth(new Date('2026-11-01T00:30:00Z'))).toBe('2026-11');
    expect(currentMonth(new Date('2026-10-31T23:59:59Z'))).toBe('2026-10');
  });
});

describe('buildOpenDataCsv', () => {
  it('redondea los conteos, suprime los menores que 5 y redondea la fila de suprimidas', () => {
    const csv = buildOpenDataCsv(
      [
        { stateCode: '01', offenseCode: 'LGRA-52', month: '2026-10', status: 'received', count: 4 },
        { stateCode: '02', offenseCode: 'LGRA-53', month: '2026-10', status: 'routed', count: 7 },
        { stateCode: '03', offenseCode: 'LGRA-54', month: '2026-10', status: 'received', count: 8 },
        { stateCode: '04', offenseCode: 'CPF-215', month: '2026-09', status: 'received', count: 3 },
      ],
      POLICY,
    );
    const lines = csv.split('\r\n');
    expect(lines).toEqual([
      'entidad,conducta,mes_recepcion,estatus,denuncias',
      '02,LGRA-53,2026-10,routed,5',
      '03,LGRA-54,2026-10,received,10',
      'suprimidas,,,,5',
      '',
    ]);
    const header = lines[0]?.split(',') ?? [];
    for (const line of lines.slice(1, -1)) expect(line.split(',')).toHaveLength(header.length);
  });

  it('publica cero suprimidas cuando el total suprimido redondea a cero', () => {
    const csv = buildOpenDataCsv(
      [{ stateCode: '01', offenseCode: 'LGRA-52', month: '2026-10', status: 'received', count: 2 }],
      POLICY,
    );
    expect(csv).toBe('entidad,conducta,mes_recepcion,estatus,denuncias\r\nsuprimidas,,,,0\r\n');
  });
});
