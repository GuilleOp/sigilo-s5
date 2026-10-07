// Bitácora verificable: el verificador del navegador la marca íntegra, detecta una respuesta
// manipulada y `verifyChain` detecta un evento alterado en una copia de la base.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { LedgerPageSchema, ROUTES } from '@sigilo/contracts';
import { verifyChain } from '@sigilo/core';
import { seedAnonymousComplaint } from './support/api.ts';
import { readLedgerEvents, snapshotDatabase } from './support/database.ts';
import { expect, test } from './support/fixtures.ts';

test.beforeAll(async ({ request }) => {
  // Garantiza al menos un evento aunque este archivo se ejecute solo.
  await seedAnonymousComplaint(request);
});

test('el verificador de /verificar marca la bitácora como íntegra', async ({ page }) => {
  await page.goto('/verificar');
  await page.getByTestId('verify-ledger').click();
  await expect(page.getByTestId('ledger-valid')).toContainText('La bitácora está íntegra');
});

test('el verificador detecta un evento modificado en tránsito', async ({ page }) => {
  await page.route(`**${ROUTES.ledgerEvents}*`, async (route) => {
    const response = await route.fetch();
    const ledgerPage = LedgerPageSchema.parse(await response.json());
    const [first, ...rest] = ledgerPage.events;
    if (first === undefined) throw new Error('La bitácora debería tener eventos.');
    const tampered = { ...first, payloadDigest: 'f'.repeat(64) };
    await route.fulfill({ response, json: { ...ledgerPage, events: [tampered, ...rest] } });
  });
  await page.goto('/verificar');
  await page.getByTestId('verify-ledger').click();
  await expect(page.getByTestId('ledger-invalid')).toContainText('La bitácora fue alterada');
});

test('verifyChain detecta un evento alterado en una copia de la base', () => {
  // Seguridad: se trabaja sobre una copia; la base del servidor sigue intacta y en uso.
  const copy = new DatabaseSync(snapshotDatabase('bitacora-alterada'));
  try {
    const original = readLedgerEvents(copy);
    expect(original.length).toBeGreaterThan(0);
    expect(verifyChain(original)).toEqual({ valid: true });

    // Un administrador con acceso a la base quita la protección y reescribe un evento.
    copy.exec('DROP TRIGGER ledger_events_no_update;');
    const forgedDigest = createHash('sha256').update('contenido falsificado').digest('hex');
    copy.prepare('UPDATE ledger_events SET payload_digest = ? WHERE seq = 0').run(forgedDigest);

    expect(verifyChain(readLedgerEvents(copy))).toEqual({
      valid: false,
      failedAtSeq: 0,
      reason: 'hash',
    });
  } finally {
    copy.close();
  }
});
