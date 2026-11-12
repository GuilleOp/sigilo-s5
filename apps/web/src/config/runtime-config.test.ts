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

  it('pide el archivo sin caché, sin credenciales y sin seguir redirecciones', async () => {
    const seen: (RequestInit | undefined)[] = [];
    await initRuntimeConfig((_input, init) => {
      seen.push(init);
      return Promise.resolve(new Response('', { status: 404 }));
    });
    expect(seen).toEqual([{ cache: 'no-store', credentials: 'omit', redirect: 'error' }]);
  });

  it('sin red o con una redirección (que fetch rechaza) sigue con el bundle', async () => {
    const before = PINNED_KEYS.set.authority.keyId;
    const failing = (): Promise<Response> => Promise.reject(new TypeError('Failed to fetch'));
    await expect(initRuntimeConfig(failing)).resolves.toBe('bundle');
    expect(PINNED_KEYS.set.authority.keyId).toBe(before);
  });

  it('un identificador de llave que no corresponde a su llave detiene la web', async () => {
    const before = PINNED_KEYS.set.authority.keyId;
    const deployment = createTestDeployment();
    const other = createTestDeployment();
    const swapped = {
      ...deployment.pinned.set,
      authority: { ...deployment.pinned.set.authority, keyId: other.pinned.set.authority.keyId },
    };
    const { fetchImpl } = respond(200, {
      v: 1,
      pinnedKeys: swapped,
      networkTrust: null,
      ventanillaUrl: null,
    });
    await expect(initRuntimeConfig(fetchImpl)).resolves.toBe('invalid');
    expect(PINNED_KEYS.set.authority.keyId).toBe(before);
  });

  it('JSON roto, campos de más u otra versión: inválido; 401, 403 y 503 también', async () => {
    const deployment = createTestDeployment();
    const valid = {
      v: 1,
      pinnedKeys: deployment.pinned.set,
      networkTrust: null,
      ventanillaUrl: null,
    };
    const broken = (): Promise<Response> =>
      Promise.resolve(new Response('{"v":1,', { headers: { 'Content-Type': 'application/json' } }));
    await expect(initRuntimeConfig(broken)).resolves.toBe('invalid');
    for (const body of [{ ...valid, extra: true }, { ...valid, v: 2 }, [], null]) {
      await expect(initRuntimeConfig(respond(200, body).fetchImpl)).resolves.toBe('invalid');
    }
    for (const status of [401, 403, 503]) {
      await expect(initRuntimeConfig(respond(status, valid).fetchImpl)).resolves.toBe('invalid');
    }
  });

  it('acepta application/json con charset y no usa una ventanilla sin https', async () => {
    const deployment = createTestDeployment();
    const before = VENTANILLA_URL;
    const withCharset = (): Promise<Response> =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            v: 1,
            pinnedKeys: deployment.pinned.set,
            networkTrust: null,
            ventanillaUrl: 'http://ventanilla.ejemplo.invalid',
          }),
          { headers: { 'Content-Type': 'application/json; charset=utf-8' } },
        ),
      );
    await expect(initRuntimeConfig(withCharset)).resolves.toBe('runtime');
    expect(PINNED_KEYS.set.server.keyId).toBe(deployment.pinned.set.server.keyId);
    expect(VENTANILLA_URL).not.toBe('http://ventanilla.ejemplo.invalid');
    expect(VENTANILLA_URL).toBe(before);
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
