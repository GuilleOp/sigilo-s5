// Denuncia con identidad sellada: trámite en el panel con cuentas individuales (el buzón general
// turna, la autoridad acepta e investiga, pregunta y abre la identidad 2 de 3), seguimiento con la
// pregunta descifrada y la apertura visible, respuesta de la persona y, al final, la base de datos
// sin la identidad en claro.
import { expect, test } from './support/fixtures.ts';
import { approveIdentityOpening, applyProcedure, fetchComplaintDetail } from './support/api.ts';
import { loginAsAuthority, openComplaint } from './support/authority.ts';
import { E2E_ACCOUNTS, E2E_AUTHORITY } from './support/environment.ts';
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

  test('la autoridad tramita, pregunta y abre la identidad 2 de 3; la persona lo ve y responde', async ({
    page,
    request,
    openIsolatedPage,
  }) => {
    await reachSubmitStep(page, 'sealed', SYNTHETIC_NAME);
    await expect(page.getByText('También guardaremos tu nombre bajo llave')).toBeVisible();
    receipt = await submitAndKeepReceipt(page);

    // Panel de autoridad, en otro navegador: la recepción del buzón general la turna.
    const authority = await openIsolatedPage();
    await loginAsAuthority(authority);
    await openComplaint(authority, receipt.folio);
    const inbox = authority.getByTestId('complaint-detail');
    await expect(inbox).toContainText('Sellada; aperturas registradas: 0');
    await expect(inbox).not.toContainText(SYNTHETIC_NAME);
    // El mismo día, el evento de recepción aún no se publica: las llaves no están verificadas.
    await expect(inbox.getByTestId('reporter-keys-unverified')).toHaveText(
      'Las llaves de la persona aún no están verificadas contra el registro público.',
    );
    // Quien turna no puede abrir identidades: no ve el formulario de apertura.
    await expect(inbox.getByTestId('procedure-action')).toHaveValue('route');
    await inbox.getByTestId('procedure-authority').selectOption(E2E_AUTHORITY);
    // Turnar exige el motivo: la persona lo leerá en su seguimiento.
    await inbox
      .getByTestId('procedure-note')
      .fill('Los hechos ocurrieron en el ente: le toca a su órgano interno de control.');
    await inbox.getByTestId('apply-procedure').click();
    await expect(inbox.getByTestId('procedure-message')).toHaveText(
      'Listo: Turnar a una autoridad. La denuncia ya no está en tu bandeja.',
    );
    // La recepción del OIC la acepta (por la API, con su propia cuenta).
    await applyProcedure(request, E2E_ACCOUNTS.iffeIntake, receipt.folio, { action: 'accept' });

    // La investigación del OIC inicia la etapa de investigación, pregunta y pide abrir.
    await loginAsAuthority(authority, E2E_ACCOUNTS.iffeInvestigator);
    await openComplaint(authority, receipt.folio);
    const detail = authority.getByTestId('complaint-detail');
    await expect(detail.getByTestId('procedure-action')).toHaveValue('advance_stage');
    await detail.getByTestId('procedure-stage').selectOption('investigation');
    await detail.getByTestId('apply-procedure').click();
    await expect(detail.getByTestId('detail-status')).toHaveText('Aceptada · Etapa: Investigación');

    await detail.getByTestId('authority-question').fill(QUESTION);
    await detail.getByTestId('send-question').click();
    await expect(detail.getByText('Pregunta enviada cifrada.')).toBeVisible();
    await expect(detail.getByTestId('mailbox-message')).toHaveCount(1);

    // Apertura 2 de 3: una persona solicita; sola no puede abrir.
    await detail.getByTestId('legal-basis').fill(LEGAL_BASIS);
    await detail.getByTestId('acknowledge-opening').check();
    await detail.getByTestId('request-identity').click();
    await expect(detail.getByTestId('identity-request-notice')).toHaveText(
      'Solicitud registrada. Falta que otra persona de tu autoridad la apruebe.',
    );
    await expect(detail.getByTestId('open-identity')).toHaveCount(0);
    // Otra persona de la misma autoridad aprueba con su fundamento.
    const pending = await fetchComplaintDetail(
      request,
      receipt.folio,
      E2E_ACCOUNTS.iffeInvestigator,
    );
    const requestId = pending.identityRequests?.[0]?.requestId ?? '';
    const approval = await approveIdentityOpening(request, receipt.folio, requestId);
    expect(approval.status()).toBe(200);
    // Con el umbral alcanzado, quien solicitó abre el sobre en su navegador.
    await authority.getByRole('button', { name: 'Volver al listado' }).click();
    await openComplaint(authority, receipt.folio);
    await detail.getByTestId('open-identity').click();
    await expect(detail.getByTestId('opened-identity')).toContainText(SYNTHETIC_NAME);
    await expect(detail).toContainText('Sellada; aperturas registradas: 1');

    // Seguimiento de la persona denunciante.
    await openTracking(page, receipt.folio, receipt.words);
    const view = page.getByTestId('tracking-view');
    await expect(view.getByRole('heading', { name: 'Estado: Investigación' })).toBeVisible();
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
    await advanceServerClockToNextDay();
    // Con el reloj adelantado un día, la sesión venció por inactividad: se vuelve a entrar.
    await loginAsAuthority(authority, E2E_ACCOUNTS.iffeInvestigator);
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
