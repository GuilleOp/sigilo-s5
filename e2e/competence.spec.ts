// «Competencia por dependencia»: la operación de un nodo estatal en la red (Querétaro de la
// demostración) asigna el órgano interno de control de una dependencia del catálogo de la PDN,
// revisa los cambios y firma una versión nueva de la tabla de funciones. El servidor E2E principal
// es de nodo único, así que esta prueba levanta un nodo propio en la red (otro puerto, mismas
// llaves fijadas en la web, directorio sintético firmado y cofirmado) que sirve la web construida.
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { fromBase64Url, keyIdFor, randomBytes, toBase64Url, toDayDate } from '@sigilo/core';
import {
  DEMO_WITNESS_IDS,
  buildDemoDirectory,
  cosignDirectory,
  demoWitnessPrivateKey,
  generateDemoNetworkKeys,
  signDirectory,
  trustAnchorFromDirectory,
} from '@sigilo/red';
import { buildDemoAccounts } from '../apps/server/src/security/demo-accounts.ts';
import { expectNoAccessibilityViolations } from './support/accessibility.ts';
import { REPO_ROOT, e2ePassword } from './support/environment.ts';

/** Nodo Querétaro de esta prueba: sirve la API y la web construida en el mismo origen. */
const NODE_PORT = 8797;
const NODE_ORIGIN = `http://127.0.0.1:${NODE_PORT}`;
const OPERATION = 'operacion.queretaro';

let server: ChildProcess | null = null;

/** Escribe el directorio de datos del nodo: llaves fijadas, red sintética y cuentas. */
function prepareNodeData(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sigilo-e2e-competencia-'));
  const data = join(dir, 'data');
  mkdirSync(data, { recursive: true, mode: 0o700 });
  const keysText = readFileSync(join(REPO_ROOT, 'apps/server/data/keys.json'), 'utf8');
  const keysFile = JSON.parse(keysText) as {
    publicKeys: {
      server: { signingPublicKey: string };
      authority: { boxPublicKey: string; signingPublicKey: string };
    };
    server: { signingPrivateKey: string };
  };
  const inbox = JSON.parse(
    readFileSync(join(REPO_ROOT, 'apps/server/data/authority-demo-key.json'), 'utf8'),
  ) as { boxPrivateKey: string; signingPrivateKey: string };
  // La llave del nodo y la del buzón son las de `keys.json`: las mismas que la web tiene fijadas.
  const keys = generateDemoNetworkKeys();
  keys.nodes['node.queretaro'].signing = {
    publicKey: fromBase64Url(keysFile.publicKeys.server.signingPublicKey),
    privateKey: fromBase64Url(keysFile.server.signingPrivateKey),
  };
  keys.authorities['authority.buzon-queretaro'] = {
    box: {
      publicKey: fromBase64Url(keysFile.publicKeys.authority.boxPublicKey),
      privateKey: fromBase64Url(inbox.boxPrivateKey),
    },
    signing: {
      publicKey: fromBase64Url(keysFile.publicKeys.authority.signingPublicKey),
      privateKey: fromBase64Url(inbox.signingPrivateKey),
    },
  };
  const directory = buildDemoDirectory(keys, {
    issuedOn: toDayDate(new Date(Date.now() - 24 * 60 * 60 * 1000)),
    baseUrls: { 'node.queretaro': NODE_ORIGIN },
  });
  let signed = signDirectory(directory, keys.operator.privateKey);
  for (const id of DEMO_WITNESS_IDS) {
    signed = cosignDirectory(signed, id, demoWitnessPrivateKey(keys, id));
  }
  const write = (name: string, value: unknown) =>
    writeFileSync(join(data, name), JSON.stringify(value), { mode: 0o600 });
  writeFileSync(join(data, 'keys.json'), keysText, { mode: 0o600 });
  write('directory.json', signed);
  write('network-trust.json', trustAnchorFromDirectory(directory));
  write('red-node-key.json', {
    version: 1,
    nodeId: 'node.queretaro',
    boxKeyId: keyIdFor(keys.nodes['node.queretaro'].box.publicKey),
    boxPrivateKey: toBase64Url(keys.nodes['node.queretaro'].box.privateKey),
  });
  write('relay-secret.json', {
    version: 1,
    nodeId: 'node.queretaro',
    secret: toBase64Url(randomBytes(32)),
  });
  // Sin segundo factor inscrito en este nodo de prueba (SIGILO_MFA=opcional).
  const accounts = buildDemoAccounts({
    node: 'queretaro',
    passwordFor: e2ePassword,
    logN: 14,
    mfa: { enrolled: new Set(), requireEnrollment: new Set() },
  });
  write('authority-accounts.json', accounts.file);
  return data;
}

