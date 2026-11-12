// Rutas del nodo como proveedor de la PDN, con la metodología de las APIs del S2 y del S3: servidor
// de autorización OAuth 2.0 (`POST /oauth/token`) y estadística agregada de denuncias con
// paginación (`POST /v1/denuncias/estadisticas`), que consulta la SESNA para el portal (Bases de
// la PDN, art. 61). Nunca devuelve contenido de denuncias.
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import {
  API_ERROR_MESSAGES,
  PDN_ROUTES,
  PDN_SCOPES,
  PdnStatisticsRequestSchema,
} from '@sigilo/contracts';
import type { ApiErrorCode, PdnAuthorities, PdnError } from '@sigilo/contracts';
import type { AppContext } from '../context.ts';
import { createPdnStatisticsRepository } from '../db/pdn-statistics-repository.ts';
import { requireBearer } from '../network/oauth-guard.ts';
import { freezePdnStatistics, queryPdnStatistics } from '../services/pdn-statistics.ts';

const MAX_TOKEN_BODY_BYTES = 4 * 1024;
const MAX_QUERY_BODY_BYTES = 4 * 1024;
const TOKEN_PARAMETERS = new Set([
  'grant_type',
  'client_id',
  'client_secret',
  'username',
  'password',
  'refresh_token',
  'scope',
]);

/** Error con la forma `resError` del S2 y del S3: `{ code, message }`. */
function pdnError(c: Context, code: ApiErrorCode, status: ContentfulStatusCode): Response {
  const body: PdnError = { code, message: API_ERROR_MESSAGES[code] };
  return c.json(body, status);
}

/**
 * Lee los parámetros de la petición de token en formulario o en JSON (el servidor OAuth de la PDN
 * acepta ambos). Devuelve `null` si el tipo no es uno de esos, si un parámetro se repite o si un
 * valor no es texto (RFC 6749, sección 3.2). Los parámetros desconocidos se ignoran.
 */
async function readTokenParams(c: Context): Promise<Record<string, string> | null> {
  const mediaType = (c.req.header('Content-Type') ?? '').split(';')[0]?.trim().toLowerCase();
  const params: Record<string, string> = {};
  try {
    if (mediaType === 'application/x-www-form-urlencoded') {
      const form = new URLSearchParams(await c.req.text());
      for (const [name, value] of form) {
        if (!TOKEN_PARAMETERS.has(name)) continue;
        if (name in params) return null;
        params[name] = value;
      }
      return params;
    }
    if (mediaType === 'application/json') {
      const raw: unknown = await c.req.json();
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
      for (const [name, value] of Object.entries(raw)) {
        if (!TOKEN_PARAMETERS.has(name)) continue;
        if (typeof value !== 'string') return null;
        params[name] = value;
      }
      return params;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Registra el servidor de autorización y la estadística.
 * Seguridad: los secretos, contraseñas y tokens no se registran ni se devuelven en errores; las
 * respuestas del token llevan `Cache-Control: no-store` (como toda la API) y `Pragma: no-cache`.
 */
export function registerPdnRoutes(app: Hono, ctx: AppContext): void {
  app.post(
    PDN_ROUTES.token,
    bodyLimit({
      maxSize: MAX_TOKEN_BODY_BYTES,
      onError: (c) =>
        c.json({ error: 'invalid_request', error_description: 'Petición demasiado grande.' }, 413),
    }),
    async (c) => {
      c.header('Pragma', 'no-cache');
      const params = await readTokenParams(c);
      if (params === null) {
        return c.json(
          {
            error: 'invalid_request',
            error_description: 'La petición no tiene los parámetros esperados.',
          },
          400,
        );
      }
      const outcome = await ctx.oauth.token({
        authorization: c.req.header('Authorization'),
        params,
      });
      if (outcome.status !== 200 && outcome.basicChallenge) {
        c.header('WWW-Authenticate', 'Basic realm="sigilo"');
      }
      return c.json(outcome.body, outcome.status);
    },
  );

  const repository = createPdnStatisticsRepository(ctx.deps.db);
  const freeze = (): void => {
    freezePdnStatistics({
      db: ctx.deps.db,
      repository,
      authorityName: (authorityId) => ctx.authorities.authority(authorityId)?.name ?? null,
      now: ctx.deps.now,
      ...(ctx.deps.openDataNoise === undefined ? {} : { noiseUnit: ctx.deps.openDataNoise }),
    });
  };
  const guard = requireBearer(ctx.oauth, PDN_SCOPES.statistics, (c, status) =>
    pdnError(c, status === 401 ? 'unauthorized' : 'forbidden', status),
  );

  app.post(
    PDN_ROUTES.statistics,
    guard,
    bodyLimit({
      maxSize: MAX_QUERY_BODY_BYTES,
      onError: (c) => pdnError(c, 'payload_too_large', 413),
    }),
    async (c) => {
      const mediaType = (c.req.header('Content-Type') ?? '').split(';')[0]?.trim().toLowerCase();
      if (mediaType !== 'application/json') return pdnError(c, 'unsupported_media_type', 415);
      let raw: unknown;
      try {
        raw = await c.req.json();
      } catch {
        return pdnError(c, 'bad_request', 400);
      }
      const request = PdnStatisticsRequestSchema.safeParse(raw ?? {});
      if (!request.success) return pdnError(c, 'bad_request', 400);
      freeze();
      const result = queryPdnStatistics(repository.listFrozenRows(), request.data);
      // Como en el S2 y el S3: una página que no existe es `400`.
      if (result === 'invalid-page') return pdnError(c, 'bad_request', 400);
      return c.json(result);
    },
  );

  app.get(PDN_ROUTES.statisticsAuthorities, guard, (c) => {
    const authorities: PdnAuthorities = ctx.authorities
      .listAuthorities()
      .map((item) => ({ clave: item.authorityId, nombre: item.name }))
      .sort((left, right) => left.clave.localeCompare(right.clave));
    return c.json(authorities);
  });
}
