// Pruebas del perfil «conexión PDN» contra un nodo de referencia en el mismo proceso (servidor de
// autorización y estadística reales, con meses cerrados) y contra nodos que incumplen las reglas
// de ValidAPI: renovación demasiado larga, errores sin `resError` y paginación que da error.
import { describe, expect, it } from 'vitest';
import { PDN_ROUTES, PDN_SCOPES } from '@sigilo/contracts';
import {
  clientSecretDigest,
  createNodeOAuthServer,
} from '../../../../apps/server/src/network/oauth-server.ts';
import { hashPassword } from '../../../../apps/server/src/security/passwords.ts';
import {
  NEXT_MONTH,
  buildComplaintRequest,
  createReporter,
  createTestServer,
  moveTo,
  submitComplaint,
} from '../../../../apps/server/src/test-support/harness.ts';
import { runPdnProfile } from './pdn-profile.ts';
import type { PdnCaseStatus, PdnFetch, PdnProfileReport } from './pdn-profile.ts';

const SECRET = 'secreto-sintetico-del-validador-pdn';
const PASSWORD = 'contraseña-sintética-del-validador';
const ORIGIN = 'http://nodo.local';

async function referenceNode(options: { refreshTokenTtlSeconds?: number } = {}) {
  let clock = Date.parse('2026-11-02T09:00:00Z');
  const server = createTestServer({
    // Redondeo fijo hacia abajo: 6 denuncias se publican como 5.
    openDataNoise: () => 0.99,
    oauth: createNodeOAuthServer({
      issuer: 'node.local',
      clock: () => clock,
      clients: [
        {
          clientId: 'sesna',
          clientSecretDigest: clientSecretDigest(SECRET),
          scopes: [PDN_SCOPES.statistics],
          grantTypes: ['password', 'refresh_token'],
          user: { username: 'sesna.pdn', passwordHash: hashPassword(PASSWORD, 10) },
        },
      ],
      ...options,
    }),
  });
  for (let index = 0; index < 6; index += 1) {
    const request = await buildComplaintRequest(server, {
      mode: 'anonymous',
      reporter: createReporter(),
      stateCode: '22',
    });
    await moveTo(server, (await submitComplaint(server, request)).folio, 'routed');
  }
  server.setNow(NEXT_MONTH);
  const fetch: PdnFetch = (input, init) => Promise.resolve(server.app.request(input, init));
  return {
    fetch,
    sleep: async (ms: number) => {
      clock += ms;
    },
  };
}

function statuses(report: PdnProfileReport): Record<string, PdnCaseStatus> {
  return Object.fromEntries(report.cases.map((item) => [item.id, item.status]));
}

const CREDENTIALS = {
  clientId: 'sesna',
  clientSecret: SECRET,
  username: 'sesna.pdn',
  password: PASSWORD,
};

describe('perfil conexión PDN contra el nodo de referencia', () => {
  it('aprueba los casos de ValidAPI y avisa de http en desarrollo y de menos de 50 registros', async () => {
    const node = await referenceNode();
    const report = await runPdnProfile({
      tokenUrl: `${ORIGIN}${PDN_ROUTES.token}`,
      queryUrl: `${ORIGIN}${PDN_ROUTES.statistics}`,
      credentials: CREDENTIALS,
      environment: 'desarrollo',
      waitForExpiry: true,
      fetch: node.fetch,
      sleep: node.sleep,
    });
    expect(statuses(report)).toEqual({
      'CPDEN-01': 'aprobado',
      'CPDEN-02': 'aprobado',
      'CPDEN-03': 'aprobado',
      'CPDEN-04': 'aprobado',
      'CPDEN-05': 'aprobado',
      'CPDEN-06': 'aprobado',
      'CPDEN-07': 'advertencia',
      'CPDEN-08': 'aprobado',
      'CPDEN-09': 'aprobado',
      'CPDEN-10': 'aprobado',
      'CPDEN-11': 'aprobado',
      'CPDEN-12': 'aprobado',
      'CPDEN-13': 'aprobado',
      'CPDEN-14': 'aprobado',
      'CPDEN-15': 'aprobado',
      'CPDEN-16': 'advertencia',
      'CPDEN-17': 'no_evaluado',
    });
    expect(report.cases.find((item) => item.id === 'CPDEN-16')?.detail).toContain(
      'menos de 50 registros',
    );
    // El reporte no lleva credenciales ni tokens.
    const text = JSON.stringify(report);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/u);
  });

  it('en productivo, http no se aprueba; sin esperar el vencimiento, ese caso no se evalúa', async () => {
    const node = await referenceNode();
    const report = await runPdnProfile({
      tokenUrl: `${ORIGIN}${PDN_ROUTES.token}`,
      queryUrl: `${ORIGIN}${PDN_ROUTES.statistics}`,
      credentials: CREDENTIALS,
      environment: 'productivo',
      fetch: node.fetch,
    });
    expect(statuses(report)['CPDEN-07']).toBe('no_aprobado');
    expect(statuses(report)['CPDEN-04']).toBe('no_evaluado');
  });

  it('un token de renovación que dura una hora no cumple la regla de 5 a 10 minutos más', async () => {
    const node = await referenceNode({ refreshTokenTtlSeconds: 3600 });
    const report = await runPdnProfile({
      tokenUrl: `${ORIGIN}${PDN_ROUTES.token}`,
      queryUrl: `${ORIGIN}${PDN_ROUTES.statistics}`,
      credentials: CREDENTIALS,
      environment: 'desarrollo',
      fetch: node.fetch,
    });
    const refresh = report.cases.find((item) => item.id === 'CPDEN-05');
    expect(refresh?.status).toBe('no_aprobado');
    expect(refresh?.detail).toContain('de 5 a 10 minutos más');
  });
});

