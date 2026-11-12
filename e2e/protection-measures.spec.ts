// Protección de quien denuncia: la solicitud de medidas de protección viaja por el buzón cifrado y
// la autoridad la reconoce; «Cómo te cuidamos» lo explica con el CNPP; y en la vía penal la
// apertura de la identidad exige el fundamento de la lista (CNPP art. 109 fr. XXVI) y el número de
// la resolución, sin dejar de pedir dos aprobaciones. Todo con datos sintéticos.
import {
  applyProcedure,
  approveIdentityOpening,
  fetchComplaintDetail,
  prepareSealedComplaint,
  routeToInvestigation,
  seedAnonymousComplaint,
  seedPreparedComplaint,
} from './support/api.ts';
import { loginAsAuthority, openComplaint } from './support/authority.ts';
import { E2E_ACCOUNTS } from './support/environment.ts';
import { expect, test } from './support/fixtures.ts';
import { openTracking } from './support/tracking.ts';

const WORRY = 'Temo que me cambien de área sin motivo (caso sintético).';
const RESOLUTION = 'Causa penal 45/2026';
const REASON = 'El juez de control ordenó dar a conocer la identidad a la defensa (sintético).';

test('«Cómo te cuidamos» explica las medidas de protección y el CNPP en lenguaje claro', async ({
  page,
}) => {
  await page.goto('/como-te-cuidamos');
  const measures = page.getByTestId('protection-measures');
  await expect(measures.getByRole('heading', { name: 'Si temes represalias' })).toBeVisible();
  await expect(measures).toContainText('Código Nacional de Procedimientos Penales, art. 109');
  await expect(measures).toContainText('No las damos nosotros: decide la autoridad.');
});

test('la persona pide medidas de protección por el buzón y la autoridad lo reconoce', async ({
  page,
  request,
  openIsolatedPage,
}) => {
  const { folio, words } = await seedAnonymousComplaint(request);
  await routeToInvestigation(request, folio);
  await openTracking(page, folio, words);
  const mailbox = page.getByTestId('reporter-mailbox');
  const protection = mailbox.getByTestId('protection-request');
  await protection.getByText('Solicitar medidas de protección').click();
  await expect(protection).toContainText('SIGILO no otorga medidas');
  await expect(protection).toContainText('CNPP, arts. 109 fr. XVI y XIX, y 137');
  await protection.getByTestId('protection-details-input').fill(WORRY);
  await protection.getByTestId('send-protection-request').click();
  await expect(protection.getByTestId('protection-request-sent')).toBeVisible();
  const own = mailbox.getByTestId('mailbox-message').last();
  await expect(own).toContainText('Solicitud de medidas de protección');
  await expect(own).toContainText(`Lo que me preocupa: ${WORRY}`);

  // La autoridad la lee descifrada y la reconoce como solicitud de medidas.
  const authority = await openIsolatedPage();
  await loginAsAuthority(authority, E2E_ACCOUNTS.iffeInvestigator);
  await openComplaint(authority, folio);
  const thread = authority.getByTestId('authority-mailbox');
  const message = thread.getByTestId('mailbox-message').last();
  await expect(message).toContainText('Persona denunciante: pide medidas de protección');
  await expect(message).toContainText(WORRY);
});

test('en la vía penal la apertura exige el fundamento y el número de la resolución', async ({
  page,
  request,
  openIsolatedPage,
}) => {
  const prepared = await prepareSealedComplaint(request, 'Persona Sintética Vía Penal');
  const { folio, words } = await seedPreparedComplaint(request, prepared);
  await routeToInvestigation(request, folio);
  await applyProcedure(request, E2E_ACCOUNTS.iffeInvestigator, folio, {
    action: 'advance_stage',
    stage: 'criminal_investigation',
  });

  const authority = await openIsolatedPage();
  await loginAsAuthority(authority, E2E_ACCOUNTS.iffeInvestigator);
  await openComplaint(authority, folio);
  const detail = authority.getByTestId('complaint-detail');
  const criminal = detail.getByTestId('criminal-opening');
  await expect(criminal).toContainText('CNPP, art. 109 fr. XXVI');
  await expect(detail.getByLabel('Motivo')).toBeVisible();

  // Sin fundamento de la lista no se envía: el error queda junto al campo.
  await detail.getByTestId('legal-basis').fill(REASON);
  await detail.getByTestId('acknowledge-opening').check();
  await detail.getByTestId('request-identity').click();
  await expect(criminal.getByText('Error: Elige el fundamento')).toBeVisible();
  await expect(detail.getByTestId('criminal-ground')).toBeFocused();

  await detail
    .getByTestId('criminal-ground')
    .selectOption({ label: 'CNPP art. 109 fr. XXVI / resolución del Órgano jurisdiccional' });
  await detail.getByTestId('request-identity').click();
  await expect(criminal.getByText('Error: Escribe el número de la resolución')).toBeVisible();
  await detail.getByTestId('criminal-reference').fill(RESOLUTION);
  await detail.getByTestId('request-identity').click();
  await expect(detail.getByTestId('identity-request-notice')).toHaveText(
    'Solicitud registrada. Falta que otra persona de tu autoridad la apruebe.',
  );
  // Sigue la doble aprobación: sola no abre.
  await expect(detail.getByTestId('open-identity')).toHaveCount(0);

  const pending = await fetchComplaintDetail(request, folio, E2E_ACCOUNTS.iffeInvestigator);
  const requestId = pending.identityRequests?.[0]?.requestId ?? '';
  expect((await approveIdentityOpening(request, folio, requestId)).status()).toBe(200);

  // La persona ve el fundamento completo, con el número de la resolución.
  await openTracking(page, folio, words);
  const identity = page.getByTestId('identity-status');
  await expect(identity.getByTestId('identity-opened')).toContainText('1 vez');
  await expect(identity).toContainText(
    `Fundamento: «Vía penal. Fundamento: CNPP art. 109 fr. XXVI / resolución del Órgano jurisdiccional. Resolución: ${RESOLUTION}. Motivo: ${REASON}»`,
  );
});
