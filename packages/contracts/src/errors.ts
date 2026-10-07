// Formato uniforme de error. Los errores de seguimiento son indistinguibles a propósito.
import { z } from 'zod';

export const ApiErrorCodeSchema = z.enum([
  'bad_request',
  'not_found',
  'unauthorized',
  'payload_too_large',
  'unsupported_media_type',
  'rate_limited',
  'internal',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({ code: ApiErrorCodeSchema, message: z.string() }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
