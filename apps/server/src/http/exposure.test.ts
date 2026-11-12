// Frentes del nodo (H03): en el perfil `nodo` la recepción directa (denuncias, pruebas,
// seguimiento, retos de denuncia, paso del relevo) responde como ruta inexistente, mientras la red
// de la SESNA, las lecturas públicas y el panel siguen; lo que llega cerrado por el buzón de red se
// atiende igual. Con un puerto propio del panel, cada escucha atiende solo sus frentes.
import { describe, expect, it } from 'vitest';
import {
  CORROBORATION_ROUTES,
  NETWORK_ROUTES,
  PDN_ROUTES,
  ROUTES,
  SubmitComplaintResponseSchema,
} from '@sigilo/contracts';
import { deriveReceiptKeys, generateReceiptPhrase, toBase64Url } from '@sigilo/core';
import { loadConfig } from '../config.ts';
import { createTestServer } from '../test-support/harness.ts';
import { createTestNetwork, sendThroughRouter } from '../test-support/network-harness.ts';
import { ALL_FRONTS, NODE_PROFILE_FRONTS, frontOf, restrictToFronts } from './exposure.ts';
import type { NodeFront } from './exposure.ts';

type Fetcher = (request: Request) => Response | Promise<Response>;

function call(fetcher: Fetcher, method: string, path: string, body?: unknown) {
  return fetcher(
    new Request(`http://nodo.invalid${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}

/** Rutas de la recepción directa: en el perfil `nodo` no existen. */
const INTAKE: ReadonlyArray<[string, string]> = [
  ['POST', ROUTES.complaints],
  ['POST', ROUTES.evidenceUpload],
  ['POST', ROUTES.tracking],
  ['POST', ROUTES.trackingMessages],
  ['POST', ROUTES.trackingAppeal],
  ['GET', `${ROUTES.powChallenge}?purpose=complaint`],
  ['GET', `${ROUTES.powChallenge}?purpose=message`],
  ['GET', NETWORK_ROUTES.queueChallenge],
  ['GET', NETWORK_ROUTES.nationalOpenData],
  ['GET', CORROBORATION_ROUTES.evaluatorChallenge],
  ['POST', CORROBORATION_ROUTES.evaluations],
];

describe('clasificación de rutas por frente', () => {
  it('reparte las rutas entre red, lecturas públicas, panel y recepción directa', () => {
    expect(frontOf('POST', NETWORK_ROUTES.nodeInbox, undefined)).toBe('red');
    expect(frontOf('POST', PDN_ROUTES.token, undefined)).toBe('red');
    expect(frontOf('POST', PDN_ROUTES.statistics, undefined)).toBe('red');
    expect(frontOf('GET', NETWORK_ROUTES.nodeHealth, undefined)).toBe('red');
    expect(frontOf('GET', ROUTES.ledgerEvents, undefined)).toBe('publico');
    expect(frontOf('GET', ROUTES.powChallenge, 'registration')).toBe('publico');
    expect(frontOf('POST', ROUTES.registrationRequests, undefined)).toBe('publico');
    expect(frontOf('POST', ROUTES.authLogin, undefined)).toBe('panel');
    expect(frontOf('GET', ROUTES.authorityComplaints, undefined)).toBe('panel');
    expect(frontOf('GET', ROUTES.operationRegistrations, undefined)).toBe('panel');
    expect(frontOf('GET', '/autoridad', undefined)).toBe('panel');
    // El paso del relevo solo en el frente del panel: lo usa el turnado a otro nodo.
    expect(frontOf('POST', NETWORK_ROUTES.relay, undefined)).toBe('panel');
    expect(frontOf('GET', ROUTES.powChallenge, 'complaint')).toBe('ventanilla');
    expect(frontOf('POST', ROUTES.complaints, undefined)).toBe('ventanilla');
    // Lista positiva: una ruta de la API desconocida no es de ningún frente.
    expect(frontOf('GET', '/api/v1/ruta-nueva', undefined)).toBeNull();
    expect(frontOf('POST', '/autoridad', undefined)).toBeNull();
  });
});

describe('perfil nodo', () => {
  it('sin recepción directa: las rutas de la ventanilla responden 404 como inexistentes', async () => {
    const restricted = createTestServer({ exposedFronts: NODE_PROFILE_FRONTS });
    const missing = await call(restricted.app.fetch, 'GET', '/api/v1/no-existe');
    for (const [method, path] of INTAKE) {
      const response = await call(
        restricted.app.fetch,
        method,
        path,
        method === 'GET' ? undefined : {},
      );
      expect(response.status, `${method} ${path}`).toBe(404);
      expect(await response.text()).toBe(await missing.clone().text());
    }
    // En el perfil completo (desarrollo, E2E) la denuncia directa sigue abierta.
    const complete = createTestServer();
    expect((await call(complete.app.fetch, 'POST', ROUTES.complaints, {})).status).not.toBe(404);
  });

  it('la red, las lecturas públicas y el panel siguen abiertos', async () => {
    const { app } = createTestServer({ exposedFronts: NODE_PROFILE_FRONTS });
    expect((await call(app.fetch, 'GET', ROUTES.keys)).status).toBe(200);
    expect((await call(app.fetch, 'GET', ROUTES.ledgerHead)).status).toBe(200);
    expect(
      (await call(app.fetch, 'GET', `${ROUTES.powChallenge}?purpose=registration`)).status,
    ).toBe(200);
    // El panel: credenciales equivocadas (reto señuelo del segundo paso), no ruta inexistente.
    const login = await call(app.fetch, 'POST', ROUTES.authLogin, {
      username: 'nadie.aqui',
      password: 'contraseña-equivocada',
    });
    expect(login.status).toBe(200);
    const code = await call(app.fetch, 'POST', ROUTES.authLoginCode, {
      challenge: 'reto-inexistente',
      code: '000000',
    });
    expect(code.status).toBe(401);
    expect((await call(app.fetch, 'GET', ROUTES.authorityComplaints)).status).toBe(401);
    // La SESNA: sin cliente OAuth el token es invalid_client, no 404.
    const token = await app.request(PDN_ROUTES.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials&client_id=sesna&client_secret=x',
    });
    expect(token.status).toBe(401);
  });

  it('una denuncia que llega cerrada por el buzón de red se atiende aunque no haya recepción directa', async () => {
    const network = createTestNetwork({ nodeFronts: NODE_PROFILE_FRONTS });
    await network.federal.tasks.run();
    const keys = deriveReceiptKeys(generateReceiptPhrase().entropy);
    const reply = await sendThroughRouter(network, 'authority.buzon-federal', {
      operationId: 'submitComplaint',
      body: {
        version: 1,
        mode: 'anonymous',
        facts: {
          stateCode: '22',
          entityId: 'VE-INSTITUTO',
          offenseCode: 'LGRA-59',
          occurredPeriod: '2026-03',
          accused: 'Servidor Ficticio Uno',
          description: 'Hechos sintéticos que llegan por la ventanilla única de la SESNA.',
        },
        evidence: [],
        protectionRequested: false,
        reporterKeys: {
          boxPublicKey: toBase64Url(keys.box.publicKey),
          signingPublicKey: toBase64Url(keys.signing.publicKey),
        },
        authVerifier: keys.authVerifier,
      },
    });
    expect(reply.status).toBe(201);
    if (reply.body.kind !== 'json') throw new Error('Respuesta sin cuerpo.');
    const { folio } = SubmitComplaintResponseSchema.parse(reply.body.value);
    expect(network.federal.ctx.complaints.find(folio)).not.toBeNull();
    // La misma denuncia directo al nodo no entra.
    const direct = await call(network.federal.app.fetch, 'POST', ROUTES.complaints, {});
    expect(direct.status).toBe(404);
  });
});

describe('puerto propio del panel', () => {
  it('cada escucha atiende solo sus frentes', async () => {
    const { app } = createTestServer({ exposedFronts: NODE_PROFILE_FRONTS });
    const red = restrictToFronts(app.fetch, new Set<NodeFront>(['red', 'publico']));
    const panel = restrictToFronts(app.fetch, new Set<NodeFront>(['panel', 'publico']));
    const login = { username: 'nadie.aqui', password: 'contraseña-equivocada' };
    expect((await call(red, 'POST', ROUTES.authLogin, login)).status).toBe(404);
    expect((await call(red, 'GET', '/autoridad')).status).toBe(404);
    expect((await call(panel, 'POST', ROUTES.authLogin, login)).status).toBe(200);
    expect((await call(panel, 'POST', NETWORK_ROUTES.nodeInbox, {})).status).toBe(404);
    expect((await call(panel, 'POST', PDN_ROUTES.token, {})).status).toBe(404);
    expect((await call(red, 'POST', NETWORK_ROUTES.relay, {})).status).toBe(404);
    // Las lecturas públicas en ambos.
    expect((await call(red, 'GET', ROUTES.keys)).status).toBe(200);
    expect((await call(panel, 'GET', ROUTES.keys)).status).toBe(200);
  });
});

describe('configuración del perfil', () => {
  it('completo fuera de producción, nodo en producción, y la recepción solo si se pide', () => {
    expect(loadConfig({}).profile).toBe('completo');
    expect(loadConfig({}).fronts).toEqual(ALL_FRONTS);
    const production = loadConfig({ NODE_ENV: 'production' });
    expect(production.profile).toBe('nodo');
    expect(production.fronts.has('ventanilla')).toBe(false);
    expect(loadConfig({ SIGILO_NODE_PROFILE: 'nodo' }).fronts).toEqual(NODE_PROFILE_FRONTS);
    expect(
      loadConfig({ SIGILO_NODE_PROFILE: 'nodo', SIGILO_NODE_INTAKE: '1' }).fronts.has('ventanilla'),
    ).toBe(true);
    expect(() => loadConfig({ SIGILO_NODE_PROFILE: 'panel' })).toThrow();
    expect(() => loadConfig({ SIGILO_NODE_INTAKE: 'si' })).toThrow();
    expect(loadConfig({ SIGILO_PANEL_PORT: '8788' }).panelPort).toBe(8788);
    expect(() => loadConfig({ SIGILO_PANEL_PORT: '8787' })).toThrow();
    expect(loadConfig({}).allowLegacyRelayAuth).toBe(true);
    expect(loadConfig({ SIGILO_RELAY_AUTH_LEGACY: '0' }).allowLegacyRelayAuth).toBe(false);
  });
});

describe('rutas disfrazadas en el perfil nodo', () => {
  it('codificar, duplicar barras o cambiar mayúsculas no abre la recepción directa', async () => {
    const { app } = createTestServer({ exposedFronts: NODE_PROFILE_FRONTS });
    const disguised = [
      `${ROUTES.complaints}/`,
      ROUTES.complaints.replace('/complaints', '//complaints'),
      `/${ROUTES.complaints}`,
      ROUTES.complaints.replace('complaints', '%63omplaints'),
      ROUTES.complaints.replace('complaints', 'complaints%2F'),
      ROUTES.complaints.toUpperCase(),
      `${ROUTES.complaints};x`,
      // `%2E%2E` se normaliza antes de clasificar: llega como la ruta de la ventanilla.
      ROUTES.complaints.replace('/complaints', '/authority/%2E%2E/complaints'),
      `/v1/%2e%2e${ROUTES.complaints}`,
      ROUTES.evidenceUpload.replace('evidence', '%65vidence'),
      ROUTES.tracking.replace('tracking', '%74racking'),
    ];
    for (const path of disguised) {
      const response = await call(app.fetch, 'POST', path, {});
      expect(response.status, path).toBe(404);
    }
  });

  it('una ruta del panel con segmentos codificados sigue pidiendo sesión, no llega a la ventanilla', async () => {
    const { app } = createTestServer({ exposedFronts: NODE_PROFILE_FRONTS });
    for (const tail of ['..%2Fcomplaints', '%2e%2e%2fcomplaints']) {
      const response = await call(app.fetch, 'POST', `${ROUTES.authorityComplaints}/${tail}`, {});
      expect(response.status, tail).toBe(401);
    }
  });

  it('HEAD de una lectura pública pasa; escribir en esa lectura no es de ningún frente', () => {
    expect(frontOf('HEAD', ROUTES.keys, undefined)).toBe('publico');
    expect(frontOf('POST', ROUTES.keys, undefined)).toBeNull();
    expect(frontOf('POST', ROUTES.ledgerEvents, undefined)).toBeNull();
    expect(frontOf('DELETE', NETWORK_ROUTES.nodeHealth, undefined)).toBeNull();
    // Un reto sin propósito es de la ventanilla: nunca del frente público.
    expect(frontOf('GET', ROUTES.powChallenge, undefined)).toBe('ventanilla');
  });
});
