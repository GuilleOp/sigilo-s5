// Pruebas unitarias del CSV: escape de campos e inyección de fórmulas.
import { describe, expect, it } from 'vitest';
import { buildOpenDataCsv, escapeCsvField } from './open-data.ts';

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

describe('buildOpenDataCsv', () => {
  it('suma en la fila final las denuncias de celdas suprimidas', () => {
    const csv = buildOpenDataCsv(
      [
        { stateCode: '01', offenseCode: 'A', month: '2026-10', status: 'received', count: 4 },
        { stateCode: '02', offenseCode: 'B', month: '2026-10', status: 'routed', count: 5 },
        { stateCode: '03', offenseCode: 'C', month: '2026-11', status: 'received', count: 1 },
      ],
      5,
    );
    expect(csv.split('\r\n')).toEqual([
      'entidad,conducta,mes_recepcion,estatus,denuncias',
      '02,B,2026-10,routed,5',
      'suprimidas,5',
      '',
    ]);
  });
});
