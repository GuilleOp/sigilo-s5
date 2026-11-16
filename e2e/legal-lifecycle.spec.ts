// Ciclo de vida legal en el navegador (estándar 0.4.0): una falta grave va del Informe de Presunta
// Responsabilidad Administrativa al Tribunal, que la recibe con su propia cuenta; una abstención se
// impugna con el aviso de inconformidad y el escrito firmado que registra la autoridad; y la vista
// al Ministerio Público abre la vía penal en paralelo, sin detener la administrativa. La persona
// denunciante ve cada etapa en lenguaje sencillo. Todo con axe.
import { expectNoAccessibilityViolations } from './support/accessibility.ts';
import {
  applyProcedure,
  prepareSealedComplaint,
  routeToInvestigation,
  seedPreparedComplaint,
  syntheticFacts,
} from './support/api.ts';
import { loginAsAuthority, openComplaint } from './support/authority.ts';
import { E2E_ACCOUNTS, E2E_AUTHORITY } from './support/environment.ts';
import { expect, test } from './support/fixtures.ts';
import { openTracking } from './support/tracking.ts';

/** Autoridades de la demostración federal que no reciben lo turnado, y la fiscalía, que sí. */
const COURT = 'authority.tfja-sala-ra';
const SUPERVISOR = 'authority.oversight-federal';
const INBOX = 'authority.buzon-federal';
const PROSECUTION = 'authority.prosecutor-anticorruption';

const BASIS = 'LGRA, art. 101: fundamento sintético de la actuación de prueba.';
const AGREEMENT =
  'Acuerdo sintético de prueba: la autoridad se abstiene de iniciar el procedimiento porque no hubo daño a la hacienda pública.';

async function qualifyAndFile(
  request: Parameters<typeof applyProcedure>[0],
  folio: string,
  severity: 'serious' | 'non_serious',
): Promise<void> {
  await routeToInvestigation(request, folio);
  await applyProcedure(request, E2E_ACCOUNTS.iffeInvestigator, folio, {
    action: 'advance_stage',
    stage: 'investigation',
  });
  await applyProcedure(request, E2E_ACCOUNTS.iffeInvestigator, folio, {
    action: 'advance_stage',
    stage: 'qualification',
    qualification: {
      severity,
      legalBasis: 'LGRA, art. 100: calificación sintética de prueba.',
      agreement: `Con fundamento en el artículo 100 de la LGRA se califica la conducta (acuerdo sintético, ${severity}).`,
    },
  });
  await applyProcedure(request, E2E_ACCOUNTS.iffeInvestigator, folio, {
    action: 'advance_stage',
    stage: 'report_filed',
  });
}

