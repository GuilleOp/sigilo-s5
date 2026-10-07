// Prueba de trabajo autoalojada (tipo hashcash) que el servidor exige en los envíos anónimos.
import { z } from 'zod';

/** Escritura que protege un reto; un reto de un propósito no sirve para otro. */
export const PowPurposeSchema = z.enum(['complaint', 'evidence']);
export type PowPurpose = z.infer<typeof PowPurposeSchema>;

/** Dificultad máxima admitida, en bits en cero al inicio del digesto. */
export const MAX_POW_BITS = 32;

/**
 * Reto emitido por `GET powChallenge`. `token` es opaco para el cliente (lo firma el servidor con
 * HMAC, vence y es de un solo uso). Con `bits = 0` no se exige prueba.
 */
export const PowChallengeSchema = z.object({
  token: z
    .string()
    .max(512)
    .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'Reto inválido'),
  bits: z.number().int().min(0).max(MAX_POW_BITS),
});
export type PowChallenge = z.infer<typeof PowChallengeSchema>;

/**
 * Cabecera con la solución: `<token>:<contador>`, donde el contador es un entero decimal tal que
 * `SHA-256(token + ":" + contador)` empieza con `bits` bits en cero.
 */
export const POW_HEADER = 'X-Sigilo-Pow';
