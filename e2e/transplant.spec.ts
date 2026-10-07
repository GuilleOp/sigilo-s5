// Ataque de trasplante: copiar el sobre de identidad de una denuncia a otra. El servidor rechaza un
// `authVerifier` repetido y, aunque el atacante use un recibo propio, el sobre no abre con el
// contexto (AAD) de la otra denuncia.
import { readFileSync } from 'node:fs';
import { ApiErrorSchema, OpenIdentityResponseSchema } from '@sigilo/contracts';
import { importAuthorityKey, openSealedIdentity } from '../apps/web/src/crypto/authority.ts';
import { buildSubmitRequest, createReceipt } from '../apps/web/src/crypto/submission.ts';
import {
  fetchComplaintDetail,
  fetchPinnedKeys,
  postComplaint,
  prepareSealedComplaint,
  requestIdentityOpening,
  seedPreparedComplaint,
  syntheticFacts,
} from './support/api.ts';
import { expect, test } from './support/fixtures.ts';
import { fixturePath } from './support/report-wizard.ts';
import { FIXTURE_FILES } from './support/synthetic-files.ts';

const VICTIM_NAME = 'Persona Ficticia Trasplante Uno';
const LEGAL_BASIS =
  'Artículo 64 de la LGRA: diligencia ficticia de prueba para comprobar el sobre sellado.';
const OTHER_FACTS = syntheticFacts({
  stateCode: '09',
  accused: 'Otra persona ficticia, distinta de la denuncia original',
});

test('una denuncia con el authVerifier de otra es rechazada', async ({ request }) => {
  const victim = await prepareSealedComplaint(request, VICTIM_NAME);
  await seedPreparedComplaint(request, victim);

  // El atacante copia el sobre y el verificador de la víctima en una denuncia con otros hechos.
  const response = await postComplaint(request, { ...victim.body, facts: OTHER_FACTS });
  expect(response.status()).toBe(400);
  expect(ApiErrorSchema.parse(await response.json()).error.code).toBe('bad_request');
});

test('el sobre copiado con un recibo propio no abre en la otra denuncia', async ({ request }) => {
  const pinned = await fetchPinnedKeys(request);
  const keys = importAuthorityKey(
    readFileSync(fixturePath(FIXTURE_FILES.authorityKey), 'utf8'),
    pinned,
  );
  const victim = await prepareSealedComplaint(request, VICTIM_NAME);
  const original = await seedPreparedComplaint(request, victim);

  // Recibo y llaves nuevos del atacante: el servidor no puede distinguir el sobre copiado.
  const attacker = createReceipt();
  const forged = buildSubmitRequest(
    { mode: 'sealed', facts: OTHER_FACTS, evidence: [], protectionRequested: true },
    attacker.keys,
    victim.sealedIdentity,
  );
  const forgedResponse = await postComplaint(request, forged);
  expect(forgedResponse.ok()).toBe(true);
  const { folio: forgedFolio } = (await forgedResponse.json()) as { folio: string };

  // Control: en su propia denuncia, la identidad abre.
  const opened = OpenIdentityResponseSchema.parse(
    await (await requestIdentityOpening(request, original.folio, LEGAL_BASIS)).json(),
  );
  const identity = await openSealedIdentity(
    opened,
    await fetchComplaintDetail(request, original.folio),
    keys,
  );
  expect(identity.fullName).toBe(VICTIM_NAME);

  // En la denuncia del atacante, el mismo sobre no abre: el AAD liga hechos, llaves y recibo.
  const transplanted = OpenIdentityResponseSchema.parse(
    await (await requestIdentityOpening(request, forgedFolio, LEGAL_BASIS)).json(),
  );
  expect(transplanted.sealedIdentity).toEqual(victim.sealedIdentity);
  await expect(
    openSealedIdentity(transplanted, await fetchComplaintDetail(request, forgedFolio), keys),
  ).rejects.toThrow('No se pudo abrir el sobre.');
});
