// Sobre cifrado HPKE (RFC 9180, modo base) dirigido a una llave pública X25519.
import { z } from 'zod';
import { Base64UrlSchema, KeyIdSchema } from './primitives.ts';

/** Suite única soportada en la versión 1 del formato. */
export const HPKE_SUITE_V1 = 'DHKEM-X25519-HKDF-SHA256/HKDF-SHA256/ChaCha20Poly1305' as const;

export const HpkeEnvelopeSchema = z
  .strictObject({
    v: z.literal(1).meta({ description: 'Versión del formato del sobre.' }),
    suite: z.literal(HPKE_SUITE_V1).meta({
      description:
        'Suite HPKE: DHKEM X25519, HKDF-SHA256 y ChaCha20-Poly1305 (RFC 9180, modo base).',
    }),
    /** Llave destinataria. Permite rotación sin ambigüedad. */
    keyId: KeyIdSchema.meta({ description: 'Identificador de la llave pública destinataria.' }),
    /** Llave efímera encapsulada (salida "enc" de HPKE). */
    enc: Base64UrlSchema.meta({ description: 'Llave efímera encapsulada (salida enc de HPKE).' }),
    /** Texto cifrado con etiqueta de autenticación. */
    ct: Base64UrlSchema.meta({ description: 'Texto cifrado con su etiqueta de autenticación.' }),
  })
  .meta({
    description:
      'Sobre cifrado con HPKE hacia una llave pública X25519. Solo quien tiene la llave privada lo abre.',
  });
export type HpkeEnvelope = z.infer<typeof HpkeEnvelopeSchema>;