test('falta grave: del informe a la audiencia inicial y el Tribunal recibe el expediente', async ({
  page,
  request,
}) => {
  const prepared = await prepareSealedComplaint(
    request,
    'Persona Ficticia Tribunal',
    syntheticFacts(),
  );
  const { folio, words } = await seedPreparedComplaint(request, prepared);
  await qualifyAndFile(request, folio, 'serious');
  for (const stage of ['report_admitted', 'summoned', 'initial_hearing'] as const) {
    await applyProcedure(request, E2E_ACCOUNTS.iffeSubstantiation, folio, {
      action: 'advance_stage',
      stage,
    });
  }

  // La substanciadora envía el expediente al Tribunal desde el panel: solo esa rama, por ser grave.
  await loginAsAuthority(page, E2E_ACCOUNTS.iffeSubstantiation);
  await openComplaint(page, folio);
  let panel = page.getByTestId('procedure-panel');
  await panel.getByTestId('procedure-action').selectOption('advance_stage');
  const stage = panel.getByTestId('procedure-stage');
  await expect(stage.locator('option[value="evidence_hearing"]')).toHaveCount(0);
  await stage.selectOption('case_file_sent');
  await panel.getByTestId('apply-procedure').click();
  await expect(panel.getByTestId('procedure-state')).toContainText(
    'Envío del expediente al Tribunal',
  );
  // Con cuentas del Tribunal, la substanciación no avanza sus etapas.
  await expect(
    panel.getByTestId('procedure-action').locator('option[value="advance_stage"]'),
  ).toHaveCount(0);
  // La substanciación ve el estado de la identidad, pero no solicita ni aprueba aperturas.
  await expect(page.getByTestId('request-identity')).toHaveCount(0);
  await expect(page.getByTestId('identity-custodian-only')).toBeVisible();

  // La Sala entra con su cuenta, ve el expediente y lo recibe.
  await loginAsAuthority(page, E2E_ACCOUNTS.court);
  await openComplaint(page, folio);
  panel = page.getByTestId('procedure-panel');
  await panel.getByTestId('procedure-action').selectOption('advance_stage');
  await panel.getByTestId('procedure-stage').selectOption('court_received');
  await panel.getByTestId('apply-procedure').click();
  await expect(panel.getByTestId('procedure-state')).toContainText('Recibido en el Tribunal');
  // El Tribunal no ve el buzón de la persona ni pide aperturas de su identidad; tampoco descarta
  // pruebas ni se excusa por la autoridad que investigó.
  await expect(page.getByTestId('authority-mailbox')).toHaveCount(0);
  await expect(page.getByTestId('discard-evidence')).toHaveCount(0);
  await expect(page.getByTestId('conflict-submit')).toHaveCount(0);
  await expectNoAccessibilityViolations(page, 'panel del Tribunal');

  // La persona ve la etapa en lenguaje sencillo y lo que sigue en el Tribunal.
  await openTracking(page, folio, words);
  await expect(page.getByTestId('tracking-legal-stage')).toContainText('Recibido en el Tribunal');
  await expect(page.getByTestId('procedure-steps')).toContainText('Audiencia inicial');
  await expect(page.getByTestId('procedure-steps')).toContainText('Pruebas en el Tribunal');
  await expectNoAccessibilityViolations(page, 'seguimiento en el Tribunal');
});

