// Llaves del despliegue. El cliente fija las públicas en su bundle y compara con lo que publica el
// servidor para detectar sustitución de llaves. También define los archivos de llaves privadas.
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

/** Contenido de `keys.json`: privada del servidor y públicas de todo el despliegue. */
export const KeysFileSchema = z.object({
  version: z.literal(1),
  publicKeys: PublicKeySetSchema,
  server: z.object({ signingPrivateKey: Base64UrlSchema }),
});
export type KeysFile = z.infer<typeof KeysFileSchema>;

/** Contenido de `authority-demo-key.json`: llaves de la autoridad de demostración. */
export const AuthorityDemoKeySchema = z.object({
  version: z.literal(1),
  keyId: KeyIdSchema,
  boxPublicKey: Base64UrlSchema,
  boxPrivateKey: Base64UrlSchema,
  signingPublicKey: Base64UrlSchema,
  signingPrivateKey: Base64UrlSchema,
});
export type AuthorityDemoKey = z.infer<typeof AuthorityDemoKeySchema>;
