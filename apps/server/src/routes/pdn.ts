// Rutas del nodo como proveedor de la PDN, con la metodología de las APIs del S2 y del S3: servidor
// de autorización OAuth 2.0 (`POST /oauth/token`) con el que la SESNA pide sus tokens.
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { PDN_ROUTES } from '@sigilo/contracts';
import type { AppContext } from '../context.ts';

const MAX_TOKEN_BODY_BYTES = 4 * 1024;
const TOKEN_PARAMETERS = new Set([
  'grant_type',
  'client_id',
  'client_secret',
  'username',
  'password',
  'refresh_token',
  'scope',
]);

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
 * Registra el servidor de autorización.
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
}
