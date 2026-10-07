// Bitácora verificable: los eventos del día quedan pendientes, sin secuencia, y se encadenan al
// cerrar el día; el verificador del navegador la marca como coincidente con el registro firmado,
// detecta una respuesta manipulada y compara con todos los anclajes pegados; `verifyChain` detecta
// un evento alterado en una copia de la base.
// El reloj del servidor de prueba se adelanta un día para publicar los eventos sembrados.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { LedgerPageSchema, ROUTES, SignedLedgerHeadSchema } from '@sigilo/contracts';
import type { LedgerEvent } from '@sigilo/contracts';
import type { APIRequestContext } from '@playwright/test';
import { toDayDate, verifyChain } from '@sigilo/core';
import { seedAnonymousComplaint } from './support/api.ts';
import { advanceServerClockToNextDay, serverNow } from './support/clock.ts';
import { openServerDatabase, readLedgerEvents, snapshotDatabase } from './support/database.ts';
import { API_ORIGIN } from './support/environment.ts';
import { expect, test } from './support/fixtures.ts';

test.beforeAll(async ({ request }) => {
  // Garantiza al menos un evento publicado aunque este archivo se ejecute solo.
  await seedAnonymousComplaint(request);
  advanceServerClockToNextDay();
});

/** Toda la bitácora publicada y su cabeza, por páginas. */
async function publishedLedger(request: APIRequestContext) {
  const events: LedgerEvent[] = [];
  for (;;) {
    const page = LedgerPageSchema.parse(
      await (
        await request.get(`${API_ORIGIN}${ROUTES.ledgerEvents}?from=${events.length}&limit=500`)
      ).json(),
    );
    events.push(...page.events);
    if (page.events.length < 500) return { events, head: page.head };
  }
}

/** Indica si la base tiene el evento pendiente (sin secuencia) con ese identificador. */
function isPendingInDatabase(payloadDigest: string): boolean {
  const db = openServerDatabase();
  try {
    const row = db
      .prepare('SELECT COUNT(*) AS total FROM ledger_pending WHERE payload_digest = ?')
      .get(payloadDigest);
    return Number(row?.total ?? 0) === 1;
  } finally {
    db.close();
  }
}

test('los eventos del día quedan pendientes y sin secuencia hasta que cierra el día', async ({
  request,
}) => {
  const before = await publishedLedger(request);
  const seeded = [await seedAnonymousComplaint(request), await seedAnonymousComplaint(request)];
  const digests = seeded.map((complaint) => complaint.payloadDigest);

  // El mismo día: no aparecen en la bitácora pública, la cabeza no cambia y en la base siguen
  // pendientes, sin secuencia.
  const sameDay = await publishedLedger(request);
  expect(sameDay.events.filter((event) => digests.includes(event.payloadDigest))).toEqual([]);
  expect(sameDay.head).toEqual(before.head);
  for (const digest of digests) expect(isPendingInDatabase(digest)).toBe(true);

  advanceServerClockToNextDay();
  const nextDay = await publishedLedger(request);
  const published = nextDay.events.filter((event) => digests.includes(event.payloadDigest));
  expect(published.map((event) => event.payloadDigest).sort()).toEqual([...digests].sort());
  expect(verifyChain(nextDay.events)).toEqual({ valid: true });
  expect(nextDay.head.hash).toBe(nextDay.events.at(-1)?.hash);
  expect(nextDay.head.at < toDayDate(serverNow())).toBe(true);
  for (const digest of digests) expect(isPendingInDatabase(digest)).toBe(false);
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

test('compara la bitácora con todos los anclajes pegados', async ({ page, request }) => {
  const head = SignedLedgerHeadSchema.parse(
    await (await request.get(`${API_ORIGIN}${ROUTES.ledgerHead}`)).json(),
  );
  const anchor = { version: 1, anchoredOn: toDayDate(serverNow()), head };
  await page.goto('/verificar');

  // Al verificar con un anclaje pegado, la comparación es automática.
  await page.getByTestId('anchor-input').fill(JSON.stringify(anchor, null, 2));
  await page.getByTestId('verify-ledger').click();
  await expect(page.getByTestId('ledger-valid')).toBeVisible();
  await expect(page.getByTestId('anchor-matches')).toContainText(`El registro ${head.seq}`);

  // Varios anclajes pegados uno tras otro: uno con otro hash (bitácora reescrita) no coincide.
  const rewritten = {
    ...anchor,
    anchoredOn: '2026-01-01',
    head: { ...head, hash: 'a'.repeat(64) },
  };
  await page
    .getByTestId('anchor-input')
    .fill(`${JSON.stringify(anchor, null, 2)}\n${JSON.stringify(rewritten, null, 2)}`);
  await page.getByTestId('compare-anchor').click();
  const results = page.getByTestId('anchor-results');
  await expect(results).toContainText('Comparamos la bitácora con 2 anclajes.');
  await expect(results.getByTestId('anchor-matches')).toHaveCount(1);
  await expect(results.getByTestId('anchor-mismatch')).toHaveCount(1);

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
