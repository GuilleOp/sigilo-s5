// Datos abiertos: la tabla agregada solo publica combinaciones con 5 o más denuncias y reporta
// cuántas quedaron fuera por celdas pequeñas.
import { OPEN_DATA_MIN_CELL } from '@sigilo/contracts';
import { seedAnonymousComplaint, syntheticFacts } from './support/api.ts';
import { expect, test } from './support/fixtures.ts';

test('/datos-abiertos muestra la tabla y el conteo de denuncias omitidas', async ({
  page,
  request,
}) => {
  // Cinco denuncias en la misma celda (entidad, conducta, mes y estatus) alcanzan el mínimo.
  const facts = syntheticFacts({ stateCode: '31', offenseCode: 'LGRA-52' });
  for (let index = 0; index < OPEN_DATA_MIN_CELL; index++) {
    await seedAnonymousComplaint(request, facts);
  }
  // Una sola denuncia en otra entidad queda suprimida.
  await seedAnonymousComplaint(request, syntheticFacts({ stateCode: '32' }));

  await page.goto('/datos-abiertos');
  const table = page.getByTestId('open-data-table');
  await expect(table).toBeVisible();
  const row = table.getByRole('row').filter({ hasText: 'Yucatán' });
  await expect(row).toContainText('Cohecho');
  await expect(row.getByRole('cell').last()).toHaveText(/^\d+$/u);
  expect(Number(await row.getByRole('cell').last().innerText())).toBeGreaterThanOrEqual(
    OPEN_DATA_MIN_CELL,
  );
  await expect(table).not.toContainText('Zacatecas');
  await expect(page.getByTestId('suppressed-count')).toHaveText(
    /^Denuncias omitidas por celdas pequeñas: [1-9]\d*\.$/u,
  );
});
