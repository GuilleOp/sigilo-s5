// Pruebas de la lógica pura de la interfaz: asesor, recibo, folio, texto, CSV y formatos.
import { describe, expect, it } from 'vitest';
import { reviewText } from '@sigilo/huella';
import { adviseReporter } from './advisor.ts';
import { parseCsv, parseOpenDataCsv } from './csv.ts';
import { isCompleteFolio, normalizeFolioInput } from './folio-input.ts';
import {
  STATUS_HINTS,
  STATUS_LABELS,
  formatDayDate,
  formatHourDate,
  formatMonthPeriod,
  formatShortDate,
} from './format.ts';
import { detectPersonalDataRequest } from './personal-data-request.ts';
import {
  matchesReceiptWord,
  matchesWord,
  pickConfirmationPositions,
} from './receipt-confirmation.ts';
import { receiptSpeechParts, speechChunks, spellOut } from './local-speech.ts';
import { distributePastedWords, resolvedWord, wordStatus } from './receipt-words.ts';
import { segmentText } from './text-segments.ts';

describe('adviseReporter', () => {
  it('recomienda identidad sellada si se piden medidas de protección', () => {
    const result = adviseReporter({ protection: 'yes', network: 'work', device: 'work' });
    expect(result.recommendedMode).toBe('sealed');
    expect(result.tips.map((tip) => tip.id)).toEqual(
      expect.arrayContaining(['protection', 'network-work', 'device-work']),
    );
    expect(
      result.tips.every(
        (tip, index, all) =>
          index === 0 || all[index - 1]?.priority === 'important' || tip.priority === 'useful',
      ),
    ).toBe(true);
  });

  it('recomienda el modo anónimo por omisión y avisa si solo la persona conoce los hechos', () => {
    const result = adviseReporter({ witnesses: 'only-me' });
    expect(result.recommendedMode).toBe('anonymous');
    expect(result.tips[0]?.id).toBe('only-me');
    expect(adviseReporter({}).tips).toEqual([]);
  });
});

describe('confirmación del recibo', () => {
  it('elige dos posiciones distintas y ordenadas', () => {
    for (let attempt = 0; attempt < 200; attempt++) {
      const [first, second] = pickConfirmationPositions(8);
      expect(first).toBeLessThan(second);
      expect(second).toBeLessThan(8);
    }
  });

  it('descarta valores sesgados y desplaza la segunda posición', () => {
    const values = [0xffff_ffff, 3, 3];
    const random = (buffer: Uint32Array<ArrayBuffer>) => {
      buffer[0] = values.shift() ?? 0;
      return buffer;
    };
    expect(pickConfirmationPositions(7, random)).toEqual([3, 4]);
  });

  it('compara sin acentos ni mayúsculas', () => {
    expect(matchesWord(' ABEJA ', 'abeja')).toBe(true);
    expect(matchesWord('arbol', 'árbol')).toBe(true);
    expect(matchesWord('', '')).toBe(false);
  });

  it('acepta las primeras 4 letras, igual que el seguimiento', () => {
    expect(matchesReceiptWord('abej', 'abeja')).toBe(true);
    expect(matchesReceiptWord('ABEJA', 'abeja')).toBe(true);
    expect(matchesReceiptWord('abie', 'abeja')).toBe(false);
    expect(matchesReceiptWord('', 'abeja')).toBe(false);
  });
});

describe('palabras del recibo', () => {
  it('reconoce palabras exactas, prefijos únicos y desconocidas', () => {
    expect(wordStatus('')).toEqual({ kind: 'empty' });
    expect(wordStatus('abeja')).toEqual({ kind: 'exact', word: 'abeja' });
    expect(resolvedWord('abej')).toBe('abeja');
    expect(wordStatus('ab').kind).toBe('several');
    expect(wordStatus('qqqq')).toEqual({ kind: 'unknown' });
  });

  it('reparte palabras pegadas en una sola casilla', () => {
    const current = Array.from({ length: 8 }, () => '');
    expect(distributePastedWords(current, 0, 'abeja')).toBeNull();
    const next = distributePastedWords(current, 6, '1. abeja 2. abierto 3. abismo');
    expect(next?.slice(6)).toEqual(['abeja', 'abierto']);
  });
});

describe('lectura en voz alta del recibo', () => {
  it('lee el folio por grupos y deletrea cada palabra', () => {
    expect(spellOut('abc')).toBe('a, b, c');
    const parts = receiptSpeechParts('ABCD-EFGH-JKMN', ['abeja']);
    expect(parts[1]).toBe('Grupo 1: A, B, C, D.');
    expect(parts.at(-1)).toBe('Palabra 1: abeja. Se escribe: a, b, e, j, a.');
  });
});

