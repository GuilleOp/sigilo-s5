// Denuncia con identidad sellada: trámite en el panel (estatus, pregunta y apertura con
// fundamento), seguimiento con la pregunta descifrada y la apertura visible, respuesta de la
// persona y, al final, la base de datos sin la identidad en claro.
import { expect, test } from './support/fixtures.ts';
import { loginAsAuthority, openComplaint } from './support/authority.ts';
import { openServerDatabase, readAllCells } from './support/database.ts';
import { reachSubmitStep, submitAndKeepReceipt } from './support/report-wizard.ts';
import type { Receipt } from './support/report-wizard.ts';
import { advanceServerClockToNextDay } from './support/clock.ts';
import { openTracking } from './support/tracking.ts';

// Nombre inventado y poco común para poder buscarlo sin falsos positivos.
const SYNTHETIC_NAME = 'Ximena Prueba Zuloaga Sintética';
const QUESTION = '¿Recuerda el número de contrato?';
const LEGAL_BASIS =
  'Artículo 64 de la LGRA: se requiere citar a la persona denunciante como testigo (caso ficticio).';
const REPLY = 'Creo que el contrato terminaba en 014, pero no tengo el documento.';

test.describe.serial('denuncia con identidad sellada', () => {
  let receipt: Receipt;

  test('la autoridad tramita, pregunta y abre la identidad; la persona lo ve y responde', async ({
    page,
    openIsolatedPage,
  }) => {
    await reachSubmitStep(page, 'sealed', SYNTHETIC_NAME);
    await expect(page.getByText('También guardaremos tu nombre bajo llave')).toBeVisible();
    receipt = await submitAndKeepReceipt(page);

    // Panel de autoridad, en otro navegador.
    const authority = await openIsolatedPage();
    await loginAsAuthority(authority);
    await openComplaint(authority, receipt.folio);
    const detail = authority.getByTestId('complaint-detail');
    await expect(detail).toContainText('Sellada; aperturas registradas: 0');
    await expect(detail).not.toContainText(SYNTHETIC_NAME);
    // El mismo día, el evento de recepción aún no se publica: las llaves no están verificadas.
    await expect(detail.getByTestId('reporter-keys-unverified')).toHaveText(
      'Las llaves de la persona aún no están verificadas contra el registro público.',
    );

    await detail.getByTestId('status-select').selectOption('investigating');
    await detail.getByTestId('save-status').click();
    await expect(detail.getByTestId('detail-status')).toHaveText('En investigación');

    await detail.getByTestId('authority-question').fill(QUESTION);
    await detail.getByTestId('send-question').click();
    await expect(detail.getByText('Pregunta enviada cifrada.')).toBeVisible();
    await expect(detail.getByTestId('mailbox-message')).toHaveCount(1);

    await detail.getByTestId('legal-basis').fill(LEGAL_BASIS);
    await detail.getByTestId('acknowledge-opening').check();
    await detail.getByTestId('open-identity').click();
    await expect(detail.getByTestId('opened-identity')).toContainText(SYNTHETIC_NAME);
    await expect(detail).toContainText('Sellada; aperturas registradas: 1');

    // Seguimiento de la persona denunciante.
    await openTracking(page, receipt.folio, receipt.words);
    const view = page.getByTestId('tracking-view');
    await expect(view.getByRole('heading', { name: 'Estatus: En investigación' })).toBeVisible();
    await expect(view.getByTestId('mailbox-message').first()).toContainText(QUESTION);
    const identity = view.getByTestId('identity-status');
    await expect(identity.getByTestId('identity-opened')).toContainText('1 vez');
    await expect(identity).toContainText(`Fundamento: «${LEGAL_BASIS}»`);
    // La apertura se ve de inmediato, aunque su evento público siga pendiente.
    await expect(identity.getByTestId('identity-access-entry')).toContainText(
      'Pendiente de publicar en el registro público',
    );

    await view.getByTestId('reply-input').fill(REPLY);
    await view.getByTestId('send-reply').click();
    await expect(
      view.getByText('Respuesta enviada. Solo la autoridad puede leerla.'),
    ).toBeVisible();

    // La autoridad vuelve a abrir la denuncia y lee la respuesta descifrada.
    await authority.getByRole('button', { name: 'Volver al listado' }).click();
    await openComplaint(authority, receipt.folio);
    const thread = authority.getByTestId('authority-mailbox');
    await expect(thread.getByTestId('mailbox-message')).toHaveCount(2);
    await expect(thread.getByTestId('mailbox-message').nth(1)).toContainText(REPLY);

    // Al día siguiente se publica el día: la autoridad verifica las llaves contra el registro
    // público y la persona encuentra la apertura por la etiqueta de su recibo.
    advanceServerClockToNextDay();
    await authority.getByRole('button', { name: 'Volver al listado' }).click();
    await openComplaint(authority, receipt.folio);
    await expect(authority.getByTestId('reporter-keys-verified')).toBeVisible();
    await page.getByTestId('tracking-logout').click();
    await openTracking(page, receipt.folio, receipt.words);
    const published = page.getByTestId('identity-status');
    await expect(published.getByTestId('identity-access-entry')).toContainText(
      'Ya aparece en el registro público.',
    );
    await expect(published.getByTestId('identity-openings-hidden')).toHaveCount(0);
  });

  test('la base de datos no contiene el nombre sintético en ninguna tabla', () => {
    expect(receipt, 'La prueba anterior debe haber creado la denuncia').toBeDefined();
    const db = openServerDatabase();
    try {
      const cells = readAllCells(db);
      // Control: la denuncia sí está en la base, así que la búsqueda recorre datos reales.
      expect(cells.some((cell) => cell.text === receipt.folio)).toBe(true);
      // Se busca el nombre completo y sus partes distintivas, sin distinguir mayúsculas.
      const needles = [SYNTHETIC_NAME, 'Ximena', 'Zuloaga'].map((part) => part.toLowerCase());
      const leaks = cells.filter((cell) =>
        needles.some((needle) => cell.text.toLowerCase().includes(needle)),
      );
      expect(leaks.map((cell) => `${cell.table}.${cell.column}`)).toEqual([]);
    } finally {
      db.close();
    }
  });
});
