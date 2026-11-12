// Pruebas del nodo como proveedor de la PDN: el punto de emisión de tokens por HTTP (formulario y
// JSON, como el servidor OAuth de la PDN), la estadística con paginación al estilo del S2 y del S3,
// su protección (token, permiso, meses cerrados, redondeo y supresión que los filtros no rompen) y
// la consulta de la SESNA (cliente) a cada nodo de la red con OAuth 2.0.
import { describe, expect, it } from 'vitest';
import {
  NETWORK_ROUTES,
  NationalStatisticsSchema,
  PDN_ROUTES,
  PDN_SCOPES,
  PdnErrorSchema,
  PdnStatisticsResponseSchema,
  PdnTokenErrorSchema,
  PdnTokenResponseSchema,
} from '@sigilo/contracts';
import type { PdnStatisticsResponse } from '@sigilo/contracts';
import { clientSecretDigest, createNodeOAuthServer } from '../network/oauth-server.ts';
import { hashPassword } from '../security/passwords.ts';
import {
  NEXT_MONTH,
  buildComplaintRequest,
  createReporter,
  createTestServer,
  moveTo,
  submitComplaint,
} from '../test-support/harness.ts';
import type { TestServer } from '../test-support/harness.ts';
import { createTestNetwork, scenarioDate, submitDirect } from '../test-support/network-harness.ts';

const SECRET = 'secreto-sintetico-de-la-sesna-para-pruebas';
const PASSWORD = 'contraseña-sintética-de-la-sesna';

/** Ruido fijo que siempre redondea hacia abajo (6 → 5, 3 → 0 y se suprime). */
const ROUND_DOWN = () => 0.99;

function serverWithOAuth(): TestServer {
  return createTestServer({
    openDataNoise: ROUND_DOWN,
    oauth: createNodeOAuthServer({
      issuer: 'node.local',
      clients: [
        {
          clientId: 'sesna',
          clientSecretDigest: clientSecretDigest(SECRET),
          scopes: [PDN_SCOPES.deliveries, PDN_SCOPES.statistics],
          grantTypes: ['client_credentials', 'password', 'refresh_token'],
          user: { username: 'sesna.pdn', passwordHash: hashPassword(PASSWORD, 10) },
        },
      ],
    }),
  });
}

