// OAuth 2.0 entre la SESNA y cada nodo, con la metodología de las APIs de la PDN (S2 y S3): cada
// nodo es el proveedor y su propio servidor de autorización (`POST /oauth/token`); la SESNA es el
// cliente con credenciales que le entrega cada nodo. Flujos: `password` (el que usan hoy las APIs
// de la PDN), `client_credentials` (el recomendado) y `refresh_token`.
import { z } from 'zod';

/**
 * Rutas que sirve cada nodo para la PDN, fuera de `/api/v1` para coincidir con las de las APIs de
 * la PDN (`/oauth/token`, `/v1/<recurso>`).
 */
export const PDN_ROUTES = {
  /** `POST`: emite tokens (RFC 6749, sección 3.2). */
  token: '/oauth/token',
  /** `POST`: estadística agregada de denuncias, con paginación como las APIs del S2 y del S3. */
  statistics: '/v1/denuncias/estadisticas',
  /** `GET`: autoridades del nodo, como `/v1/spic/dependencias` del S2. */
  statisticsAuthorities: '/v1/denuncias/estadisticas/autoridades',
} as const;

/** Permisos (scopes) que un nodo concede a la SESNA. */
export const PDN_SCOPES = {
  /** La SESNA entrega sobres de la ventanilla única al buzón de red del nodo. */
  deliveries: 'sesna:entregas',
  /** La SESNA consulta la estadística agregada para el portal de la PDN (Bases, art. 61). */
  statistics: 'sesna:estadisticas',
  /** Reservado para una API de salud del nodo; hoy ninguna ruta lo exige. */
  health: 'sesna:salud',
} as const;

export const PdnScopeSchema = z
  .enum([PDN_SCOPES.deliveries, PDN_SCOPES.statistics, PDN_SCOPES.health])
  .meta({
    description:
      'Permiso: sesna:entregas (entregar sobres al buzón de red), sesna:estadisticas (consultar la estadística agregada) o sesna:salud (reservado para la salud del nodo).',
  });
export type PdnScope = z.infer<typeof PdnScopeSchema>;

/** Descripción de cada permiso, para el estándar. */
export const PDN_SCOPE_DESCRIPTIONS: Readonly<Record<PdnScope, string>> = {
  'sesna:entregas': 'Entregar sobres de la ventanilla única al buzón de red del nodo.',
  'sesna:estadisticas':
    'Consultar la estadística agregada de denuncias (meses cerrados, redondeo y supresión).',
  'sesna:salud': 'Reservado: consultar la salud del nodo (todavía sin ruta).',
};

/** Vida de un token de acceso, en segundos (corta: la SESNA pide otro al vencer). */
export const PDN_ACCESS_TOKEN_TTL_SECONDS = 300;

/**
 * Vida de un token de renovación, en segundos: la del token de acceso más 7 minutos. ValidAPI (la
 * herramienta con la que la SESNA prueba las APIs de los proveedores) exige que dure entre 5 y 10
 * minutos más que `expires_in` y que sea de un solo uso.
 */
export const PDN_REFRESH_TOKEN_TTL_SECONDS = PDN_ACCESS_TOKEN_TTL_SECONDS + 7 * 60;

/** Flujos que acepta el servidor de autorización del nodo. */
export const PdnGrantTypeSchema = z.enum(['password', 'client_credentials', 'refresh_token']).meta({
  description:
    'Flujo: password (el de las APIs de la PDN; desaconsejado en OAuth 2.1), client_credentials (recomendado) o refresh_token.',
});
export type PdnGrantType = z.infer<typeof PdnGrantTypeSchema>;

const CredentialSchema = z.string().min(1).max(256);

