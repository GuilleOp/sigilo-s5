// Bloque de identidad sellado hacia la autoridad, ligado al recibo mediante el AAD.
import { Base64UrlSchema, IdentityBlockSchema } from '@sigilo/contracts';
import type { HpkeEnvelope, IdentityBlock } from '@sigilo/contracts';
import { canonicalize } from './canonical-json.ts';
import { utf8Decode, utf8Encode } from './encoding.ts';
import type { EnvelopeRecipient } from './envelope.ts';
import { openEnvelope, sealToPublicKey } from './envelope.ts';
import { padToBlock, unpad } from './padding.ts';

const IDENTITY_PADDED_SIZE = 4096;

function identityAad(authVerifier: string): Uint8Array {
  if (!Base64UrlSchema.safeParse(authVerifier).success) {
    throw new Error('El verificador de autenticación no es válido.');
  }
  return utf8Encode(`sigilo/v1/identity:${authVerifier}`);
}

/**
 * Valida, canonicaliza, rellena a 4096 bytes y cifra el bloque de identidad hacia la autoridad.
 * Seguridad: el relleno fijo oculta la longitud de los datos y el AAD liga el sobre a este recibo,
 * de modo que no puede trasladarse a otra denuncia. Lanza error si el bloque es inválido o excede el tamaño.
 */
export async function sealIdentity(
  block: IdentityBlock,
  authority: EnvelopeRecipient,
  authVerifier: string,
): Promise<HpkeEnvelope> {
  const parsed = IdentityBlockSchema.safeParse(block);
  if (!parsed.success) {
    // Seguridad: no se reenvían los detalles de validación porque podrían citar datos personales.
    throw new Error('El bloque de identidad no es válido.');
  }
  const aad = identityAad(authVerifier);
  const padded = padToBlock(utf8Encode(canonicalize(parsed.data)), IDENTITY_PADDED_SIZE);
  if (padded.length > IDENTITY_PADDED_SIZE) {
    throw new Error(`El bloque de identidad excede ${IDENTITY_PADDED_SIZE} bytes.`);
  }
  return sealToPublicKey(padded, authority, aad);
}

/**
 * Abre y valida un bloque de identidad con la llave privada de la autoridad.
 * Lanza el error genérico del sobre si no se puede descifrar o el contenido no es válido.
 */
export async function openIdentity(
  envelope: HpkeEnvelope,
  authorityPrivateKey: Uint8Array,
  authVerifier: string,
): Promise<IdentityBlock> {
  const padded = await openEnvelope(envelope, authorityPrivateKey, identityAad(authVerifier));
  try {
    if (padded.length !== IDENTITY_PADDED_SIZE) throw new Error();
    const value: unknown = JSON.parse(utf8Decode(unpad(padded)));
    return IdentityBlockSchema.parse(value);
  } catch {
    throw new Error('No se pudo abrir el sobre.');
  }
}
