// Pruebas de los textos del semáforo de turnado: nombre, tono con ícono y frases de la bandeja y del
// detalle.
import { describe, expect, it } from 'vitest';
import type { TurnSemaphore } from '@sigilo/contracts';
import {
  TURN_SEMAPHORE_TONES,
  turnSemaphoreName,
  turnSemaphoreSentence,
  turnSemaphoreShort,
} from './turn-semaphore-text.ts';

const BASE: TurnSemaphore = {
  waitingFor: 'routing',
  status: 'a_tiempo',
  sinceOn: '2026-11-10',
  elapsedDays: 0,
  warningOn: '2026-11-11',
  overdueOn: '2026-11-12',
};

describe('semáforo de turnado', () => {
  it('nombra cada situación con un tono distinto (cada tono tiene su ícono)', () => {
    expect(turnSemaphoreName('a_tiempo')).toBe('A tiempo');
    expect(turnSemaphoreName('por_vencer')).toBe('Por vencer');
    expect(turnSemaphoreName('vencida')).toBe('Vencida');
    expect(new Set(Object.values(TURN_SEMAPHORE_TONES)).size).toBe(3);
  });

  it('resume los días que lleva sin turnar o sin aceptar', () => {
    expect(turnSemaphoreShort(BASE)).toBe('Menos de 1 día hábil sin turnar');
    expect(turnSemaphoreShort({ ...BASE, elapsedDays: 1, status: 'por_vencer' })).toBe(
      '1 día hábil sin turnar',
    );
    expect(
      turnSemaphoreShort({ ...BASE, waitingFor: 'acceptance', elapsedDays: 3, status: 'vencida' }),
    ).toBe('3 días hábiles sin aceptar');
  });

  it('explica en el detalle desde cuándo espera y cuándo vence', () => {
    expect(turnSemaphoreSentence(BASE)).toBe(
      'Espera en el buzón general a que la turnen desde el 10 de noviembre de 2026. Pasa a «por vencer» el 11 de noviembre de 2026 y vence el 12 de noviembre de 2026.',
    );
    expect(
      turnSemaphoreSentence({
        ...BASE,
        waitingFor: 'acceptance',
        status: 'vencida',
        elapsedDays: 2,
      }),
    ).toContain('lleva 2 días hábiles y venció el 12 de noviembre de 2026. La supervisión');
  });
});
