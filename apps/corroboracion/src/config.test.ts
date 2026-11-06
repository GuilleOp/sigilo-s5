// Pruebas de la configuración y de la lectura de llaves y directorio de los servicios.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { toBase64Url } from '@sigilo/core';
import { generateEvaluatorKeyPair } from '@sigilo/corroboracion';
import {
  buildDemoDirectory,
  cosignDirectory,
  DEMO_WITNESS_IDS,
  demoWitnessPrivateKey,
  generateDemoNetworkKeys,
  signDirectory,
  trustAnchorFromDirectory,
} from '@sigilo/red';
import {
  evaluatorKeysFromFile,
  loadEvaluatorConfig,
  loadEvaluatorKeys,
  loadIndexConfig,
  loadVerifiedDirectory,
} from './config.ts';

describe('configuración de los servicios', () => {
  it('usa valores seguros por omisión y valida el entorno', () => {
    const evaluator = loadEvaluatorConfig({});
    expect(evaluator.host).toBe('127.0.0.1');
    expect(evaluator.port).toBe(8791);
    expect(evaluator.powBits).toBe(18);
    expect(evaluator.maxDailyEvaluations).toBeNull();
    expect(loadIndexConfig({}).port).toBe(8792);
    expect(loadEvaluatorConfig({ SIGILO_EVALUATOR_MAX_DAILY: '500' }).maxDailyEvaluations).toBe(
      500,
    );
    expect(() => loadEvaluatorConfig({ SIGILO_EVALUATOR_POW_BITS: '40' })).toThrow('no puede');
    expect(() => loadEvaluatorConfig({ SIGILO_EVALUATOR_HOST: '10.0.0.1' })).toThrow('HOST');
    expect(() => loadIndexConfig({ SIGILO_INDEX_PORT: '70000' })).toThrow('puerto');
    expect(() => loadIndexConfig({ SIGILO_INDEX_PORT: 'abc' })).toThrow('entero');
  });

  it('lee la llave del evaluador y recalcula la pública desde la privada', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sigilo-llave-'));
    const pair = generateEvaluatorKeyPair();
    const file = {
      version: 1,
      epoch: 2,
      validFrom: '2026-11-09',
      oprfSecretKey: toBase64Url(pair.secretKey),
      signingPrivateKey: toBase64Url(new Uint8Array(32).fill(3)),
    };
    writeFileSync(join(dir, 'evaluator-key.json'), JSON.stringify(file));
    const keys = loadEvaluatorKeys(dir);
    expect(keys.keyPair.publicKey).toEqual(pair.publicKey);
    expect(keys.key.epoch).toBe(2);
    expect(() =>
      evaluatorKeysFromFile({ ...file, version: 1, oprfSecretKey: toBase64Url(new Uint8Array(8)) }),
    ).toThrow('32 bytes');
    expect(() => loadEvaluatorKeys(mkdtempSync(join(tmpdir(), 'sigilo-vacio-')))).toThrow(
      'No se pudo leer',
    );
  });

  it('acepta solo un directorio firmado y cofirmado contra la raíz de confianza', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sigilo-directorio-'));
    const keys = generateDemoNetworkKeys();
    const directory = buildDemoDirectory(keys, {
      issuedOn: '2026-11-09',
      baseUrls: {
        'node.queretaro': 'http://nodo-queretaro.invalid',
        'node.federal': 'http://nodo-federal.invalid',
      },
    });
    let signed = signDirectory(directory, keys.operator.privateKey);
    writeFileSync(join(dir, 'directory.json'), JSON.stringify(signed));
    writeFileSync(join(dir, 'trust.json'), JSON.stringify(trustAnchorFromDirectory(directory)));
    expect(() => loadVerifiedDirectory(dir)).toThrow('witnesses');
    for (const id of DEMO_WITNESS_IDS) {
      signed = cosignDirectory(signed, id, demoWitnessPrivateKey(keys, id));
    }
    writeFileSync(join(dir, 'directory.json'), JSON.stringify(signed));
    expect(loadVerifiedDirectory(dir).serial).toBe(1);
  });
});
