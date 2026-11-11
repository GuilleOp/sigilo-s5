// Recurso de inconformidad con dos aprobaciones (H7) y lista de escalamientos de la supervisora:
// la persona se inconforma contra la calificación de no grave, el panel pide dos aprobaciones de
// personas distintas (una de supervisión) antes de entregar el sobre, la entrega queda en el libro
// de aperturas de la persona; y una justificación propia ante un conflicto escala la denuncia, que
// la supervisora ve en su panel. Todo con axe.
import { ROUTES } from '@sigilo/contracts';
import { deriveReceiptKeys, phraseToEntropy, toBase64Url } from '@sigilo/core';
import { POW_HEADER } from '@sigilo/contracts';
import { expectNoAccessibilityViolations } from './support/accessibility.ts';
import {
  applyProcedure,
  prepareSealedComplaint,
  routeToInvestigation,
  seedAnonymousComplaint,
  seedPreparedComplaint,
  solveProofOfWork,
  syntheticFacts,
} from './support/api.ts';
import { loginAsAuthority, openComplaint } from './support/authority.ts';
import { API_ORIGIN, E2E_ACCOUNTS, E2E_AUTHORITY } from './support/environment.ts';
import { expect, test } from './support/fixtures.ts';
import { openTracking } from './support/tracking.ts';

const NAME = 'Persona Ficticia Recurso';
// La persona denunciada del escenario: el S1 sintético la une a la titular del OIC (conflicto).
const FACTS = syntheticFacts({
  entityId: 'VE-INSTITUTO',
  offenseCode: 'LGRA-59',
  accused: 'Servidor Ficticio Uno, Jefe del Departamento de Compras',
});
const AGREEMENT =
  'Con fundamento en el artículo 100 de la Ley General de Responsabilidades Administrativas, se califica la conducta como falta no grave (acuerdo sintético de prueba).';
const BASIS = 'LGRA, art. 109: integrar el recurso de inconformidad (fundamento sintético).';

test('el sobre del recurso exige dos aprobaciones, una de supervisión, y la persona lo ve', async ({
  page,
  request,
}) => {
  const prepared = await prepareSealedComplaint(request, NAME, FACTS);
  const { folio, words } = await seedPreparedComplaint(request, prepared);
  await routeToInvestigation(request, folio);
  await applyProcedure(request, E2E_ACCOUNTS.iffeInvestigator, folio, {
    action: 'advance_stage',
    stage: 'investigation',
  });
  await applyProcedure(request, E2E_ACCOUNTS.iffeInvestigator, folio, {
    action: 'advance_stage',
    stage: 'qualification',
    qualification: {
      severity: 'non_serious',
      legalBasis: 'LGRA, art. 100: calificación sintética de prueba.',
      agreement: AGREEMENT,
    },
  });
  // La persona se inconforma y acepta abrir su identidad solo para el recurso.
  const keys = deriveReceiptKeys(phraseToEntropy(words));
  const appeal = await request.post(`${API_ORIGIN}${ROUTES.trackingAppeal}`, {
    headers: { [POW_HEADER]: await solveProofOfWork(request, 'message') },
    data: {
      folio,
      authKey: toBase64Url(keys.authKey),
      reasons: 'No estoy de acuerdo: los hechos son graves (motivos sintéticos).',
      revealIdentityForAppeal: true,
    },
  });
  expect(appeal.status()).toBe(201);

  // Primera aprobación: investigación. Todavía no se puede recibir el sobre.
  await loginAsAuthority(page, E2E_ACCOUNTS.iffeInvestigator);
  await openComplaint(page, folio);
  let panel = page.getByTestId('identity-appeal');
  await expect(panel).toContainText('al menos una de supervisión');
  await panel.getByTestId('appeal-legal-basis').fill(BASIS);
  await panel.getByTestId('approve-appeal').click();
  await expect(panel).toContainText('Aprobaciones: 1 de 2');
  await expect(panel.getByTestId('open-appeal-identity')).toHaveCount(0);
  await expectNoAccessibilityViolations(page, 'panel: recurso con una aprobación');

  // Segunda aprobación: supervisión. Ya puede recibir el sobre y abrirlo en el navegador.
  await loginAsAuthority(page, E2E_ACCOUNTS.iffeSupervision);
  await openComplaint(page, folio);
  panel = page.getByTestId('identity-appeal');
  await panel.getByTestId('appeal-legal-basis').fill(BASIS);
  await panel.getByTestId('approve-appeal').click();
  await expect(panel).toContainText('Aprobaciones: 2 de 2');
  await panel.getByTestId('open-appeal-identity').click();
  await expect(page.getByTestId('opened-identity')).toContainText(NAME);

  // La persona ve la apertura para su recurso y la entrega del sobre en su libro de aperturas.
  await openTracking(page, folio, words);
  const identity = page.getByTestId('identity-status');
  await expect(identity.getByTestId('identity-appeal-opening')).toBeVisible();
  await expect(identity.getByTestId('identity-release-entry')).toHaveCount(1);
  await expectNoAccessibilityViolations(page, 'seguimiento con libro de aperturas');
});

test('la supervisora ve en su panel la denuncia escalada por una justificación propia', async ({
  page,
  request,
}) => {
  const { folio } = await seedAnonymousComplaint(request, FACTS);
  await applyProcedure(request, E2E_ACCOUNTS.inboxIntake, folio, {
    action: 'route',
    authorityId: E2E_AUTHORITY,
    note: 'Se turna a la autoridad competente para el ente (motivo sintético).',
  });
  await applyProcedure(request, E2E_ACCOUNTS.iffeIntake, folio, {
    action: 'respond_conflict',
    response: 'justification',
    note: 'La titular no participa en esta investigación (nota sintética).',
  });

  // Las reglas corren en la tarea periódica: la lista se vuelve a pedir hasta que aparece.
  await expect(async () => {
    await loginAsAuthority(page, E2E_ACCOUNTS.supervisor);
    await expect(page.getByTestId('escalations')).toBeVisible();
    await expect(page.getByTestId('escalation-item').filter({ hasText: folio })).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 30_000 });
  // Agrupada por regla: el nombre y la explicación de la regla van una vez, en el grupo.
  const group = page.getByTestId('escalation-group').filter({ hasText: folio });
  await expect(group.getByRole('heading', { level: 3 })).toContainText('Justificación propia');
  const item = group.getByTestId('escalation-item').filter({ hasText: folio });
  // La autoridad de origen va con su nombre, no con su identificador interno.
  await expect(item.getByTestId('escalation-origin')).not.toContainText('authority.');
  await expectNoAccessibilityViolations(page, 'panel: escalamientos de la supervisora');
  // «Abrir» lleva a lo que permite abrir la segunda llave: pide la llave de la supervisora.
  await item.getByTestId('escalation-open').click();
  const opener = page.getByTestId('escalation-opener');
  await expect(opener).toContainText(folio);
  await expect(page.locator('#escalation-opener-title')).toBeFocused();
  await expect(opener.getByTestId('supervisor-key-file')).toBeVisible();
  await opener.getByRole('button', { name: 'Volver a los escalamientos' }).click();
  await expect(page.getByTestId('escalations')).toBeVisible();
});
