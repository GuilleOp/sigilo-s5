// Llaves del despliegue. El cliente fija las públicas en su bundle y compara con lo que publica el
// servidor para detectar sustitución de llaves. También define los archivos de llaves privadas.
import { z } from 'zod';
import { Base64UrlSchema, KeyIdSchema } from './primitives.ts';

export const PublicKeySetSchema = z
  .object({
    server: z
      .object({
        keyId: KeyIdSchema,
        signingPublicKey: Base64UrlSchema.meta({
          description:
            'Llave pública Ed25519 con la que el servidor firma comprobantes y la cabeza de la bitácora.',
        }),
      })
      .meta({ description: 'Llaves del servidor.' }),
    authority: z
      .object({
        keyId: KeyIdSchema,
        boxPublicKey: Base64UrlSchema.meta({
          description:
            'Llave pública X25519 hacia la que se cifra la identidad sellada y los mensajes del buzón.',
        }),
        signingPublicKey: Base64UrlSchema.meta({
          description: 'Llave pública Ed25519 con la que la autoridad firma sus mensajes.',
        }),
      })
      .meta({ description: 'Llaves de la autoridad competente.' }),
    supervisor: z
      .object({
        keyId: KeyIdSchema,
        boxPublicKey: Base64UrlSchema.meta({
          description:
            'Llave pública X25519 de la autoridad supervisora, hacia la que se cifra el sobre de escalamiento.',
        }),
      })
      .optional()
      .meta({ description: 'Llave de la autoridad supervisora (segunda llave), si hay.' }),
  })
  .meta({
    description:
      'Llaves públicas del despliegue. El cliente las compara con las que trae fijadas para detectar una sustitución.',
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

/** Contenido de `supervisor-demo-key.json`: llave de cifrado de la supervisora de demostración. */
export const SupervisorDemoKeySchema = z.object({
  version: z.literal(1),
  keyId: KeyIdSchema,
  boxPublicKey: Base64UrlSchema,
  boxPrivateKey: Base64UrlSchema,
});
export type SupervisorDemoKey = z.infer<typeof SupervisorDemoKeySchema>;
