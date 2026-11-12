// Pruebas de la configuración en tiempo de ejecución: aplica `/config/sigilo.json`, cae al bundle
// con 404 y se detiene ante un archivo inválido.
import { describe, expect, it } from 'vitest';
import { WEB_CONFIG_PATH } from '@sigilo/contracts';
import { createTestDeployment } from '../crypto/test-keys.ts';
import { VENTANILLA_URL } from './app-config.ts';
import { NETWORK_TRUST } from './network-trust.ts';
import { PINNED_KEYS } from './pinned-keys.ts';
import { initRuntimeConfig } from './runtime-config.ts';

function respond(status: number, body: unknown) {
  const calls: string[] = [];
  const fetchImpl = (input: string): Promise<Response> => {
    calls.push(input);
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  };
  return { calls, fetchImpl };
}

describe('configuración en tiempo de ejecución', () => {
  it('con 404 sigue con el bundle', async () => {
    const before = PINNED_KEYS.set.authority.keyId;
    const { calls, fetchImpl } = respond(404, {});
    await expect(initRuntimeConfig(fetchImpl)).resolves.toBe('bundle');
    expect(calls).toEqual([WEB_CONFIG_PATH]);
    expect(PINNED_KEYS.set.authority.keyId).toBe(before);
  });

  it('la página de la web en lugar del archivo (servidor estático) cuenta como sin archivo', async () => {
    const html = (): Promise<Response> =>
      Promise.resolve(
        new Response('<!doctype html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
      );
    await expect(initRuntimeConfig(html)).resolves.toBe('bundle');
  });

  it('un archivo inválido detiene la web y no cambia las llaves', async () => {
    const before = PINNED_KEYS.set.authority.keyId;
    const { fetchImpl } = respond(200, { v: 1, pinnedKeys: { server: {} } });
    await expect(initRuntimeConfig(fetchImpl)).resolves.toBe('invalid');
    expect(PINNED_KEYS.set.authority.keyId).toBe(before);
    const failing = respond(500, {});
    await expect(initRuntimeConfig(failing.fetchImpl)).resolves.toBe('invalid');
  });

  it('aplica las llaves, la raíz y la ventanilla del archivo', async () => {
    const deployment = createTestDeployment();
    const { fetchImpl } = respond(200, {
      v: 1,
      pinnedKeys: deployment.pinned.set,
      networkTrust: null,
      ventanillaUrl: 'https://ventanilla.ejemplo.invalid',
    });
    await expect(initRuntimeConfig(fetchImpl)).resolves.toBe('runtime');
    // Los módulos que importan las llaves ven el valor nuevo (enlace vivo de ES modules).
    expect(PINNED_KEYS.set.authority.keyId).toBe(deployment.pinned.set.authority.keyId);
    expect(NETWORK_TRUST).toBeNull();
    expect(VENTANILLA_URL).toBe('https://ventanilla.ejemplo.invalid');
  });
});
