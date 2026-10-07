// Formato uniforme de error. Los errores de seguimiento son indistinguibles a propósito.
import { z } from 'zod';

export const ApiErrorCodeSchema = z.enum([
  'bad_request',
  'not_found',
  'unauthorized',
  'payload_too_large',
  'unsupported_media_type',
  'rate_limited',
  /** Falta la prueba de trabajo o no es válida, ya se usó o venció (ver `pow.ts`). */
  'proof_required',
  /** Se alcanzó la cuota total de almacenamiento de pruebas. */
  'storage_full',
  'internal',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({ code: ApiErrorCodeSchema, message: z.string() }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
