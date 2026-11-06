// Llave pública del evaluador OPRF de la corroboración ciega (ADR 0006) tal como se publica en el
// directorio firmado. Va aparte de corroboration.ts para que network.ts la use sin ciclos.
import { z } from 'zod';
import { Base64UrlSchema, DayDateSchema, KeyIdSchema } from './primitives.ts';

/** Suite de RFC 9497 que usa la corroboración: ristretto255-SHA512 en modo verificable. */
export const CORROBORATION_OPRF_SUITE = 'ristretto255-SHA512/VOPRF' as const;

/** Tipos de identificador que se pueden corroborar (ADR 0006, protocolo, paso 1). */
export const CorroborationIdentifierKindSchema = z.enum(['servidor', 'rfc', 'ocid']).meta({
  description:
    'Tipo de identificador: servidor (nombre de la persona servidora pública y clave del ente), rfc (RFC de un proveedor) u ocid (procedimiento de contratación OCDS).',
});
export type CorroborationIdentifierKind = z.infer<typeof CorroborationIdentifierKindSchema>;

export const CorroborationEvaluatorKeySchema = z
  .object({
    suite: z
      .literal(CORROBORATION_OPRF_SUITE)
      .meta({ description: 'Suite OPRF de RFC 9497: ristretto255-SHA512, modo VOPRF (0x01).' }),
    epoch: z.number().int().min(1).meta({
      description:
        'Época de la llave. Cambia solo al rotarla por compromiso; las etiquetas de épocas distintas no coinciden.',
    }),
    keyId: KeyIdSchema.meta({
      description: 'Primeros 16 hexadecimales del SHA-256 de la llave pública OPRF.',
    }),
    publicKey: Base64UrlSchema.meta({
      description:
        'Llave pública OPRF (elemento ristretto255 de 32 bytes): contra ella el navegador verifica la prueba DLEQ.',
    }),
    signingKeyId: KeyIdSchema,
    signingPublicKey: Base64UrlSchema.meta({
      description: 'Llave Ed25519 con la que el evaluador firma su conteo diario de evaluaciones.',
    }),
    validFrom: DayDateSchema.meta({ description: 'Primer día de vigencia de la época.' }),
  })
  .strict()
  .meta({ description: 'Llave pública del evaluador OPRF de la corroboración ciega.' });
export type CorroborationEvaluatorKey = z.infer<typeof CorroborationEvaluatorKeySchema>;

export const DirectoryCorroborationSchema = z
  .object({
    evaluator: CorroborationEvaluatorKeySchema,
    evaluatorUrl: z
      .string()
      .regex(/^https?:\/\/[^\s/?#]+$/u, 'URL base inválida')
      .meta({ description: 'Origen público del evaluador OPRF.' }),
    indexUrl: z
      .string()
      .regex(/^https?:\/\/[^\s/?#]+$/u, 'URL base inválida')
      .meta({ description: 'Origen del índice de coincidencias (solo lo llaman los nodos).' }),
  })
  .strict()
  .meta({
    description:
      'Servicios de la corroboración ciega: evaluador OPRF e índice de coincidencias, operados por partes distintas (ADR 0006).',
  });
export type DirectoryCorroboration = z.infer<typeof DirectoryCorroborationSchema>;
