// Lectura y validación de cuerpos JSON con los esquemas de @sigilo/contracts.
import type { Context, MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { z } from 'zod';
import { ApiFailure, errorResponse } from './errors.ts';

/** Tamaño máximo de un cuerpo JSON. La denuncia más grande cabe con holgura. */
export const MAX_JSON_BYTES = 256 * 1024;

/** Limita el tamaño de los cuerpos JSON y responde 413 si se excede. */
export const jsonBodyLimit: MiddlewareHandler = bodyLimit({
  maxSize: MAX_JSON_BYTES,
  onError: (c) => errorResponse(c, 'payload_too_large'),
});

/** Tipo de medio sin parámetros y en minúsculas, o cadena vacía si falta. */
export function mediaTypeOf(c: Context): string {
  const header = c.req.header('Content-Type') ?? '';
  return (header.split(';')[0] ?? '').trim().toLowerCase();
}

/**
 * Lee el cuerpo como JSON y lo valida con `schema`.
 * Lanza `unsupported_media_type` si no es JSON y `bad_request` si no es válido.
 * Seguridad: no se propagan los detalles de zod porque podrían citar datos de la solicitud.
 */
export async function readJson<T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T>> {
  if (mediaTypeOf(c) !== 'application/json') throw new ApiFailure('unsupported_media_type');
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new ApiFailure('bad_request');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ApiFailure('bad_request');
  return parsed.data;
}
