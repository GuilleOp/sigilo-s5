// Pruebas del redondeo de fechas en UTC.
import { DayDateSchema, HourDateSchema } from '@sigilo/contracts';
import { describe, expect, it } from 'vitest';
import { toDayDate, toHourDate } from './dates.ts';

describe('fechas redondeadas', () => {
  it('redondea al día y a la hora en UTC', () => {
    const date = new Date('2026-10-06T23:59:59.999-06:00');
    expect(toDayDate(date)).toBe('2026-10-07');
    expect(toHourDate(date)).toBe('2026-10-07T05:00Z');
    expect(DayDateSchema.safeParse(toDayDate(date)).success).toBe(true);
    expect(HourDateSchema.safeParse(toHourDate(date)).success).toBe(true);
  });

  it('rechaza fechas inválidas', () => {
    expect(() => toDayDate(new Date('no es fecha'))).toThrow('Fecha inválida');
    expect(() => toHourDate(new Date(Number.NaN))).toThrow('Fecha inválida');
  });
});
