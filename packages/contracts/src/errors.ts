// Formato uniforme de error. Los errores de seguimiento son indistinguibles a propósito.
import { z } from 'zod';

export const ApiErrorCodeSchema = z.enum([
  'bad_request',
  'not_found',
  'unauthorized',
  /** La función de la cuenta no permite la acción (separación de funciones). */
  'forbidden',
  /** La acción no corresponde al estado actual del trámite. */
  'conflict',
  /** La denuncia ya alcanzó el tope de reasignaciones (`MAX_REASSIGNMENTS`, como en el S5). */
  'reassignment_limit',
  'payload_too_large',
  'unsupported_media_type',
  'rate_limited',
  /** Falta la prueba de trabajo o no es válida, ya se usó o venció (ver `pow.ts`). */
  'proof_required',
  /** Se alcanzó la cuota total de almacenamiento de pruebas. */
  'storage_full',
  /** Se alcanzó el tope de eventos pendientes del día en la bitácora (503). */
  'ledger_day_full',
  'internal',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorSchema = z
  .object({
    error: z
      .object({
        code: ApiErrorCodeSchema.meta({ description: 'Código estable del error.' }),
        message: z
          .string()
          .meta({ description: 'Mensaje fijo en español; nunca incluye datos de la solicitud.' }),
      })
      .meta({ description: 'Código y mensaje del error.' }),
  })
  .meta({
    description:
      'Error con formato común. Los errores de seguimiento no distinguen si falló el folio o el recibo.',
  });
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** Estatus HTTP de un error de la API; todos llevan cuerpo. */
export type ApiErrorHttpStatus =
  400 | 401 | 403 | 404 | 409 | 413 | 415 | 428 | 429 | 500 | 503 | 507;

/** Estatus HTTP de cada código de error. */
export const API_ERROR_HTTP_STATUS: Readonly<Record<ApiErrorCode, ApiErrorHttpStatus>> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  reassignment_limit: 409,
  payload_too_large: 413,
  unsupported_media_type: 415,
  rate_limited: 429,
  proof_required: 428,
  storage_full: 507,
  ledger_day_full: 503,
  internal: 500,
};

/**
 * Mensaje fijo de cada código, el mismo en toda respuesta.
 * Seguridad: nunca incluye detalles internos ni datos de la solicitud.
 */
export const API_ERROR_MESSAGES: Readonly<Record<ApiErrorCode, string>> = {
  bad_request: 'La solicitud no es válida.',
  unauthorized: 'No autorizado.',
  forbidden: 'Tu función no permite esta acción.',
  not_found: 'No encontrado.',
  conflict: 'La acción no corresponde al estado actual del trámite.',
  reassignment_limit:
    'La denuncia ya se reasignó 3 veces, el máximo. Devuélvela al buzón general para que se turne de nuevo.',
  payload_too_large: 'El contenido excede el tamaño permitido.',
  unsupported_media_type: 'Tipo de contenido no admitido.',
  rate_limited: 'Demasiados intentos. Intenta más tarde.',
  proof_required: 'Falta una prueba de trabajo válida y vigente.',
  storage_full: 'No hay espacio para más pruebas por ahora. Intenta más tarde.',
  ledger_day_full:
    'El registro público alcanzó el máximo de eventos de hoy. Intenta de nuevo mañana.',
  internal: 'Error interno del servidor.',
};

/** Cuándo se responde cada código, en lenguaje claro. */
export const API_ERROR_DESCRIPTIONS: Readonly<Record<ApiErrorCode, string>> = {
  bad_request: 'La solicitud no cumple el esquema o sus parámetros no son válidos.',
  unauthorized:
    'Falta la sesión de la autoridad, venció o no es válida, o el usuario y la contraseña no coinciden (sin decir cuál).',
  forbidden:
    'La función de la cuenta no permite la acción (separación de funciones); se responde antes de buscar el folio.',
  conflict:
    'La acción no corresponde al estado del trámite, a la etapa o a la solicitud (por ejemplo, aprobar dos veces).',
  reassignment_limit:
    'La denuncia ya se reasignó el máximo de veces (3, como en el S5): la autoridad puede devolverla al buzón general o la supervisión la revisa.',
  not_found:
    'No existe el recurso, o el folio o el recibo no son correctos (sin decir cuál de los dos).',
  payload_too_large: 'El cuerpo excede el tamaño permitido o la cuota de pruebas de la denuncia.',
  unsupported_media_type: 'El tipo de contenido no es el que admite la ruta.',
  rate_limited: 'Demasiados intentos fallidos o mensajes en poco tiempo.',
  proof_required: 'Falta la prueba de trabajo, no es válida, venció o ya se usó.',
  storage_full: 'Se alcanzó la cuota total de almacenamiento de pruebas.',
  ledger_day_full: 'La bitácora alcanzó el tope de eventos pendientes del día.',
  internal: 'Error interno, sin detalles.',
};
