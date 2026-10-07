// Pruebas de la prueba de trabajo del navegador: reto, solución en línea, avisos espaciados,
// estimado de espera y un reintento ante un reto rechazado.
import { describe, expect, it } from 'vitest';
import { isPowSolution, parsePowHeader } from '@sigilo/core';
import { ApiRequestError } from '../services/api-client.ts';
import {
  createProofProvider,
  describePowWait,
  inlinePowSolver,
  obtainProof,
  POW_PROGRESS_INTERVAL_MS,
  sendWithProof,
} from './proof-of-work.ts';

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
      'message',
      inlinePowSolver,
      (message) => messages.push(message),
    );
    expect(purposes).toEqual(['message']);
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

describe('describePowWait', () => {
  it('estima en lenguaje claro la espera de un celular sencillo', () => {
    expect(describePowWait(8)).toBe('Puede tardar unos segundos.');
    // 18 bits: percentil 95 de unos 16 s.
    expect(describePowWait(18)).toBe('En un celular sencillo puede tardar hasta 20 segundos.');
    // 20 bits: unos 63 s.
    expect(describePowWait(20)).toBe('En un celular sencillo puede tardar hasta 2 minutos.');
    expect(describePowWait(19)).toBe('En un celular sencillo puede tardar hasta 40 segundos.');
    expect(describePowWait(22)).toBe('En un celular sencillo puede tardar hasta 5 minutos.');
  });
});

describe('sendWithProof', () => {
  function provider() {
    let issued = 0;
    const proofs = createProofProvider(
      {
        getPowChallenge: async () => {
          issued += 1;
          return { token: `reto-${issued}.firma`, bits: 0 };
        },
      },
      'complaint',
      inlinePowSolver,
      () => undefined,
    );
    return { proofs, issued: () => issued };
  }

  it('reutiliza la misma prueba entre envíos y la renueva una vez si el servidor la rechaza', async () => {
    const { proofs, issued } = provider();
    const used: string[] = [];
    await sendWithProof(proofs, async (proof) => used.push(proof));
    await sendWithProof(proofs, async (proof) => used.push(proof));
    expect(issued()).toBe(1);
    expect(new Set(used).size).toBe(1);

    let attempts = 0;
    const result = await sendWithProof(proofs, async (proof) => {
      attempts += 1;
      if (attempts === 1) throw new ApiRequestError('proof_required', 428);
      return proof;
    });
    expect(attempts).toBe(2);
    expect(issued()).toBe(2);
    expect(parsePowHeader(result)?.token).toBe('reto-2.firma');
    // La renovada queda como vigente para los envíos siguientes.
    await sendWithProof(proofs, async (proof) => used.push(proof));
    expect(used.at(-1)).toBe(result);
  });

  it('reintenta una sola vez y no reintenta otros errores', async () => {
    const { proofs, issued } = provider();
    await expect(
      sendWithProof(proofs, async () => {
        throw new ApiRequestError('proof_required', 428);
      }),
    ).rejects.toMatchObject({ code: 'proof_required' });
    expect(issued()).toBe(2);
    let attempts = 0;
    await expect(
      sendWithProof(proofs, async () => {
        attempts += 1;
        throw new ApiRequestError('storage_full', 507);
      }),
    ).rejects.toMatchObject({ code: 'storage_full' });
    expect(attempts).toBe(1);
  });
});
