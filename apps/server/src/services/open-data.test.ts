// Pruebas unitarias del CSV: escape de campos, redondeo, supresión y mes vigente.
import { describe, expect, it } from 'vitest';
import {
  buildOpenDataCsv,
  currentMonth,
  escapeCsvField,
  hmacNoiseUnit,
  newNoiseSeed,
  randomRound,
} from './open-data.ts';

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

describe('randomRound y currentMonth', () => {
  it('sube con probabilidad proporcional al residuo y respeta los múltiplos exactos', () => {
    expect(randomRound(5, 5, 0.99)).toBe(5);
    expect(randomRound(0, 5, 0)).toBe(0);
    expect(randomRound(4, 5, 0.79)).toBe(5);
    expect(randomRound(4, 5, 0.8)).toBe(0);
    expect(randomRound(12, 5, 0.39)).toBe(15);
    expect(randomRound(12, 5, 0.4)).toBe(10);
  });

  it('es insesgado con la semilla HMAC y estable para la misma semilla', () => {
    const seed = newNoiseSeed();
    let total = 0;
    for (let index = 0; index < 2000; index += 1) {
      total += randomRound(3, 5, hmacNoiseUnit(seed, `celda:${index}`));
    }
    // Esperado: 3 por celda; con 2000 muestras el promedio queda muy cerca.
    expect(total / 2000).toBeGreaterThan(2.7);
    expect(total / 2000).toBeLessThan(3.3);
    expect(hmacNoiseUnit(seed, 'x')).toBe(hmacNoiseUnit(seed, 'x'));
    expect(hmacNoiseUnit(seed, 'x')).not.toBe(hmacNoiseUnit(newNoiseSeed(), 'x'));
  });

  it('toma el mes UTC', () => {
    expect(currentMonth(new Date('2026-11-01T00:30:00Z'))).toBe('2026-11');
    expect(currentMonth(new Date('2026-10-31T23:59:59Z'))).toBe('2026-10');
  });
});

describe('buildOpenDataCsv', () => {
  const cells = [
    { stateCode: '01', offenseCode: 'LGRA-52', month: '2026-10', status: 'received', count: 4 },
    { stateCode: '02', offenseCode: 'LGRA-53', month: '2026-10', status: 'routed', count: 7 },
    { stateCode: '03', offenseCode: 'LGRA-54', month: '2026-10', status: 'received', count: 10 },
  ] as const;
  const months = [
    { month: '2026-09', cells: [{ ...cells[0], month: '2026-09', count: 3 }], noiseSeed: 'AA' },
    { month: '2026-10', cells, noiseSeed: 'AA' },
  ];

  it('redondea hacia abajo con ruido alto: suprime lo que llega a 0 y suma lo suprimido', () => {
    const csv = buildOpenDataCsv(months, POLICY, () => 0.99);
    const lines = csv.split('\r\n');
    expect(lines).toEqual([
      'entidad,conducta,mes_recepcion,estatus,denuncias',
      '02,LGRA-53,2026-10,routed,5',
      '03,LGRA-54,2026-10,received,10',
      // Septiembre: 3 suprimidas bajan a 0; octubre: 4 suprimidas bajan a 0.
      'suprimidas,,,,0',
      '',
    ]);
    const header = lines[0]?.split(',') ?? [];
    for (const line of lines.slice(1, -1)) expect(line.split(',')).toHaveLength(header.length);
  });

  it('redondea hacia arriba con ruido bajo: una celda de 4 se publica como 5', () => {
    const csv = buildOpenDataCsv(months, POLICY, () => 0);
    expect(csv.split('\r\n')).toEqual([
      'entidad,conducta,mes_recepcion,estatus,denuncias',
      '01,LGRA-52,2026-09,received,5',
      '01,LGRA-52,2026-10,received,5',
      '02,LGRA-53,2026-10,routed,10',
      '03,LGRA-54,2026-10,received,10',
      'suprimidas,,,,0',
      '',
    ]);
  });

  it('una celda de 4 y una de 5 publican lo mismo con probabilidad positiva', () => {
    let both = 0;
    for (let index = 0; index < 200; index += 1) {
      const seed = newNoiseSeed();
      const four = buildOpenDataCsv(
        [{ month: '2026-10', cells: [cells[0]], noiseSeed: seed }],
        POLICY,
      );
      if (four.includes('01,LGRA-52,2026-10,received,5')) both += 1;
    }
    // Con 4 denuncias se publica 5 en torno al 80 % de las semillas; con 5, siempre.
    expect(both).toBeGreaterThan(120);
    expect(both).toBeLessThan(200);
  });
});
