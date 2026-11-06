// Vectores fijos del cálculo de plazos: fines de semana, días inhábiles, meses cortos, años
// bisiestos, rangos y situación del plazo.
import { DEADLINE_RULES } from '@sigilo/contracts';
import type { DeadlineRule } from '@sigilo/contracts';
import { describe, expect, it } from 'vitest';
import { toDayDate, toMexicoCentralDay } from './dates.ts';
import {
  DEFAULT_BUSINESS_CALENDAR,
  addBusinessDays,
  addCalendarMonths,
  addNaturalDays,
  computeDueDate,
  createBusinessCalendar,
  deadlineStatus,
  evaluateDeadline,
  isBusinessDay,
  remainingDays,
  termForRule,
} from './deadlines.ts';

/** Calendario sin días inhábiles: solo salta fines de semana. */
const WEEKENDS_ONLY = createBusinessCalendar({
  nonBusinessDays: [],
  coverage: { from: '2026-01-01', through: '2027-12-31' },
});

function rule(key: string): DeadlineRule {
  const found = DEADLINE_RULES.find((item) => item.key === key);
  if (found === undefined) throw new Error(`Falta la regla ${key}`);
  return found;
}

describe('días hábiles', () => {
  it('distingue fines de semana y el día inhábil del lunes 16 de noviembre de 2026', () => {
    expect(isBusinessDay('2026-11-13', DEFAULT_BUSINESS_CALENDAR)).toBe(true); // viernes
    expect(isBusinessDay('2026-11-14', DEFAULT_BUSINESS_CALENDAR)).toBe(false); // sábado
    expect(isBusinessDay('2026-11-15', DEFAULT_BUSINESS_CALENDAR)).toBe(false); // domingo
    expect(isBusinessDay('2026-11-16', DEFAULT_BUSINESS_CALENDAR)).toBe(false); // Revolución
    expect(isBusinessDay('2026-11-16', WEEKENDS_ONLY)).toBe(true);
    expect(isBusinessDay('2026-11-17', DEFAULT_BUSINESS_CALENDAR)).toBe(true);
  });

  it('cuenta desde el día siguiente y salta fines de semana y días inhábiles', () => {
    // Jueves 5 de noviembre + 10 días hábiles: el lunes 16 es inhábil.
    expect(addBusinessDays('2026-11-05', 10, DEFAULT_BUSINESS_CALENDAR)).toBe('2026-11-20');
    expect(addBusinessDays('2026-11-05', 10, WEEKENDS_ONLY)).toBe('2026-11-19');
    // Viernes 13 + 5: salta el fin de semana y el lunes inhábil.
    expect(addBusinessDays('2026-11-13', 5, DEFAULT_BUSINESS_CALENDAR)).toBe('2026-11-23');
    // Un acto en sábado empieza a contar el lunes.
    expect(addBusinessDays('2026-11-07', 5, DEFAULT_BUSINESS_CALENDAR)).toBe('2026-11-13');
    // Cruza el 25 de diciembre y el 1 de enero.
    expect(addBusinessDays('2026-12-18', 15, DEFAULT_BUSINESS_CALENDAR)).toBe('2027-01-12');
    expect(addBusinessDays('2026-11-05', 0, DEFAULT_BUSINESS_CALENDAR)).toBe('2026-11-05');
  });

  it('acepta días inhábiles propios de una autoridad', () => {
    const withOwnDays = createBusinessCalendar({
      nonBusinessDays: ['2026-11-02', '2026-11-16'],
      coverage: { from: '2026-01-01', through: '2026-12-31' },
    });
    // Viernes 30 de octubre + 1: el lunes 2 de noviembre es inhábil por acuerdo.
    expect(addBusinessDays('2026-10-30', 1, withOwnDays)).toBe('2026-11-03');
    expect(addBusinessDays('2026-10-30', 1, DEFAULT_BUSINESS_CALENDAR)).toBe('2026-11-02');
  });

  it('se niega a calcular fuera del rango que cubre el calendario', () => {
    expect(() => addBusinessDays('2028-12-28', 10, DEFAULT_BUSINESS_CALENDAR)).toThrow(
      'cubre de 2025-01-01 a 2028-12-31',
    );
    expect(() => isBusinessDay('2024-12-31', DEFAULT_BUSINESS_CALENDAR)).toThrow('cubre');
  });

  it('valida el calendario y las fechas', () => {
    expect(() =>
      createBusinessCalendar({
        nonBusinessDays: ['2030-01-01'],
        coverage: { from: '2026-01-01', through: '2026-12-31' },
      }),
    ).toThrow('fuera del rango');
    expect(() =>
      createBusinessCalendar({
        nonBusinessDays: [],
        coverage: { from: '2026-12-31', through: '2026-01-01' },
      }),
    ).toThrow('invertido');
    expect(() => addNaturalDays('2026-02-30', 1)).toThrow('no existe');
    expect(() => addNaturalDays('5/11/2026', 1)).toThrow('AAAA-MM-DD');
    expect(() => addNaturalDays('2026-11-05', -1)).toThrow('entero no negativo');
    expect(() => addNaturalDays('2026-11-05', 1.5)).toThrow('entero no negativo');
  });
});

