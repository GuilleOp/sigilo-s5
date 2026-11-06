// Pruebas del redondeo de fechas en UTC.
import { DayDateSchema, HourDateSchema } from '@sigilo/contracts';
import { describe, expect, it } from 'vitest';
import { toDayDate, toHourDate, toMexicoCentralDay } from './dates.ts';

describe('fechas redondeadas', () => {
  it('redondea al día y a la hora en UTC', () => {
    const date = new Date('2026-10-06T23:59:59.999-06:00');
    expect(toDayDate(date)).toBe('2026-10-07');
    expect(toHourDate(date)).toBe('2026-10-07T05:00Z');
    expect(DayDateSchema.safeParse(toDayDate(date)).success).toBe(true);
    expect(HourDateSchema.safeParse(toHourDate(date)).success).toBe(true);
  });

  it('da el día civil en la hora del centro de México, distinto del día UTC', () => {
    // Jueves 12 de noviembre de 2026 a las 19:00 hora del centro: en UTC ya es viernes.
    const evening = new Date('2026-11-13T01:00:00Z');
    expect(toDayDate(evening)).toBe('2026-11-13');
    expect(toMexicoCentralDay(evening)).toBe('2026-11-12');
    expect(toMexicoCentralDay(new Date('2026-11-12T06:00:00Z'))).toBe('2026-11-12');
    expect(toMexicoCentralDay(new Date('2026-11-12T05:59:59Z'))).toBe('2026-11-11');
    expect(() => toMexicoCentralDay(new Date(Number.NaN))).toThrow('Fecha inválida');
  });

  it('rechaza fechas inválidas', () => {
    expect(() => toDayDate(new Date('no es fecha'))).toThrow('Fecha inválida');
    expect(() => toHourDate(new Date(Number.NaN))).toThrow('Fecha inválida');
  });
});