test('abstención: aviso de inconformidad, escrito con firma y resolución de la Sala', async ({
  page,
  request,
}) => {
  const prepared = await prepareSealedComplaint(
    request,
    'Persona Ficticia Abstención',
    syntheticFacts({ offenseCode: 'LGRA-50' }),
  );
  const { folio, words } = await seedPreparedComplaint(request, prepared);
  await qualifyAndFile(request, folio, 'non_serious');

  // La substanciadora se abstiene con fundamento y acuerdo (LGRA, art. 101).
  await loginAsAuthority(page, E2E_ACCOUNTS.iffeSubstantiation);
  await openComplaint(page, folio);
  const panel = page.getByTestId('procedure-panel');
  await panel.getByTestId('procedure-action').selectOption('advance_stage');
  await panel.getByTestId('procedure-stage').selectOption('abstention');
  await panel.getByTestId('procedure-legal-basis').fill(BASIS);
  await panel.getByTestId('procedure-agreement').fill(AGREEMENT);
  await panel.getByTestId('apply-procedure').click();
  await expect(panel.getByTestId('procedure-state')).toContainText('Abstención');

  // La notificación por el buzón abre los 5 días hábiles para inconformarse.
  await loginAsAuthority(page, E2E_ACCOUNTS.iffeInvestigator);
  await openComplaint(page, folio);
  await page.getByTestId('authority-question').fill('Te notificamos la abstención (sintético).');
  await page.getByTestId('send-question').click();
  await expect(page.getByTestId('authority-mailbox')).toContainText('Te notificamos');

  // La persona prepara el aviso: el sistema nunca dice que ya presentó la inconformidad.
  await openTracking(page, folio, words);
  const appeal = page.getByTestId('tracking-appeal');
  await expect(appeal).toContainText('Abstención');
  await expect(appeal.getByTestId('appeal-window')).toContainText('Tienes 5 días hábiles');
  await expect(appeal.getByTestId('appeal-window')).not.toContainText('29');
  await appeal
    .getByTestId('appeal-reasons')
    .fill('Sí hubo daño a la hacienda pública: no procede la abstención (motivos sintéticos).');
  await appeal.getByTestId('appeal-consent').check();
  await appeal.getByTestId('appeal-submit').click();
  await expect(appeal.getByTestId('appeal-filed')).toContainText('Todavía no es el recurso');
  await expect(appeal).not.toContainText('Presentaste tu inconformidad');
  await expectNoAccessibilityViolations(page, 'seguimiento con aviso de inconformidad');

  // La autoridad investigadora registra el escrito con firma autógrafa.
  await loginAsAuthority(page, E2E_ACCOUNTS.iffeInvestigator);
  await openComplaint(page, folio);
  const investigation = page.getByTestId('procedure-panel');
  await investigation.getByTestId('procedure-action').selectOption('file_remedy');
  await investigation.getByTestId('remedy-kind').selectOption('inconformity');
  await investigation.getByTestId('apply-procedure').click();
  await expect(investigation.getByTestId('procedure-message')).toContainText('Revisa');
  await investigation.getByTestId('remedy-signed').check();
  await investigation.getByTestId('apply-procedure').click();
  await expect(page.getByTestId('procedure-inconformity')).toContainText('presentada con firma');

  // La Sala la resuelve y la persona ve el resultado.
  await applyProcedure(request, E2E_ACCOUNTS.court, folio, {
    action: 'resolve_remedy',
    kind: 'inconformity',
    outcome: 'confirmed',
    legalBasis: 'LGRA, art. 107: la Sala confirma la abstención (sintético).',
  });
  await openTracking(page, folio, words);
  await expect(page.getByTestId('appeal-signed')).toContainText(
    'Inconformidad presentada con firma',
  );
  await expect(page.getByTestId('appeal-outcome')).toContainText('Confirmada');
});

test('vista al Ministerio Público: la vía penal corre en paralelo a la administrativa', async ({
  page,
  request,
}) => {
  const prepared = await prepareSealedComplaint(
    request,
    'Persona Ficticia Penal',
    syntheticFacts(),
  );
  const { folio, words } = await seedPreparedComplaint(request, prepared);
  await routeToInvestigation(request, folio);
  await applyProcedure(request, E2E_ACCOUNTS.iffeInvestigator, folio, {
    action: 'advance_stage',
    stage: 'investigation',
  });

  await loginAsAuthority(page, E2E_ACCOUNTS.iffeInvestigator);
  await openComplaint(page, folio);
  const panel = page.getByTestId('procedure-panel');
  await panel.getByTestId('procedure-action').selectOption('refer_to_prosecutor');
  await expect(panel.getByTestId('referral-basis')).toContainText('LGRA, art. 10, fracc. III');
  // Dice lo que hace: registra la vista; remitir la denuncia a la fiscalía es un paso aparte.
  await expect(panel.getByTestId('referral-hint')).toContainText('Aquí se registra la vista');
  await expect(panel.getByTestId('referral-hint')).toContainText('es un paso aparte');
  await panel
    .getByTestId('referral-prosecutor')
    .fill('Fiscalía Ficticia Especializada en Hechos de Corrupción');
  await panel.getByTestId('apply-procedure').click();
  await expect(panel.getByTestId('procedure-criminal-stage')).toContainText(
    'Denuncia penal presentada',
  );
  await expect(panel.getByTestId('procedure-state')).toContainText('Investigación');
  // La investigadora no avanza la vía penal: eso lo registra la fiscalía.
  await panel.getByTestId('procedure-action').selectOption('advance_stage');
  await expect(panel.getByTestId('procedure-stage')).not.toContainText('Vía penal');
  await expectNoAccessibilityViolations(page, 'panel con la vía penal en paralelo');

  // La vía administrativa sigue: la autoridad califica mientras la penal corre.
  await applyProcedure(request, E2E_ACCOUNTS.iffeInvestigator, folio, {
    action: 'advance_stage',
    stage: 'qualification',
    qualification: {
      severity: 'serious',
      legalBasis: 'LGRA, art. 100: calificación sintética de prueba.',
      agreement:
        'Con fundamento en el artículo 100 de la LGRA se califica la conducta como grave (sintético).',
    },
  });
  await openTracking(page, folio, words);
  await expect(page.getByTestId('tracking-legal-stage')).toContainText('Calificación de la falta');
  await expect(page.getByTestId('tracking-criminal-stage')).toContainText(
    'Denuncia penal presentada',
  );
  await expect(page.getByTestId('procedure-steps')).toContainText('Vista al Ministerio Público');
  await expectNoAccessibilityViolations(page, 'seguimiento con la vía penal en paralelo');
});

