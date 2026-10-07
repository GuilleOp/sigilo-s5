// Llaves fijadas: si el servidor (o un intermediario) publica otra llave de la autoridad, el envío
// se bloquea antes de subir o cifrar nada.
import { PublicKeySetSchema, ROUTES } from '@sigilo/contracts';
import { generateBoxKeyPair, keyIdFor, toBase64Url } from '@sigilo/core';
import { expect, test } from './support/fixtures.ts';
import { reachSubmitStep } from './support/report-wizard.ts';

test('una llave de la autoridad sustituida bloquea el envío con key-mismatch', async ({ page }) => {
  await page.route(`**${ROUTES.keys}`, async (route) => {
    const response = await route.fetch();
    const served = PublicKeySetSchema.parse(await response.json());
    const impostor = generateBoxKeyPair();
    await route.fulfill({
      response,
      json: {
        ...served,
        authority: {
          ...served.authority,
          keyId: keyIdFor(impostor.publicKey),
          boxPublicKey: toBase64Url(impostor.publicKey),
        },
      },
    });
  });
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST') writes.push(new URL(request.url()).pathname);
  });

  await reachSubmitStep(page, 'sealed', 'Nombre Ficticio Bloqueado');
  await page.getByTestId('submit-report').click();

  await expect(page.getByTestId('key-mismatch')).toContainText('no enviamos nada');
  await expect(page.getByTestId('submit-report')).toBeDisabled();
  expect(writes).toEqual([]);
});
