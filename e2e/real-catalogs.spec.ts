// Catálogos reales en el asistente: municipios del INEGI de cualquier entidad y entes de la PDN
// descargados del mismo origen solo para la entidad elegida (y los federales). Los casos de prueba
// siguen usando oficinas ficticias, marcadas «(ficticia)».
import { expect, test } from './support/fixtures.ts';
import { continueTo, startReport } from './support/report-wizard.ts';

test('el asistente ofrece municipios e instituciones reales de la entidad elegida', async ({
  page,
  externalRequests,
}) => {
  const fragments: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/datos/entes/')) fragments.push(path);
  });
  await startReport(page, 'anonymous');
  await continueTo(page, 'facts');

  // Ciudad de México: alcaldías del INEGI (empiezan en 002).
  await page.getByTestId('state-select').selectOption('09');
  const municipality = page.getByTestId('municipality-select');
  await expect(municipality.locator('option[value="002"]')).toHaveText('Azcapotzalco');

  // Querétaro, municipio de Querétaro: primero sus entes municipales, luego estatales y federales.
  await page.getByTestId('state-select').selectOption('22');
  await municipality.selectOption('014');
  const entity = page.getByTestId('entity-select');
  await entity.click();
  const groups = page.locator('#entityId-lista [role="group"] > p');
  await expect(groups.first()).toHaveText('Municipio de Querétaro');
  await expect(groups.nth(1)).toHaveText('Estatales de Querétaro');
  await expect(groups.nth(2)).toHaveText('Federales');
  const options = page.getByTestId('entity-select-option');
  await expect(options.and(page.locator('[data-value="PDN-22-7176"]'))).toHaveText(
    'Secretaría de la Contraloría',
  );
  await expect(options.and(page.locator('[data-value="PDN-00-196"]'))).toHaveText(
    'Instituto Mexicano del Seguro Social',
  );
  await expect(options.and(page.locator('[data-value="VE-OBRAS"]'))).toHaveText(
    'Secretaría de Obras de Villa Ejemplo (ficticia)',
  );

  // Se busca sin acentos y se elige de la misma lista.
  await entity.fill('aeropuerto queretaro');
  await expect(options.first()).toHaveAttribute('data-value', 'PDN-22-7074');
  await options.first().click();
  await expect(entity).toHaveValue('Aeropuerto Intercontinental de Querétaro SA de CV');

  // Cambiar de entidad borra el ente estatal de la otra entidad.
  await page.getByTestId('state-select').selectOption('31');
  await expect(entity).toHaveValue('');

  // Solo se descargaron los fragmentos de las entidades elegidas y el federal; nada de terceros.
  await expect
    .poll(() => [...new Set(fragments)].sort())
    .toEqual([
      '/datos/entes/00.json',
      '/datos/entes/09.json',
      '/datos/entes/22.json',
      '/datos/entes/31.json',
    ]);
  expect(externalRequests).toEqual([]);
});