async function waitForNode(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${NODE_ORIGIN}/api/v1/keys`)).ok) return;
    } catch {
      // Todavía arranca.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('El nodo Querétaro de la prueba no arrancó.');
}

test.beforeAll(async () => {
  const data = prepareNodeData();
  server = spawn(process.execPath, ['apps/server/src/main.ts'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      SIGILO_DATA_DIR: data,
      SIGILO_PORT: String(NODE_PORT),
      SIGILO_NODE_ID: 'node.queretaro',
      SIGILO_WEB_DIST: join(REPO_ROOT, 'apps/web/dist'),
      SIGILO_ALLOWED_ORIGIN: '',
      SIGILO_MFA: 'opcional',
      SIGILO_POW_BITS: '0',
    },
    stdio: 'ignore',
  });
  await waitForNode();
});

test.afterAll(() => {
  server?.kill();
  server = null;
});

test('la operación asigna el OIC de una dependencia y firma una versión nueva de la tabla', async ({
  page,
}) => {
  await page.goto(`${NODE_ORIGIN}/autoridad`);
  const form = page.getByTestId('authority-login');
  await form.getByTestId('authority-username').fill(OPERATION);
  await form.getByTestId('authority-password').fill(e2ePassword(OPERATION));
  await form.getByTestId('authority-login-submit').click();
  await expect(page.getByTestId('profile-badge')).toHaveAttribute('data-kind', 'operation');

  await page.getByTestId('operation-tab-competence').click();
  const panel = page.getByTestId('competence-panel');
  await expect(panel.getByRole('heading', { name: 'Competencia por dependencia' })).toBeVisible();
  // Las 145 dependencias reales de Querétaro del catálogo de la PDN, agrupadas.
  await expect(page.getByTestId('competence-row')).toHaveCount(145);
  await expect(panel.getByRole('table', { name: 'Municipio de Querétaro' })).toBeVisible();
  await expect(panel.getByRole('table', { name: 'Poderes y organismos autónomos' })).toBeVisible();
  // Querétaro no tiene fragmento del S1 en el repositorio: la pista lo dice.
  await expect(panel).toContainText('no hay conteo por ente');
  await expectNoAccessibilityViolations(page, 'competencia por dependencia');

  await page.getByTestId('competence-search').fill('Fiscalía General');
  const row = page.locator('[data-testid="competence-row"][data-entity-id="PDN-22-7232"]');
  await expect(page.getByTestId('competence-row')).toHaveCount(1);
  await expect(row.getByTestId('competence-badge')).toHaveText('pendiente');
  await row.getByTestId('competence-edit').click();
  await page.getByTestId('competence-row-choice-institution').check();
  await page
    .getByTestId('competence-row-institution')
    .fill('Órgano Interno de Control de la Fiscalía General del Estado de Querétaro (ficticio)');
  await page.getByTestId('competence-row-basis').fill('LGRA, arts. 3, fr. XXI, y 10');
  await expectNoAccessibilityViolations(page, 'editor de la competencia');
  await page.getByTestId('competence-row-apply').click();
  await expect(row.getByTestId('competence-badge')).toHaveText('OIC nombrado, falta alta');
  await expect(row).toContainText('Cambio sin firmar');
  await expect(row.getByTestId('competence-edit')).toBeFocused();

  // Otra: un municipio sin OIC en la tabla, a la autoridad registrada de El Marqués.
  await page
    .getByTestId('competence-search')
    .fill('Secretaría del Ayuntamiento del Municipio de el');
  const marques = page.locator('[data-testid="competence-row"][data-entity-id="PDN-22-7276"]');
  await expect(marques.getByTestId('competence-badge')).toHaveText('OIC con llaves ✓');
  await page.getByTestId('competence-search').fill('');

  await expect(page.getByTestId('competence-changed')).toHaveText(
    '1 dependencias cambiaron en el borrador.',
  );
  await page.getByTestId('competence-review').click();
  const result = page.getByTestId('competence-review-result');
  await expect(result.getByRole('heading', { name: 'Cambios de la versión 2' })).toBeFocused();
  await expect(page.getByTestId('competence-diff')).toContainText(
    'Fiscalía General del Estado: de pendiente a OIC Órgano Interno de Control de la Fiscalía General del Estado de Querétaro (ficticio).',
  );
  await page.getByTestId('competence-sign').click();
  await expect(result.getByRole('heading', { name: 'Versión 2 firmada' })).toBeVisible();
  await expect(page.getByTestId('competence-signed')).toContainText('firmó la versión 2');
  await expect(page.getByTestId('competence-signed')).toContainText('sigilo-sesna aceptar');
  await expect(page.getByTestId('competence-history')).toContainText('Versión 2, firmada el');
  const download = page.waitForEvent('download');
  await page.getByTestId('competence-download-update').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('tabla-de-funciones-queretaro-v2.json');
  const update = JSON.parse(readFileSync((await file.path()) ?? '', 'utf8')) as {
    tipo: string;
    tabla: { table: { version: number; format: number; entities: { entityId: string }[] } };
  };
  expect(update.tipo).toBe('sigilo/tabla-de-funciones');
  expect(update.tabla.table).toMatchObject({ version: 2, format: 2 });
  expect(update.tabla.table.entities.map((item) => item.entityId)).toContain('PDN-22-7232');
  await expectNoAccessibilityViolations(page, 'versión firmada');
});