describe('días naturales, meses y años', () => {
  it('suma días naturales sin recorrer el vencimiento a un día hábil', () => {
    // 30 días naturales desde el 5 de noviembre: vence el sábado 5 de diciembre.
    expect(addNaturalDays('2026-11-05', 30)).toBe('2026-12-05');
    expect(addNaturalDays('2026-12-20', 30)).toBe('2027-01-19');
  });

  it('suma meses de calendario y ajusta al último día de un mes corto', () => {
    expect(addCalendarMonths('2026-01-15', 6)).toBe('2026-07-15');
    expect(addCalendarMonths('2026-08-31', 6)).toBe('2027-02-28');
    expect(addCalendarMonths('2027-08-31', 6)).toBe('2028-02-29');
    expect(addCalendarMonths('2026-10-31', 1)).toBe('2026-11-30');
  });

  it('calcula vencimientos por unidad, incluidos años desde un 29 de febrero', () => {
    expect(computeDueDate('2024-02-29', { unit: 'years', amount: 3 })).toBe('2027-02-28');
    expect(computeDueDate('2026-11-05', { unit: 'years', amount: 7 })).toBe('2033-11-05');
    expect(computeDueDate('2026-11-05', { unit: 'months', amount: 6 })).toBe('2027-05-05');
    expect(computeDueDate('2026-11-05', { unit: 'natural_days', amount: 30 })).toBe('2026-12-05');
    expect(computeDueDate('2026-11-05', { unit: 'business_days', amount: 10 })).toBe('2026-11-20');
    expect(computeDueDate('2026-11-05', { unit: 'business_days', amount: 10 }, WEEKENDS_ONLY)).toBe(
      '2026-11-19',
    );
  });
});

