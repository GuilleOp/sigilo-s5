// Bitácora verificable: solo se publican los días ya cerrados; el verificador del navegador la
// marca como coincidente con el registro firmado, detecta una respuesta manipulada y compara con
// un anclaje; `verifyChain` detecta un evento alterado en una copia de la base.
// El reloj del servidor de prueba se adelanta un día para publicar los eventos sembrados.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { LedgerPageSchema, ROUTES, SignedLedgerHeadSchema } from '@sigilo/contracts';
import { toDayDate, verifyChain } from '@sigilo/core';
import { seedAnonymousComplaint } from './support/api.ts';
import { advanceServerClockToNextDay, serverNow } from './support/clock.ts';
import { readLedgerEvents, snapshotDatabase } from './support/database.ts';
import { API_ORIGIN } from './support/environment.ts';
import { expect, test } from './support/fixtures.ts';

test.beforeAll(async ({ request }) => {
  // Garantiza al menos un evento publicado aunque este archivo se ejecute solo.
  await seedAnonymousComplaint(request);
  advanceServerClockToNextDay();
});

test('los eventos del día se publican hasta el día siguiente', async ({ request }) => {
  const { ledgerSeq } = await seedAnonymousComplaint(request);
  const pageFor = async () =>
    LedgerPageSchema.parse(
      await (
        await request.get(`${API_ORIGIN}${ROUTES.ledgerEvents}?from=${ledgerSeq}&limit=1`)
      ).json(),
    );

  // El mismo día: página vacía y la cabeza pública todavía no llega a ese evento.
  const sameDay = await pageFor();
  expect(sameDay.events).toEqual([]);
  expect(sameDay.head.seq).toBeLessThan(ledgerSeq);

  advanceServerClockToNextDay();
  const nextDay = await pageFor();
  expect(nextDay.events.map((event) => event.seq)).toEqual([ledgerSeq]);
  expect(nextDay.head.seq).toBeGreaterThanOrEqual(ledgerSeq);
  expect(nextDay.head.at < toDayDate(serverNow())).toBe(true);
});

test('el verificador de /verificar dice que coincide con el registro firmado', async ({ page }) => {
  await page.goto('/verificar');
  await page.getByTestId('verify-ledger').click();
  const valid = page.getByTestId('ledger-valid');
  await expect(valid).toContainText('La bitácora coincide con el registro firmado');
  await expect(valid).not.toContainText(/nadie/iu);
  await expect(page.getByText('lo de hoy se publica mañana')).toBeVisible();
});

test('el verificador detecta un evento modificado en tránsito', async ({ page }) => {
  await page.route(`**${ROUTES.ledgerEvents}*`, async (route) => {
    const response = await route.fetch();
    const ledgerPage = LedgerPageSchema.parse(await response.json());
    const [first, ...rest] = ledgerPage.events;
    if (first === undefined) throw new Error('La bitácora debería tener eventos publicados.');
    const tampered = { ...first, payloadDigest: 'f'.repeat(64) };
    await route.fulfill({ response, json: { ...ledgerPage, events: [tampered, ...rest] } });
  });
  await page.goto('/verificar');
  await page.getByTestId('verify-ledger').click();
  await expect(page.getByTestId('ledger-invalid')).toContainText('La bitácora fue alterada');
});

test('compara la bitácora con un anclaje publicado', async ({ page, request }) => {
  const head = SignedLedgerHeadSchema.parse(
    await (await request.get(`${API_ORIGIN}${ROUTES.ledgerHead}`)).json(),
  );
  const anchor = { version: 1, anchoredOn: toDayDate(serverNow()), head };
  await page.goto('/verificar');

  await page.getByTestId('anchor-input').fill(JSON.stringify(anchor, null, 2));
  await page.getByTestId('compare-anchor').click();
  await expect(page.getByTestId('anchor-matches')).toContainText(`El registro ${head.seq}`);

  // Un anclaje con otro hash (por ejemplo, de una bitácora reescrita) no coincide.
  const rewritten = { ...anchor, head: { ...head, hash: 'a'.repeat(64) } };
  await page.getByTestId('anchor-input').fill(JSON.stringify(rewritten));
  await page.getByTestId('compare-anchor').click();
  await expect(page.getByTestId('anchor-mismatch')).toBeVisible();

  await page.getByTestId('anchor-input').fill('{"version": 1}');
  await page.getByTestId('compare-anchor').click();
  await expect(page.getByTestId('anchor-invalid')).toBeVisible();
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
