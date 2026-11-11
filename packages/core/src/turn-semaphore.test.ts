// Vectores del semáforo de turnado: días hábiles, fines de semana, días inhábiles y estados que no
// esperan turno ni aceptación.
import { describe, expect, it } from 'vitest';
import { createBusinessCalendar } from './deadlines.ts';
import { evaluateTurnSemaphore } from './turn-semaphore.ts';

describe('semáforo de turnado', () => {
  it('sin turnar: a tiempo el mismo día, por vencer al día hábil y vencida al segundo', () => {
    // Martes 10 de noviembre de 2026.
    expect(evaluateTurnSemaphore('received_in_inbox', '2026-11-10', '2026-11-10')).toEqual({
      waitingFor: 'routing',
      status: 'a_tiempo',
      sinceOn: '2026-11-10',
      elapsedDays: 0,
      warningOn: '2026-11-11',
      overdueOn: '2026-11-12',
    });
    expect(evaluateTurnSemaphore('received_in_inbox', '2026-11-10', '2026-11-11')?.status).toBe(
      'por_vencer',
    );
    expect(evaluateTurnSemaphore('returned_to_inbox', '2026-11-10', '2026-11-12')?.status).toBe(
      'vencida',
    );
  });

  it('turnada sin aceptar espera aceptación', () => {
    const semaphore = evaluateTurnSemaphore('reassigned', '2026-11-10', '2026-11-20');
    expect(semaphore?.waitingFor).toBe('acceptance');
    expect(semaphore?.status).toBe('vencida');
    expect(evaluateTurnSemaphore('routed', '2026-11-10', '2026-11-10')?.waitingFor).toBe(
      'acceptance',
    );
  });

  it('cuenta días hábiles: el fin de semana y el 16 de noviembre no cuentan', () => {
    // Viernes 13: sábado, domingo y lunes 16 (inhábil) siguen a tiempo; martes 17, por vencer.
    expect(evaluateTurnSemaphore('received_in_inbox', '2026-11-13', '2026-11-16')?.status).toBe(
      'a_tiempo',
    );
    const tuesday = evaluateTurnSemaphore('received_in_inbox', '2026-11-13', '2026-11-17');
    expect(tuesday?.status).toBe('por_vencer');
    expect(tuesday?.overdueOn).toBe('2026-11-18');
    const weekendsOnly = createBusinessCalendar({
      nonBusinessDays: [],
      coverage: { from: '2026-01-01', through: '2026-12-31' },
    });
    expect(
      evaluateTurnSemaphore('received_in_inbox', '2026-11-13', '2026-11-16', weekendsOnly)?.status,
    ).toBe('por_vencer');
  });

  it('no aplica a las denuncias aceptadas ni cerradas', () => {
    expect(evaluateTurnSemaphore('accepted', '2026-11-10', '2026-12-10')).toBeNull();
    expect(evaluateTurnSemaphore('closed', '2026-11-10', '2026-12-10')).toBeNull();
  });
});