test('solo la fiscalía avanza la vía penal; el buzón turna solo a quien puede aceptar', async ({
  page,
  request,
}) => {
  const prepared = await prepareSealedComplaint(
    request,
    'Persona Ficticia Fiscalía',
    syntheticFacts(),
  );
  const { folio } = await seedPreparedComplaint(request, prepared);

  // El buzón no ofrece al Tribunal, a la supervisora ni a sí mismo como destino; la fiscalía sí.
  await loginAsAuthority(page, E2E_ACCOUNTS.inboxIntake);
  await openComplaint(page, folio);
  let detail = page.getByTestId('complaint-detail');
  const target = detail.getByTestId('procedure-authority');
  for (const authorityId of [COURT, SUPERVISOR, INBOX]) {
    await expect(target.locator(`option[value="${authorityId}"]`)).toHaveCount(0);
  }
  await expect(target.locator(`option[value="${E2E_AUTHORITY}"]`)).toHaveCount(1);
  // El buzón solo recibe y turna: no pide aperturas de la identidad sellada.
  await expect(detail.getByTestId('request-identity')).toHaveCount(0);
  await target.selectOption(PROSECUTION);
  await detail
    .getByTestId('procedure-note')
    .fill('Los hechos pueden ser delito: se turna a la fiscalía (nota sintética).');
  await detail.getByTestId('apply-procedure').click();
  await expect(detail.getByTestId('procedure-message')).toContainText('Listo');

  // La fiscalía acepta y solo ve la vía penal: ni la investigación administrativa, ni la vista a
  // sí misma, ni el plazo del art. 64 fr. II de la LGRA.
  await loginAsAuthority(page, E2E_ACCOUNTS.prosecution);
  await openComplaint(page, folio);
  detail = page.getByTestId('complaint-detail');
  await expect(detail.getByTestId('procedure-action')).toHaveValue('accept');
  await detail.getByTestId('apply-procedure').click();
  await expect(detail.getByTestId('procedure-state')).toHaveText('Aceptada');
  const panel = page.getByTestId('procedure-panel');
  await expect(
    panel.getByTestId('procedure-action').locator('option[value="refer_to_prosecutor"]'),
  ).toHaveCount(0);
  await panel.getByTestId('procedure-action').selectOption('advance_stage');
  const stage = panel.getByTestId('procedure-stage');
  await expect(stage.locator('option[value="investigation"]')).toHaveCount(0);
  await expect(stage).toContainText('Vía penal: Iniciar la investigación penal');
  await expect(panel.getByText('Iniciar ante una posible falta grave')).toHaveCount(0);
  await stage.selectOption('criminal_investigation');
  await panel.getByTestId('apply-procedure').click();
  await expect(panel.getByTestId('procedure-criminal-stage')).toContainText('Investigación penal');
  await expectNoAccessibilityViolations(page, 'panel de la fiscalía');
});