describe('plazos del catálogo', () => {
  it('usa el mínimo del rango o el plazo que fije la autoridad, de 5 a 15 días hábiles', () => {
    const request = rule('information_request');
    expect(termForRule(request)).toEqual({ unit: 'business_days', amount: 5 });
    expect(termForRule(request, 15)).toEqual({ unit: 'business_days', amount: 15 });
    expect(() => termForRule(request, 4)).toThrow('de 5 a 15');
    expect(() => termForRule(request, 16)).toThrow('de 5 a 15');
    expect(() => termForRule(rule('archive_notification'), 11)).toThrow('de 10 a 10');
  });

  it('evalúa la notificación del archivo: en curso, por vencer, último día y vencido', () => {
    // Archivo del jueves 5 de noviembre: vence el viernes 20; aviso con 3 días hábiles.
    expect(evaluateDeadline('archive_notification', '2026-11-05', '2026-11-12')).toEqual({
      dueOn: '2026-11-20',
      status: 'running',
      remaining: 5,
      remainingUnit: 'business_days',
    });
    expect(evaluateDeadline('archive_notification', '2026-11-05', '2026-11-17')).toEqual({
      dueOn: '2026-11-20',
      status: 'due_soon',
      remaining: 3,
      remainingUnit: 'business_days',
    });
    expect(evaluateDeadline('archive_notification', '2026-11-05', '2026-11-20')).toEqual({
      dueOn: '2026-11-20',
      status: 'due_soon',
      remaining: 0,
      remainingUnit: 'business_days',
    });
    expect(evaluateDeadline('archive_notification', '2026-11-05', '2026-11-23')).toEqual({
      dueOn: '2026-11-20',
      status: 'overdue',
      // Del viernes 20 al lunes 23 pasó un solo día hábil, en la misma unidad que el aviso.
      remaining: -1,
      remainingUnit: 'business_days',
    });
  });

  it('evalúa los 30 días naturales para iniciar ante una posible falta grave', () => {
    const evaluation = evaluateDeadline('serious_offense_start', '2026-11-05', '2026-11-30');
    expect(evaluation).toEqual({
      dueOn: '2026-12-05',
      status: 'due_soon',
      remaining: 5,
      remainingUnit: 'natural_days',
    });
    expect(evaluateDeadline('serious_offense_start', '2026-11-05', '2026-11-29').status).toBe(
      'running',
    );
  });

  it('evalúa la prescripción y la caducidad sin depender del calendario de días hábiles', () => {
    expect(evaluateDeadline('prescription_serious', '2026-11-05', '2026-11-05')).toEqual({
      dueOn: '2033-11-05',
      status: 'running',
      remaining: 2557,
      remainingUnit: 'natural_days',
    });
    expect(evaluateDeadline('prescription_non_serious', '2026-11-05', '2029-06-01').status).toBe(
      'due_soon',
    );
    expect(evaluateDeadline('inactivity_expiry', '2026-11-05', '2027-05-06').status).toBe(
      'overdue',
    );
  });

  it('acepta el plazo fijado por la autoridad y un calendario propio', () => {
    expect(
      evaluateDeadline('information_request', '2026-11-05', '2026-11-06', {
        amount: 15,
        calendar: WEEKENDS_ONLY,
      }).dueOn,
    ).toBe('2026-11-26');
    expect(() =>
      evaluateDeadline('no_existe' as 'archive_notification', '2026-11-05', '2026-11-06'),
    ).toThrow('Plazo desconocido');
  });
});

describe('plazos contados en la hora del centro de México', () => {
  it('un archivo acordado el jueves a las 19:00 hora del centro vence según ese día', () => {
    // 12-nov-2026 a las 19:00 hora del centro es 13-nov a la 01:00 en UTC.
    const agreedAt = new Date('2026-11-13T01:00:00Z');
    const start = toMexicoCentralDay(agreedAt);
    expect(start).toBe('2026-11-12');
    expect(evaluateDeadline('archive_notification', start, start).dueOn).toBe('2026-11-27');
    // Con el día UTC el vencimiento se correría al lunes 30.
    expect(evaluateDeadline('archive_notification', toDayDate(agreedAt), start).dueOn).toBe(
      '2026-11-30',
    );
    // A las 18:00 hora del centro del último día (00:00 UTC del siguiente) sigue vigente.
    const lastEvening = toMexicoCentralDay(new Date('2026-11-28T00:00:00Z'));
    expect(evaluateDeadline('archive_notification', start, lastEvening).status).toBe('due_soon');
  });
});

describe('situación del plazo', () => {
  it('cuenta los días que faltan en naturales o en hábiles', () => {
    expect(remainingDays('2026-11-12', '2026-11-20', 'natural_days')).toBe(8);
    expect(remainingDays('2026-11-12', '2026-11-20', 'business_days')).toBe(5);
    expect(remainingDays('2026-11-20', '2026-11-20', 'business_days')).toBe(0);
    expect(remainingDays('2026-11-23', '2026-11-20', 'natural_days')).toBe(-3);
    expect(remainingDays('2026-11-23', '2026-11-20', 'business_days')).toBe(-1);
    expect(remainingDays('2026-11-24', '2026-11-20', 'business_days')).toBe(-2);
  });

  it('pasa de en curso a por vencer y a vencido', () => {
    const warning = { unit: 'business_days', amount: 3 } as const;
    expect(deadlineStatus('2026-11-12', '2026-11-20', warning)).toBe('running');
    expect(deadlineStatus('2026-11-17', '2026-11-20', warning)).toBe('due_soon');
    expect(deadlineStatus('2026-11-20', '2026-11-20', warning)).toBe('due_soon');
    expect(deadlineStatus('2026-11-21', '2026-11-20', warning)).toBe('overdue');
  });
});
