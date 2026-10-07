// Pruebas de la prueba de trabajo del navegador: reto, solución en línea y avisos espaciados.
import { describe, expect, it } from 'vitest';
import { isPowSolution, parsePowHeader } from '@sigilo/core';
import { inlinePowSolver, obtainProof, POW_PROGRESS_INTERVAL_MS } from './proof-of-work.ts';

describe('obtainProof', () => {
  it('pide el reto del propósito, lo resuelve y arma la cabecera', async () => {
    const purposes: string[] = [];
    const messages: string[] = [];
    const header = await obtainProof(
      {
        getPowChallenge: async (purpose) => {
          purposes.push(purpose);
          return { token: 'reto.firma', bits: 6 };
        },
      },
      'evidence',
      inlinePowSolver,
      (message) => messages.push(message),
    );
    expect(purposes).toEqual(['evidence']);
    const parsed = parsePowHeader(header);
    expect(parsed?.token).toBe('reto.firma');
    expect(parsed !== null && isPowSolution(parsed.token, parsed.counter, 6)).toBe(true);
    expect(messages).toHaveLength(1);
  });

  it('con dificultad 0 no avisa y espacia los avisos de avance', async () => {
    const silent: string[] = [];
    await obtainProof(
      { getPowChallenge: async () => ({ token: 'a.b', bits: 0 }) },
      'complaint',
      inlinePowSolver,
      (message) => silent.push(message),
    );
    expect(silent).toEqual([]);

    let clock = 0;
    const messages: string[] = [];
    await obtainProof(
      { getPowChallenge: async () => ({ token: 'a.b', bits: 4 }) },
      'complaint',
      async (_challenge, onProgress) => {
        for (const step of [1000, 1000, 3000, 1000, 5000]) {
          clock += step;
          onProgress(clock);
        }
        return '0';
      },
      (message) => messages.push(message),
      () => clock,
    );
    // Uno al empezar y uno por cada intervalo cumplido (a los 5 s y a los 11 s).
    expect(POW_PROGRESS_INTERVAL_MS).toBe(4000);
    expect(messages).toHaveLength(3);
  });
});