export const PdnTokenRequestSchema = z
  .object({
    grant_type: PdnGrantTypeSchema,
    client_id: CredentialSchema.optional().meta({
      description:
        'Identificador del cliente, si no va en la cabecera `Authorization: Basic` (client_secret_post, como en la PDN).',
    }),
    client_secret: CredentialSchema.optional().meta({
      description: 'Secreto del cliente, si no va en la cabecera `Authorization: Basic`.',
    }),
    username: CredentialSchema.optional().meta({
      description: 'Usuario que el nodo entregó a la SESNA (solo `password`).',
    }),
    password: CredentialSchema.optional().meta({
      description: 'Contraseña de ese usuario (solo `password`).',
    }),
    refresh_token: CredentialSchema.optional().meta({
      description: 'Token de renovación (solo `refresh_token`); cada uso entrega uno nuevo.',
    }),
    scope: z
      .string()
      .max(256)
      .optional()
      .meta({
        description: 'Permisos separados por espacios; si falta, todos los que tiene el cliente.',
        examples: ['sesna:estadisticas'],
      }),
  })
  .strict()
  .meta({
    description:
      'Petición de token (RFC 6749, secciones 4.3, 4.4 y 6), en `application/x-www-form-urlencoded` o en JSON como acepta el servidor OAuth de la PDN.',
  });
export type PdnTokenRequest = z.infer<typeof PdnTokenRequestSchema>;

export const PdnTokenResponseSchema = z
  .object({
    access_token: z.string().min(1).meta({
      description: 'Token de acceso (JWT HS256 que solo verifica el nodo que lo emitió).',
    }),
    token_type: z.literal('Bearer').meta({ description: 'Siempre `Bearer` (RFC 6750).' }),
    expires_in: z
      .number()
      .int()
      .min(1)
      .meta({ description: 'Segundos de vida del token de acceso.', examples: [300] }),
    scope: z.string().meta({ description: 'Permisos concedidos, separados por espacios.' }),
    refresh_token: z.string().min(1).optional().meta({
      description: 'Token de renovación de un solo uso; solo con el flujo `password`.',
    }),
    refresh_token_expires_in: z.number().int().min(1).optional().meta({
      description: 'Segundos de vida del token de renovación (campo del servidor OAuth de la PDN).',
    }),
  })
  .strict()
  .meta({ description: 'Token emitido (RFC 6749, sección 5.1).' });
export type PdnTokenResponse = z.infer<typeof PdnTokenResponseSchema>;

/** Errores del servidor de autorización (RFC 6749, sección 5.2). */
export const PDN_TOKEN_ERRORS = [
  'invalid_request',
  'invalid_client',
  'invalid_grant',
  'unauthorized_client',
  'unsupported_grant_type',
  'invalid_scope',
] as const;

/**
 * Código y mensaje en el primer nivel, como el `resError` de las especificaciones del S2 y del S3:
 * `code` es el estatus HTTP de la respuesta (ValidAPI exige un número entre 400 y 499 que coincida
 * con él) y `message` un texto fijo.
 */
const ResErrorShape = {
  code: z
    .number()
    .int()
    .min(400)
    .max(599)
    .meta({ description: 'Estatus HTTP de la respuesta (400 a 499, o 500).', examples: [401] }),
  message: z.string().min(1).meta({ description: 'Mensaje fijo, sin datos de la petición.' }),
};

export const PdnTokenErrorSchema = z
  .object({
    error: z.enum(PDN_TOKEN_ERRORS).meta({ description: 'Código de error de RFC 6749.' }),
    error_description: z.string().meta({ description: 'Texto fijo, sin datos de la petición.' }),
    ...ResErrorShape,
  })
  .strict()
  .meta({
    description:
      'Error del servidor de autorización: los campos de RFC 6749 (sección 5.2), que leen los clientes OAuth, más `code` (el estatus HTTP) y `message` (el mismo texto que `error_description`) del `resError` de la PDN, que revisa ValidAPI. Los dos formatos conviven porque no chocan.',
  });
export type PdnTokenError = z.infer<typeof PdnTokenErrorSchema>;

/** Parte RFC 6749 de un error del token; la ruta le agrega `code` y `message`. */
export type PdnTokenErrorBody = Pick<PdnTokenError, 'error' | 'error_description'>;

/**
 * Error de los recursos de la PDN (`resError` de las especificaciones del S2 y del S3): código y
 * mensaje en el primer nivel.
 */
export const PdnErrorSchema = z.object(ResErrorShape).strict().meta({
  description:
    'Error de un recurso de la PDN (formato `resError` del S2 y del S3): `code` es el estatus HTTP y `message` un texto fijo.',
});
export type PdnError = z.infer<typeof PdnErrorSchema>;
