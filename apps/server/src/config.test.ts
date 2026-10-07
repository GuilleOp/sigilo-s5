// Pruebas de la configuración: token obligatorio, CORS desactivado por omisión, web y HSTS.
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createOffsetClock,
  DEFAULT_DATA_DIR,
  DEFAULT_POW_BITS,
  loadConfig,
  MAX_TEST_CLOCK_OFFSET_MS,
} from './config.ts';
import { DEFAULT_EVIDENCE_QUOTA_BYTES } from './services/evidence-service.ts';

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
      powBits: DEFAULT_POW_BITS,
      evidenceQuotaBytes: DEFAULT_EVIDENCE_QUOTA_BYTES,
      untrackedRetentionDays: 0,
      requestLogMode: 'aggregate',
    });
  });

  it('lee la prueba de trabajo, la cuota, la retención y el registro', () => {
    const config = loadConfig({
      SIGILO_AUTHORITY_TOKEN: TOKEN,
      SIGILO_POW_BITS: '0',
      SIGILO_EVIDENCE_QUOTA_BYTES: '1048576',
      SIGILO_UNTRACKED_RETENTION_DAYS: '90',
      SIGILO_REQUEST_LOG: 'off',
    });
    expect(config).toMatchObject({
      powBits: 0,
      evidenceQuotaBytes: 1_048_576,
      untrackedRetentionDays: 90,
      requestLogMode: 'off',
    });
    const env = { SIGILO_AUTHORITY_TOKEN: TOKEN };
    expect(() => loadConfig({ ...env, SIGILO_POW_BITS: '33' })).toThrow('SIGILO_POW_BITS');
    expect(() => loadConfig({ ...env, SIGILO_EVIDENCE_QUOTA_BYTES: '-1' })).toThrow('QUOTA');
    expect(() => loadConfig({ ...env, SIGILO_REQUEST_LOG: 'todo' })).toThrow('SIGILO_REQUEST_LOG');
    expect(loadConfig({ ...env, SIGILO_REQUEST_LOG: 'requests' }).requestLogMode).toBe('requests');
    expect(() =>
      loadConfig({ ...env, SIGILO_REQUEST_LOG: 'requests', NODE_ENV: 'production' }),
    ).toThrow('desarrollo');
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
  function clockFile(contents?: string): string {
    const file = join(mkdtempSync(join(tmpdir(), 'sigilo-reloj-')), 'offset');
    if (contents !== undefined) writeFileSync(file, contents, { mode: 0o600 });
    return file;
  }

  it('solo se acepta con SIGILO_E2E=1 o NODE_ENV=test, nunca en producción', () => {
    const file = clockFile();
    const env = { SIGILO_AUTHORITY_TOKEN: TOKEN, SIGILO_TEST_CLOCK_FILE: file };
    expect(() => loadConfig(env)).toThrow('solo puede usarse en pruebas');
    expect(() => loadConfig({ ...env, NODE_ENV: 'development' })).toThrow('solo puede usarse');
    expect(loadConfig({ ...env, SIGILO_E2E: '1' }).testClockFile).toBe(file);
    expect(loadConfig({ ...env, NODE_ENV: 'test' }).testClockFile).toBe(file);
    expect(() => loadConfig({ ...env, SIGILO_E2E: '1', NODE_ENV: 'production' })).toThrow(
      'solo puede usarse',
    );
  });

  it('rechaza un archivo escribible por el grupo o por otros', () => {
    const file = clockFile('0');
    chmodSync(file, 0o620);
    const env = { SIGILO_AUTHORITY_TOKEN: TOKEN, SIGILO_TEST_CLOCK_FILE: file, SIGILO_E2E: '1' };
    expect(() => loadConfig(env)).toThrow('escribible');
    chmodSync(file, 0o602);
    expect(() => createOffsetClock(file)()).toThrow('escribible');
    chmodSync(file, 0o644);
    expect(loadConfig(env).testClockFile).toBe(file);
  });

  it('suma el desplazamiento del archivo, que se puede cambiar en marcha', () => {
    const file = clockFile();
    const now = createOffsetClock(file, () => 1_000);
    expect(now().getTime()).toBe(1_000);
    writeFileSync(file, '86400000\n', { mode: 0o600 });
    expect(now().getTime()).toBe(86_401_000);
    writeFileSync(file, '-5');
    expect(() => now()).toThrow('no negativo');
  });

  it('rechaza desfases fuera del rango permitido', () => {
    const file = clockFile(String(MAX_TEST_CLOCK_OFFSET_MS));
    const now = createOffsetClock(file, () => 0);
    expect(now().getTime()).toBe(MAX_TEST_CLOCK_OFFSET_MS);
    writeFileSync(file, String(MAX_TEST_CLOCK_OFFSET_MS + 1));
    expect(() => now()).toThrow('fuera del rango');
  });
});
