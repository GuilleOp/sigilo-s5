// Datos abiertos: solo se publican meses completos, los conteos se redondean al azar a un múltiplo
// de 5 (con semilla secreta por mes) y lo que redondea a 0 se suprime y se cuenta aparte.
// El reloj del servidor de prueba se adelanta al mes siguiente para publicar el mes sembrado.
import { OPEN_DATA_MIN_CELL, OPEN_DATA_ROUNDING, ROUTES } from '@sigilo/contracts';
import { seedAnonymousComplaint, syntheticFacts } from './support/api.ts';
import { advanceServerClockToNextMonth } from './support/clock.ts';
import { API_ORIGIN } from './support/environment.ts';
import { expect, test } from './support/fixtures.ts';

const SUPPRESSED_STATE = '32';
/** Denuncias en una celda pequeña: se publica como 5 o se suprime, según el ruido del mes. */
const SMALL_CELL = 3;

test('/datos-abiertos publica el mes cerrado redondeado y cuenta las celdas suprimidas', async ({
  page,
  request,
}) => {
  // Cinco denuncias en la misma celda (entidad, conducta, mes y estatus) alcanzan el mínimo.
  const facts = syntheticFacts({ stateCode: '31', offenseCode: 'LGRA-52' });
  for (let index = 0; index < OPEN_DATA_MIN_CELL; index++) {
    await seedAnonymousComplaint(request, facts);
  }
  // Una celda pequeña en otra entidad queda suprimida.
  for (let index = 0; index < SMALL_CELL; index++) {
    await seedAnonymousComplaint(request, syntheticFacts({ stateCode: SUPPRESSED_STATE }));
  }

  // Mientras el mes está en curso, sus denuncias no aparecen en el CSV.
  const before = await (await request.get(`${API_ORIGIN}${ROUTES.openDataCsv}`)).text();
  expect(before).not.toMatch(new RegExp(`^31,`, 'mu'));

  advanceServerClockToNextMonth();
  const csv = await (await request.get(`${API_ORIGIN}${ROUTES.openDataCsv}`)).text();
  const lines = csv.trim().split(/\r?\n/u);
  const header = lines[0]?.split(',') ?? [];
  const suppressedRow = lines.at(-1)?.split(',') ?? [];
  expect(suppressedRow[0]).toBe('suprimidas');
  expect(suppressedRow).toHaveLength(header.length);

  await page.goto('/datos-abiertos');
  await expect(page.getByText('Solo publicamos meses completos')).toBeVisible();
  const table = page.getByTestId('open-data-table');
  await expect(table).toBeVisible();
  const row = table.getByRole('row').filter({ hasText: 'Yucatán' });
  await expect(row).toContainText(/cohecho/iu);
  const count = Number(await row.getByRole('cell').last().innerText());
  expect(count).toBeGreaterThanOrEqual(OPEN_DATA_MIN_CELL);
  expect(count % OPEN_DATA_ROUNDING).toBe(0);
  // La celda pequeña puede aparecer como 5 o quedar suprimida, nunca con su conteo real.
  const small = table.getByRole('row').filter({ hasText: 'Zacatecas' });
  if ((await small.count()) > 0) {
    await expect(small.getByRole('cell').last()).toHaveText(String(OPEN_DATA_ROUNDING));
  }

  const suppressed = page.getByTestId('suppressed-count');
  await expect(suppressed).toHaveText(
    /^Denuncias que no mostramos para proteger a quienes denunciaron: \d+\.$/u,
  );
  const shown = Number(/(\d+)\.$/u.exec(await suppressed.innerText())?.[1]);
  expect(shown % OPEN_DATA_ROUNDING).toBe(0);
  // El mes congelado no cambia al volver a descargarlo.
  const again = await (await request.get(`${API_ORIGIN}${ROUTES.openDataCsv}`)).text();
  expect(again).toBe(csv);
});