describe('perfil conexión PDN contra un nodo que incumple', () => {
  /** Nodo con los errores típicos: `code` en texto, página fuera de rango con 400 y sin filtros vacíos. */
  const badFetch: PdnFetch = async (input, init) => {
    const url = new URL(input);
    if (url.pathname === PDN_ROUTES.token) {
      return Response.json({
        access_token: `token-${crypto.randomUUID()}`,
        token_type: 'Bearer',
        expires_in: 60,
      });
    }
    const authorization = new Headers(init.headers).get('Authorization') ?? '';
    if (!authorization.startsWith('Bearer token-')) {
      return Response.json({ code: 'unauthorized', message: 'No autorizado.' }, { status: 401 });
    }
    if (url.pathname.endsWith('/autoridades')) return Response.json([]);
    const body = JSON.parse(String(init.body)) as { page?: number; query?: object };
    if ((body.page ?? 1) > 1 || JSON.stringify(body.query ?? {}).includes('""')) {
      return Response.json({ code: 'bad_request', message: 'Página inválida.' }, { status: 400 });
    }
    return Response.json({
      pagination: { pageSize: 10, page: 1, totalRows: 0, hasNextPage: false },
      results: [],
    });
  };

  it('reporta los incumplimientos con los mensajes de ValidAPI', async () => {
    const report = await runPdnProfile({
      tokenUrl: 'https://nodo.example.org/oauth/token',
      queryUrl: 'https://nodo.example.org/v1/denuncias/estadisticas',
      credentials: { clientId: 'sesna', clientSecret: 'x' },
      environment: 'productivo',
      fetch: badFetch,
    });
    const result = statuses(report);
    expect(result['CPDEN-02']).toBe('no_aprobado');
    expect(result['CPDEN-05']).toBe('no_evaluado');
    expect(result['CPDEN-06']).toBe('no_aprobado');
    expect(result['CPDEN-07']).toBe('aprobado');
    expect(result['CPDEN-09']).toBe('no_aprobado');
    expect(result['CPDEN-12']).toBe('no_aprobado');
    expect(result['CPDEN-15']).toBe('no_aprobado');
    expect(report.cases.find((item) => item.id === 'CPDEN-15')?.detail).toContain(
      'no cuenta con la estructura especificada',
    );
    expect(report.summary.no_aprobado).toBeGreaterThan(0);
  });

  it('con 50 registros o más no avisa del volumen', async () => {
    const fetch: PdnFetch = async (input) =>
      new URL(input).pathname === PDN_ROUTES.token
        ? Response.json({ access_token: 't', token_type: 'Bearer', expires_in: 300 })
        : Response.json({
            pagination: { pageSize: 10, page: 1, totalRows: 60, hasNextPage: true },
            results: [],
          });
    const report = await runPdnProfile({
      tokenUrl: 'https://nodo.example.org/oauth/token',
      queryUrl: 'https://nodo.example.org/v1/denuncias/estadisticas',
      credentials: { clientId: 'sesna', clientSecret: 'x' },
      environment: 'desarrollo',
      fetch,
    });
    expect(statuses(report)['CPDEN-16']).toBe('aprobado');
  });
});
