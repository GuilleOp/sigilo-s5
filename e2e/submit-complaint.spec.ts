// Denuncia anónima completa: revisor de texto, caracteres invisibles, limpieza de foto y PDF,
// rechazo de Office, semáforo, vista de la autoridad, envío y confirmación del recibo.
import { readFileSync } from 'node:fs';
import exifr from 'exifr';
import { downloadEvidence, fetchComplaintDetail } from './support/api.ts';
import { expect, test } from './support/fixtures.ts';
import {
  continueTo,
  fillFacts,
  fixturePath,
  NEUTRAL_FACTS,
  startReport,
  submitAndKeepReceipt,
} from './support/report-wizard.ts';
import { FIXTURE_FILES } from './support/synthetic-files.ts';

const REVEALING_DESCRIPTION =
  'Soy la única auxiliar contable del área y vi cómo se aprobó el pago. ' +
  'Pueden escribirme a persona.prueba@ejemplo.test para más datos.';

test('una denuncia anónima limpia sus pruebas, revisa el texto y entrega un recibo', async ({
  page,
  request,
}) => {
  await startReport(page, 'anonymous');
  await continueTo(page, 'facts');
  await fillFacts(page, { ...NEUTRAL_FACTS, description: REVEALING_DESCRIPTION });

  // El revisor señala la frase que identifica a la persona y el correo.
  const review = page.getByTestId('description-review');
  const findings = review.getByTestId('text-finding');
  await expect(findings).toHaveCount(2);
  await expect(findings.nth(0)).toContainText('«Soy la única»');
  await expect(findings.nth(1)).toContainText('«persona.prueba@ejemplo.test»');

  // Se reemplaza la descripción por texto neutro y se pega un fragmento con marcas invisibles.
  const description = page.getByTestId('description-input');
  await description.fill(`${NEUTRAL_FACTS.description} `);
  await expect(findings).toHaveCount(0);
  await description.press('End');
  await page.keyboard.insertText(readFileSync(fixturePath(FIXTURE_FILES.invisibleText), 'utf8'));
  const invisibleAlert = page.getByTestId('invisible-characters-alert');
  await expect(invisibleAlert).toContainText('5 caracteres invisibles');
  await invisibleAlert.getByTestId('strip-invisible').click();
  await expect(invisibleAlert).toBeHidden();
  await expect(description).toHaveValue(/sin licitación\.$/u);
  expect(await description.inputValue()).not.toMatch(/[\u200b-\u200d\u2060\ufeff]/u);

  await continueTo(page, 'evidence');
  const evidenceInput = page.getByTestId('evidence-input');

  // Foto: el panel muestra el GPS sintético y, tras limpiar, se comprueba que no quedan metadatos.
  await evidenceInput.setInputFiles(fixturePath(FIXTURE_FILES.photo));
  const photo = page.getByTestId('evidence-item').filter({ hasText: FIXTURE_FILES.photo });
  await expect(photo.getByTestId('metadata-panel')).toContainText('latitud 20.50000');
  await expect(photo.getByTestId('metadata-panel')).toContainText('longitud -100.25000');
  await photo.getByTestId('clean-evidence').click();
  await expect(photo).toHaveAttribute('data-status', 'clean');
  await expect(photo.getByTestId('clean-verified')).toBeVisible();

  // PDF: se convierte cada página en imagen.
  await evidenceInput.setInputFiles(fixturePath(FIXTURE_FILES.pdf));
  const pdf = page.getByTestId('evidence-item').filter({ hasText: FIXTURE_FILES.pdf });
  await pdf.getByTestId('clean-evidence').click();
  await expect(pdf).toHaveAttribute('data-status', 'clean');
  await expect(pdf.getByRole('img', { name: 'Página 1 convertida en imagen' })).toBeVisible();

  // Documento de Office: se rechaza con una guía para convertirlo.
  await evidenceInput.setInputFiles(fixturePath(FIXTURE_FILES.docx));
  await expect(page.getByTestId('rejected-file')).toContainText(FIXTURE_FILES.docx);
  await expect(page.getByTestId('rejected-file')).toContainText('imprímelo como PDF');

  await continueTo(page, 'review');
  await expect(page.getByTestId('risk-meter')).toBeVisible();
  const preview = page.getByTestId('authority-preview');
  await expect(preview.getByTestId('preview-identity')).toHaveText(
    'No proporcionada (denuncia anónima).',
  );
  await expect(preview.getByRole('img', { name: /^Prueba limpia/u })).toHaveCount(2);

  await continueTo(page, 'submit');
  const { folio, words } = await submitAndKeepReceipt(page);
  expect(folio).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/u);
  expect(words).toHaveLength(8);

  // Control: la foto original sí trae el GPS sintético, así que la comprobación es significativa.
  const original = readFileSync(fixturePath(FIXTURE_FILES.photo));
  expect(await exifr.gps(original)).toMatchObject({ latitude: 20.5, longitude: -100.25 });

  // Lo que recibió el servidor: dos imágenes limpias, sin GPS ni datos del equipo.
  const detail = await fetchComplaintDetail(request, folio);
  expect(detail.summary.mode).toBe('anonymous');
  expect(detail.evidence).toHaveLength(2);
  for (const item of detail.evidence) {
    const bytes = await downloadEvidence(request, item.evidenceId);
    expect(await exifr.gps(bytes)).toBeUndefined();
    expect(await exifr.parse(bytes, { tiff: true, exif: true, gps: true })).toBeUndefined();
  }
});
