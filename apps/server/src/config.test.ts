// Pruebas de la configuración: token obligatorio, CORS desactivado por omisión, web y HSTS.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createOffsetClock, DEFAULT_DATA_DIR, loadConfig } from './config.ts';

const TOKEN = 'token-de-prueba-0123456789-abcdefghijkl';

describe('loadConfig', () => {
  it('usa valores seguros por omisión: CORS desactivado, sin web ni HSTS', () => {
    expect(loadConfig({ SIGILO_AUTHORITY_TOKEN: TOKEN })).toEqual({
      host: '127.0.0.1',
      port: 8787,
      dataDir: DEFAULT_DATA_DIR,
      authorityToken: TOKEN,
      allowedOrigin: '',
      webDistDir: null,
      hstsMaxAgeSeconds: null,
      testClockFile: null,
    });
  });

  it('exige un token de al menos 32 caracteres', () => {
    expect(() => loadConfig({})).toThrow('SIGILO_AUTHORITY_TOKEN');
    expect(() => loadConfig({ SIGILO_AUTHORITY_TOKEN: 'x'.repeat(31) })).toThrow('32 caracteres');
    expect(loadConfig({ SIGILO_AUTHORITY_TOKEN: 'x'.repeat(32) }).authorityToken).toHaveLength(32);
  });

  it('lee puerto, datos, CORS, web y HSTS configurados', () => {
    const config = loadConfig({
      SIGILO_AUTHORITY_TOKEN: TOKEN,
      SIGILO_PORT: '9000',
      SIGILO_DATA_DIR: '/tmp/sigilo-datos',
      SIGILO_ALLOWED_ORIGIN: 'http://localhost:5173',
      SIGILO_WEB_DIST: '/tmp/sigilo-web',
      SIGILO_HSTS_MAX_AGE: '31536000',
    });
    expect(config).toMatchObject({
      port: 9000,
      dataDir: join('/tmp', 'sigilo-datos'),
      allowedOrigin: 'http://localhost:5173',
      webDistDir: join('/tmp', 'sigilo-web'),
      hstsMaxAgeSeconds: 31536000,
    });
  });

  it('rechaza puertos y HSTS inválidos', () => {
    for (const port of ['0', '70000', 'abc']) {
      expect(() => loadConfig({ SIGILO_AUTHORITY_TOKEN: TOKEN, SIGILO_PORT: port })).toThrow(
        'SIGILO_PORT',
      );
    }
    expect(() => loadConfig({ SIGILO_AUTHORITY_TOKEN: TOKEN, SIGILO_HSTS_MAX_AGE: '-1' })).toThrow(
      'SIGILO_HSTS_MAX_AGE',
    );
  });
});

describe('reloj de pruebas', () => {
  it('se configura con SIGILO_TEST_CLOCK_FILE y nunca en producción', () => {
    const env = { SIGILO_AUTHORITY_TOKEN: TOKEN, SIGILO_TEST_CLOCK_FILE: '/tmp/reloj' };
    expect(loadConfig(env).testClockFile).toBe(join('/tmp', 'reloj'));
    expect(() => loadConfig({ ...env, NODE_ENV: 'production' })).toThrow('solo puede usarse');
  });

  it('suma el desplazamiento del archivo, que se puede cambiar en marcha', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'sigilo-reloj-')), 'offset');
    const now = createOffsetClock(file, () => 1_000);
    expect(now().getTime()).toBe(1_000);
    writeFileSync(file, '86400000\n');
    expect(now().getTime()).toBe(86_401_000);
    writeFileSync(file, '-5');
    expect(() => now()).toThrow('no negativo');
  });
});