async function tokenFor(server: TestServer, scope: string): Promise<string> {
  const response = await server.app.request(PDN_ROUTES.token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`sesna:${SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope }).toString(),
  });
  expect(response.status).toBe(200);
  return PdnTokenResponseSchema.parse(await response.json()).access_token;
}

function query(server: TestServer, body: unknown, token?: string) {
  return server.app.request(PDN_ROUTES.statistics, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
}

async function page(server: TestServer, body: unknown, token: string) {
  const response = await query(server, body, token);
  expect(response.status).toBe(200);
  return PdnStatisticsResponseSchema.parse(await response.json());
}

async function submitMany(server: TestServer, count: number, stateCode: string) {
  const folios: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const request = await buildComplaintRequest(server, {
      mode: 'anonymous',
      reporter: createReporter(),
      stateCode,
    });
    folios.push((await submitComplaint(server, request)).folio);
  }
  return folios;
}

describe('POST /oauth/token', () => {
  it('acepta el flujo password de la PDN en JSON con client_secret_post y no guarda en caché', async () => {
    const server = serverWithOAuth();
    const response = await server.app.request(PDN_ROUTES.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'password',
        client_id: 'sesna',
        client_secret: SECRET,
        username: 'sesna.pdn',
        password: PASSWORD,
        scope: PDN_SCOPES.statistics,
      }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Pragma')).toBe('no-cache');
    const body = PdnTokenResponseSchema.parse(await response.json());
    expect(body.refresh_token).toBeDefined();
  });

  it('un secreto incorrecto en Basic responde 401 invalid_client con WWW-Authenticate Basic', async () => {
    const server = serverWithOAuth();
    const response = await server.app.request(PDN_ROUTES.token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from('sesna:otro').toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toBe('Basic realm="sigilo"');
    // RFC 6749 para los clientes OAuth y `resError` (code = estatus HTTP) para ValidAPI.
    expect(await response.json()).toEqual({
      error: 'invalid_client',
      error_description: 'No se pudo autenticar al cliente.',
      code: 401,
      message: 'No se pudo autenticar al cliente.',
    });
  });

  it('rechaza parámetros repetidos y tipos de contenido ajenos', async () => {
    const server = serverWithOAuth();
    for (const [type, body] of [
      ['application/x-www-form-urlencoded', 'grant_type=password&grant_type=client_credentials'],
      ['text/plain', 'grant_type=client_credentials'],
    ] as const) {
      const response = await server.app.request(PDN_ROUTES.token, {
        method: 'POST',
        headers: { 'Content-Type': type },
        body,
      });
      expect(response.status).toBe(400);
      expect(PdnTokenErrorSchema.parse(await response.json())).toMatchObject({
        error: 'invalid_request',
        code: 400,
      });
    }
  });

  it('el token de renovación vive 5 a 10 minutos más que el de acceso y es de un solo uso', async () => {
    const server = serverWithOAuth();
    const form = (params: Record<string, string>) =>
      server.app.request(PDN_ROUTES.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: 'sesna',
          client_secret: SECRET,
          ...params,
        }).toString(),
      });
    const issued = PdnTokenResponseSchema.parse(
      await (
        await form({ grant_type: 'password', username: 'sesna.pdn', password: PASSWORD })
      ).json(),
    );
    const extra = (issued.refresh_token_expires_in ?? 0) - issued.expires_in;
    expect(issued.expires_in).toBe(300);
    expect(extra).toBeGreaterThanOrEqual(300);
    expect(extra).toBeLessThanOrEqual(600);
    const refresh = issued.refresh_token ?? '';
    const renewed = await form({ grant_type: 'refresh_token', refresh_token: refresh });
    expect(renewed.status).toBe(200);
    const reused = await form({ grant_type: 'refresh_token', refresh_token: refresh });
    expect(reused.status).toBe(400);
    expect(PdnTokenErrorSchema.parse(await reused.json())).toMatchObject({
      error: 'invalid_grant',
      code: 400,
    });
  });
});

describe('POST /v1/denuncias/estadisticas', () => {
  it('exige un token del nodo con sesna:estadisticas y responde errores con el formato de la PDN', async () => {
    const server = serverWithOAuth();
    const missing = await query(server, {});
    expect(missing.status).toBe(401);
    expect(missing.headers.get('WWW-Authenticate')).toContain('error="invalid_token"');
    expect(PdnErrorSchema.parse(await missing.json())).toEqual({
      code: 401,
      message: 'No autorizado.',
    });
    const deliveries = await tokenFor(server, PDN_SCOPES.deliveries);
    const wrongScope = await query(server, {}, deliveries);
    expect(wrongScope.status).toBe(403);
    expect(PdnErrorSchema.parse(await wrongScope.json()).code).toBe(403);
    const catalog = await server.app.request(PDN_ROUTES.statisticsAuthorities);
    expect(catalog.status).toBe(401);
  });

  it('solo publica meses cerrados, redondeados a 5, con las celdas menores que 5 suprimidas', async () => {
    const server = serverWithOAuth();
    const folios = await submitMany(server, 6, '22');
    for (const folio of folios) await moveTo(server, folio, 'routed');
    // Tres denuncias de otra entidad: menos que la celda mínima.
    await submitMany(server, 3, '09');
    const token = await tokenFor(server, PDN_SCOPES.statistics);
    // Octubre está en curso: nada que publicar todavía.
    expect((await page(server, {}, token)).results).toEqual([]);
    server.setNow(NEXT_MONTH);
    await submitMany(server, 7, '22');
    const result = await page(server, {}, token);
    expect(result.pagination).toEqual({ pageSize: 10, page: 1, totalRows: 2, hasNextPage: false });
    const [inbox, oic] = result.results;
    // El buzón general turnó las 6 a tiempo (mismo día): 6 se publica como 5.
    expect(inbox).toMatchObject({
      mes: '2026-10',
      autoridad: { clave: 'authority.buzon-prueba' },
      entidad: { clave: '22', valor: 'Querétaro' },
      recibidas: null,
      turnadas: { aTiempo: 5, vencidas: null },
    });
    // El OIC las tenía al cerrar el día de recepción, en estatus «turnada».
    expect(oic).toMatchObject({
      mes: '2026-10',
      autoridad: { clave: 'authority.oic-prueba', nombre: expect.any(String) },
      recibidas: 5,
      tiemposMedianosDiasHabiles: { turno: null, aceptacion: null, archivo: null },
    });
    expect(oic?.estatusAlCierre.slice(0, 3)).toEqual([
      { clave: 'RECIBIDA', valor: 'Recibida', total: null },
      {
        clave: 'BUSCANDO_AUTORIDAD',
        valor: 'Buscando a la autoridad que debe atenderla',
        total: null,
      },
      { clave: 'TURNADA', valor: 'Turnada a la autoridad competente', total: 5 },
    ]);
    // Las 3 de la entidad 09 no aparecen con ningún filtro: filtrar solo elige filas publicadas.
    for (const filter of [
      { entidad: '09' },
      { mes: '2026-10', entidad: '09' },
      { estatus: 'RECIBIDA' },
    ]) {
      expect((await page(server, { query: filter }, token)).results).toEqual([]);
    }
    // `page` ya validó con el esquema que cada conteo es null o un múltiplo de 5 de al menos 5.
  });

  it('filtra, ordena y pagina como el S2 y el S3', async () => {
    const server = serverWithOAuth();
    const folios = await submitMany(server, 6, '22');
    for (const folio of folios) await moveTo(server, folio, 'routed');
    server.setNow(NEXT_MONTH);
    const token = await tokenFor(server, PDN_SCOPES.statistics);
    const first = await page(server, { pageSize: 1, sort: { autoridad: 'desc' } }, token);
    expect(first.pagination).toEqual({ pageSize: 1, page: 1, totalRows: 2, hasNextPage: true });
    expect(first.results[0]?.autoridad.clave).toBe('authority.oic-prueba');
    const second: PdnStatisticsResponse = await page(
      server,
      { page: 2, pageSize: 1, sort: { autoridad: 'desc' } },
      token,
    );
    expect(second.pagination.hasNextPage).toBe(false);
    expect(second.results[0]?.autoridad.clave).toBe('authority.buzon-prueba');
    const filtered = await page(server, { query: { autoridad: 'authority.oic-prueba' } }, token);
    expect(filtered.results.map((row) => row.autoridad.clave)).toEqual(['authority.oic-prueba']);
    // Como ValidAPI: la página después de la última es 200 con results vacío.
    const after = await page(server, { page: 3, pageSize: 1 }, token);
    expect(after).toEqual({
      pagination: { pageSize: 1, page: 3, totalRows: 2, hasNextPage: false },
      results: [],
    });
    // Filtros vacíos se ignoran y un id inexistente no es error.
    const all = await page(server, {}, token);
    expect(
      await page(server, { query: { entidad: '', conducta: '', estatus: '' } }, token),
    ).toEqual(all);
    expect((await page(server, { query: { id: 'no-existe' } }, token)).results).toEqual([]);
    const firstId = all.results[0]?.id ?? '';
    expect((await page(server, { query: { id: firstId } }, token)).results).toHaveLength(1);
    // page 0, pageSize 0 o por encima de 200, o campos desconocidos: 400 con code 400.
    for (const body of [
      { page: 0 },
      { pageSize: 0 },
      { pageSize: 201 },
      { query: { folio: 'X' } },
    ]) {
      const response = await query(server, body, token);
      expect(response.status).toBe(400);
      expect(PdnErrorSchema.parse(await response.json()).code).toBe(400);
    }
    const catalog = await server.app.request(PDN_ROUTES.statisticsAuthorities, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(catalog.status).toBe(200);
    expect(((await catalog.json()) as { clave: string }[]).map((item) => item.clave)).toContain(
      'authority.oic-prueba',
    );
  });

  it('cuerpos en el borde: null es la consulta por omisión; otros tipos y tamaños se rechazan', async () => {
    const server = serverWithOAuth();
    const token = await tokenFor(server, PDN_SCOPES.statistics);
    const all = await page(server, {}, token);
    expect(await page(server, null, token)).toEqual(all);
    expect(await page(server, { pageSize: 1 }, token)).toMatchObject({
      pagination: { pageSize: 1, page: 1 },
    });
    expect(await page(server, { pageSize: 200 }, token)).toMatchObject({
      pagination: { pageSize: 200, page: 1 },
    });
    for (const body of [
      [],
      'texto',
      7,
      { pageSize: '10' },
      { page: 1.5 },
      { sort: { folio: 'asc' } },
    ]) {
      const response = await query(server, body, token);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(PdnErrorSchema.parse(await response.json()).code).toBe(400);
    }
    const broken = await server.app.request(PDN_ROUTES.statistics, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{"page":',
    });
    expect(broken.status).toBe(400);
    const form = await server.app.request(PDN_ROUTES.statistics, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', Authorization: `Bearer ${token}` },
      body: '{}',
    });
    expect(form.status).toBe(415);
    expect(PdnErrorSchema.parse(await form.json()).code).toBe(415);
    const huge = await query(server, { query: { id: 'x'.repeat(5000) } }, token);
    expect(huge.status).toBe(413);
    expect(PdnErrorSchema.parse(await huge.json()).code).toBe(413);
  });

  it('el mes congelado no cambia aunque después cambie el trámite', async () => {
    const server = serverWithOAuth();
    const folios = await submitMany(server, 6, '22');
    server.setNow(NEXT_MONTH);
    const token = await tokenFor(server, PDN_SCOPES.statistics);
    const before = await page(server, {}, token);
    for (const folio of folios) await moveTo(server, folio, 'archived');
    expect(await page(server, {}, token)).toEqual(before);
  });
});

describe('la SESNA consulta la estadística de cada nodo', () => {
  it('pide el token a cada nodo, pagina y arma el corte nacional para el portal', async () => {
    const network = createTestNetwork();
    for (let index = 0; index < 6; index += 1) {
      const request = await buildComplaintRequest(network.federal.server, {
        mode: 'anonymous',
        reporter: createReporter(),
        stateCode: '09',
      });
      await submitDirect(network.federal, request);
    }
    network.setNow(scenarioDate(30));
    const cut = NationalStatisticsSchema.parse(await network.statistics.run());
    expect(cut.closedBefore).toBe('2026-12');
    expect(cut.nodes.map((node) => [node.nodeId, node.status])).toEqual(
      expect.arrayContaining([
        ['node.federal', 'included'],
        ['node.queretaro', 'included'],
      ]),
    );
    expect(cut.rows.every((row) => row.nodeId === 'node.federal' && row.mes === '2026-11')).toBe(
      true,
    );
    expect(cut.rows.some((row) => row.recibidas !== null)).toBe(true);
    // El enrutador lo sirve en público (solo números) para el portal.
    const response = await network.routerApp.request(NETWORK_ROUTES.nationalStatistics);
    expect(NationalStatisticsSchema.parse(await response.json())).toEqual(cut);
  });
});
