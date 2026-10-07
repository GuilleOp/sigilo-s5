// Sobre cifrado HPKE (RFC 9180, modo base) dirigido a una llave pública X25519.
import { z } from 'zod';
import { Base64UrlSchema, KeyIdSchema } from './primitives.ts';

/** Suite única soportada en la versión 1 del formato. */
export const HPKE_SUITE_V1 = 'DHKEM-X25519-HKDF-SHA256/HKDF-SHA256/ChaCha20Poly1305' as const;

export const HpkeEnvelopeSchema = z.object({
  v: z.literal(1),
  suite: z.literal(HPKE_SUITE_V1),
  /** Llave destinataria. Permite rotación sin ambigüedad. */
  keyId: KeyIdSchema,
  /** Llave efímera encapsulada (salida "enc" de HPKE). */
  enc: Base64UrlSchema,
  /** Texto cifrado con etiqueta de autenticación. */
  ct: Base64UrlSchema,
});
export type HpkeEnvelope = z.infer<typeof HpkeEnvelopeSchema>;
