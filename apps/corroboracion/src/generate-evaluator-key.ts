// Genera `evaluator-key.json` para el evaluador y muestra la llave pública que la operación debe
// publicar en `corroboration.evaluator` del directorio firmado.
// Uso: npm run evaluador:llave -w @sigilo/corroboracion-servicio [-- --epoch 1 --dir ruta]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, toBase64Url, toDayDate } from '@sigilo/core';
import { generateEvaluatorKeyPair } from '@sigilo/corroboracion';
import { DEFAULT_EVALUATOR_DATA_DIR, evaluatorKeysFromFile } from './config.ts';
import type { EvaluatorKeyFile } from './config.ts';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function main(): void {
  const dataDir = argument('--dir') ?? DEFAULT_EVALUATOR_DATA_DIR;
  const epoch = Number(argument('--epoch') ?? '1');
  if (!Number.isInteger(epoch) || epoch < 1)
    throw new Error('--epoch debe ser un entero positivo.');
  const target = join(dataDir, 'evaluator-key.json');
  // Seguridad: nunca se sobrescribe una llave existente; rotar exige una época nueva a propósito.
  if (existsSync(target)) throw new Error(`Ya existe ${target}; no se sobrescribe.`);
  const file: EvaluatorKeyFile = {
    version: 1,
    epoch,
    validFrom: toDayDate(new Date()),
    oprfSecretKey: toBase64Url(generateEvaluatorKeyPair().secretKey),
    signingPrivateKey: toBase64Url(randomBytes(32)),
  };
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(target, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(evaluatorKeysFromFile(file).key, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'No se pudo generar la llave.');
  process.exitCode = 1;
}