describe('folio', () => {
  it('normaliza mayúsculas, guiones y letras confundibles', () => {
    expect(normalizeFolioInput('abcd efgh jkmn')).toBe('ABCD-EFGH-JKMN');
    expect(normalizeFolioInput('o1il-0000-0000')).toBe('0111-0000-0000');
    expect(isCompleteFolio('abcd-efgh-jkm')).toBe(false);
    expect(isCompleteFolio('abcdefghjkmn')).toBe(true);
  });
});

describe('segmentText', () => {
  it('divide el texto alrededor de los hallazgos del revisor', () => {
    const text = 'Lo vi el 3 de marzo de 2026 y soy la única auxiliar contable.';
    const findings = reviewText(text);
    const segments = segmentText(text, findings);
    expect(segments.map((segment) => segment.text).join('')).toBe(text);
    expect(segments.filter((segment) => segment.kind === 'finding').length).toBe(findings.length);
    expect(findings.length).toBeGreaterThan(0);
  });
});

describe('detectPersonalDataRequest', () => {
  it('avisa si la autoridad pide nombre o teléfono', () => {
    expect(detectPersonalDataRequest('¿Nos podría dar su nombre y un teléfono?')).toEqual([
      'tu nombre',
      'un teléfono',
    ]);
    expect(detectPersonalDataRequest('¿Recuerda el número de contrato?')).toEqual([]);
  });
});

describe('CSV de datos abiertos', () => {
  it('respeta comillas y separa la fila de supresión', () => {
    expect(parseCsv('a,"b,""c"""\r\n1,2\r\n')).toEqual([
      ['a', 'b,"c"'],
      ['1', '2'],
    ]);
    const table = parseOpenDataCsv(
      'entidad,conducta,mes_recepcion,estatus,denuncias\r\n22,LGRA-52,2026-09,received,10\r\nsuprimidas,,,,5\r\n',
    );
    expect(table.headers).toHaveLength(5);
    expect(table.rows).toEqual([['22', 'LGRA-52', '2026-09', 'received', '10']]);
    expect(table.suppressed).toBe(5);
    // Una fila con otro número de columnas no se toma como la de supresión.
    expect(
      parseOpenDataCsv('entidad,conducta,mes_recepcion,estatus,denuncias\r\nsuprimidas,5\r\n')
        .suppressed,
    ).toBe(0);
  });
});

describe('formatos', () => {
  it('toma el nombre y la explicación de cada estatus del catálogo del trámite', () => {
    expect(Object.keys(STATUS_LABELS)).toHaveLength(7);
    expect(STATUS_LABELS.investigating).toBe('En investigación');
    expect(STATUS_LABELS.routed).toBe('Turnada a la autoridad competente');
    expect(STATUS_HINTS.archived).toBe(
      'Se cerró por ahora; puede reabrirse si hay nuevos elementos.',
    );
  });

  it('formatea fechas sin depender de la zona horaria', () => {
    expect(formatDayDate('2026-10-01')).toBe('1 de octubre de 2026');
    expect(formatHourDate('2026-10-01T09:00Z')).toBe(
      '1 de octubre de 2026, cerca de las 3:00 (hora del centro de México)',
    );
    // Antes de la medianoche del centro de México la fecha es la del día anterior.
    expect(formatHourDate('2026-10-02T02:00Z')).toBe(
      '1 de octubre de 2026, cerca de las 20:00 (hora del centro de México)',
    );
    expect(formatHourDate('2026-10-01')).toBe('2026-10-01');
    expect(formatMonthPeriod('2026-03')).toBe('marzo de 2026');
    expect(formatDayDate('otra')).toBe('otra');
    expect(formatShortDate('2026-11-14')).toBe('14 nov 2026');
    expect(formatShortDate('2033-03-01')).toBe('1 mar 2033');
    expect(formatShortDate('otra')).toBe('otra');
  });
});

describe('speechChunks', () => {
  it('corta en fin de oración y de línea, sin frases vacías', () => {
    expect(speechChunks('Hola.  ¿Cómo estás?\n\nBien: gracias.')).toEqual([
      'Hola.',
      '¿Cómo estás?',
      'Bien: gracias.',
    ]);
    expect(speechChunks('   ')).toEqual([]);
  });

  it('parte entre palabras una oración más larga que el límite', () => {
    const chunks = speechChunks('uno dos tres cuatro cinco seis', 10);
    expect(chunks).toEqual(['uno dos', 'tres', 'cuatro', 'cinco seis']);
    expect(chunks.every((chunk) => chunk.length <= 10)).toBe(true);
  });
});
