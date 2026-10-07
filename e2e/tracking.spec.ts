// Seguimiento con folio y recibo: vista verificada para credenciales correctas y el mismo error
// para palabras incorrectas que para un folio inexistente (no se revela si el folio existe).
import { generateFolio } from '@sigilo/core';
import { seedAnonymousComplaint } from './support/api.ts';
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
