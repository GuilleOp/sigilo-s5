// Llaves públicas del despliegue. El cliente las fija en su bundle y compara con lo que
// pública el servidor para detectar sustitución de llaves.
import { z } from 'zod';
import { Base64UrlSchema, KeyIdSchema } from './primitives.ts';

export const PublicKeySetSchema = z.object({
  server: z.object({ keyId: KeyIdSchema, signingPublicKey: Base64UrlSchema }),
  authority: z.object({
    keyId: KeyIdSchema,
    boxPublicKey: Base64UrlSchema,
    signingPublicKey: Base64UrlSchema,
  }),
});
export type PublicKeySet = z.infer<typeof PublicKeySetSchema>;
