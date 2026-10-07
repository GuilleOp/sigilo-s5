// Pruebas de digestBlob con vectores conocidos de SHA-256.
import { describe, expect, it } from 'vitest';
import { digestBlob } from './digest.ts';

describe('digestBlob', () => {
  it('calcula el SHA-256 de un Blob vacío', async () => {
    await expect(digestBlob(new Blob([]))).resolves.toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('calcula el SHA-256 de «abc» en hexadecimal en minúsculas', async () => {
    await expect(digestBlob(new Blob(['abc']))).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('cambia con un solo byte distinto', async () => {
    const a = await digestBlob(new Blob([new Uint8Array([0, 1, 2])]));
    const b = await digestBlob(new Blob([new Uint8Array([0, 1, 3])]));
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/u);
  });
});
