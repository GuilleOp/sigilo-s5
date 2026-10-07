// Seguimiento con folio y recibo: vista verificada para credenciales correctas y el mismo error
// para palabras incorrectas que para un folio inexistente (no se revela si el folio existe).
import { ROUTES, TrackingViewSchema } from '@sigilo/contracts';
import type { TrackingView } from '@sigilo/contracts';
import { generateFolio } from '@sigilo/core';
import { seedAnonymousComplaint } from './support/api.ts';
import { advanceServerClockToNextDay } from './support/clock.ts';
import { expect, test } from './support/fixtures.ts';
import { openTracking, readTrackingError } from './support/tracking.ts';

test('con el folio y las 8 palabras se ve el estatus, el comprobante y la identidad', async ({
  page,
  request,
}) => {
  const { folio, words } = await seedAnonymousComplaint(request);
  await openTracking(page, folio, words);
  const view = page.getByTestId('tracking-view');
  await expect(view).toContainText(folio);
  await expect(view.getByTestId('receipt-verified')).toBeVisible();
  await expect(view.getByTestId('identity-status')).toContainText('Tu denuncia es anónima');
  await expect(view.getByTestId('tracking-status')).toBeVisible();
});

test('el evento de recepción queda pendiente de publicar y al día siguiente coincide con el comprobante', async ({
  page,
  request,
}) => {
  const { folio, words } = await seedAnonymousComplaint(request);
  await openTracking(page, folio, words);
  const verified = page.getByTestId('receipt-verified');
  // El mismo día el evento no tiene secuencia: no se muestra número.
  await expect(verified).not.toContainText('con el número');
  await expect(verified.getByTestId('ledger-publication')).toHaveText(
    'Tu anotación está pendiente de publicar: el registro público se actualiza una vez al día, cuando el día termina.',
  );

  await advanceServerClockToNextDay();
  await page.getByTestId('tracking-logout').click();
  await openTracking(page, folio, words);
  await expect(page.getByTestId('receipt-verified')).toContainText(
    /quedó anotada en el registro público con el número \d+\./u,
  );
  await expect(page.getByTestId('ledger-publication')).toHaveText(
    'La anotación ya aparece en el registro público, igual que aquí.',
  );
});

test('si el seguimiento dice pendiente pero el día ya se publicó, se señala', async ({
  page,
  request,
}) => {
  const { folio, words } = await seedAnonymousComplaint(request);
  await advanceServerClockToNextDay();
  // El servidor oculta el evento ya publicado en la vista de seguimiento.
  await page.route(`**${ROUTES.tracking}`, async (route) => {
    const response = await route.fetch();
    const view: Partial<TrackingView> = TrackingViewSchema.parse(await response.json());
    delete view.receivedEvent;
    await route.fulfill({ response, json: view });
  });
  await openTracking(page, folio, words);
  await expect(page.getByTestId('ledger-publication-mismatch')).toBeVisible();
});

test('un evento de recepción que no corresponde al comprobante se señala', async ({
  page,
  request,
}) => {
  const { folio, words } = await seedAnonymousComplaint(request);
  // Un día después, el seguimiento ya trae el evento publicado; el servidor lo altera.
  await advanceServerClockToNextDay();
  await page.route(`**${ROUTES.tracking}`, async (route) => {
    const response = await route.fetch();
    const view = TrackingViewSchema.parse(await response.json());
    if (view.receivedEvent === undefined) throw new Error('Falta el evento publicado.');
    const receivedEvent = { ...view.receivedEvent, payloadDigest: 'f'.repeat(64) };
    await route.fulfill({ response, json: { ...view, receivedEvent } });
  });
  await openTracking(page, folio, words);
  await expect(page.getByTestId('receipt-event-invalid')).toBeVisible();
  await expect(page.getByTestId('receipt-verified')).toHaveCount(0);
});

test('unas palabras incorrectas dan el mismo error que un folio inexistente', async ({
  page,
  request,
}) => {
  const { folio, words } = await seedAnonymousComplaint(request);
  // Las mismas palabras en otro orden: todas existen en la lista, pero el recibo no coincide.
  const wrongWords = [...words].reverse();
  const wrongWordsError = await readTrackingError(page, folio, wrongWords);

  let missingFolio = generateFolio();
  while (missingFolio === folio) missingFolio = generateFolio();
  const missingFolioError = await readTrackingError(page, missingFolio, words);

  expect(wrongWordsError).toContain('El folio o el recibo no coinciden');
  expect(missingFolioError).toBe(wrongWordsError);
});
