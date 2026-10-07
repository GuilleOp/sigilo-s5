// Bloque de identidad sellado hacia la autoridad, ligado por el AAD al recibo, a las llaves de la
// persona denunciante y al contenido exacto de su denuncia.
import {
  Base64UrlSchema,
  IdentityBlockSchema,
  ReporterKeysSchema,
  Sha256HexSchema,
} from '@sigilo/contracts';
import type {
  ComplaintDetail,
  ComplaintFacts,
  ComplaintMode,
  EvidenceDescriptor,
  HpkeEnvelope,
  IdentityBlock,
  ReporterKeys,
} from '@sigilo/contracts';
import { canonicalize, sha256Hex } from './canonical-json.ts';
import { utf8Decode, utf8Encode } from './encoding.ts';
import type { EnvelopeRecipient } from './envelope.ts';
import { openEnvelope, sealToPublicKey } from './envelope.ts';
import { padToBlock, unpad } from './padding.ts';

/** Tamaño fijo del texto en claro de la identidad, con relleno. */
export const IDENTITY_PADDED_SIZE = 4096;

/** Campos de la denuncia que cubre `contentDigest`. */
export interface ComplaintContent {
  version: 1;
  mode: ComplaintMode;
  facts: ComplaintFacts;
  evidence: readonly EvidenceDescriptor[];
  protectionRequested: boolean;
}

/** Contexto al que queda ligado el sobre de identidad; forma su AAD. */
export interface IdentityContext {
  authVerifier: string;
  reporterKeys: ReporterKeys;
  /** `computeContentDigest` de la denuncia. */
  contentDigest: string;
}

/** Datos de los que se calcula el contexto: la solicitud de denuncia u otro objeto con sus campos. */
export type IdentityContextSource = ComplaintContent & {
  authVerifier: string;
  reporterKeys: ReporterKeys;
};

const OPEN_ERROR = 'No se pudo abrir el sobre.';

/**
 * `sha256Hex(canonicalize({ version, mode, facts, evidence, protectionRequested }))`.
 * Se toman solo esos campos, así que puede recibir la solicitud completa.
 */
export function computeContentDigest(content: ComplaintContent): string {
  const { version, mode, facts, evidence, protectionRequested } = content;
  return sha256Hex(canonicalize({ version, mode, facts, evidence, protectionRequested }));
}

/** Contexto de identidad de una solicitud de denuncia (o cualquier objeto con sus campos). */
export function identityContextFor(source: IdentityContextSource): IdentityContext {
  return {
    authVerifier: source.authVerifier,
    reporterKeys: {
      boxPublicKey: source.reporterKeys.boxPublicKey,
      signingPublicKey: source.reporterKeys.signingPublicKey,
    },
    contentDigest: computeContentDigest(source),
  };
}

/**
 * Contexto de identidad recalculado por la autoridad desde el detalle de la denuncia.
 * Seguridad: no se confía en ningún digesto del servidor; si alteró hechos, pruebas, llaves o el
 * verificador, el sobre no abre.
 */
export function identityContextFromDetail(detail: ComplaintDetail): IdentityContext {
  return identityContextFor({
    version: detail.version,
    mode: detail.summary.mode,
    facts: detail.facts,
    evidence: detail.evidence,
    protectionRequested: detail.summary.protectionRequested,
    authVerifier: detail.authVerifier,
    reporterKeys: detail.reporterKeys,
  });
}

function identityAad(context: IdentityContext): Uint8Array {
  const isValid =
    Base64UrlSchema.safeParse(context.authVerifier).success &&
    ReporterKeysSchema.safeParse(context.reporterKeys).success &&
    Sha256HexSchema.safeParse(context.contentDigest).success;
  if (!isValid) throw new Error('El contexto de la identidad no es válido.');
  const { authVerifier, contentDigest } = context;
  const { boxPublicKey, signingPublicKey } = context.reporterKeys;
  const bound = canonicalize({
    authVerifier,
    reporterKeys: { boxPublicKey, signingPublicKey },
    contentDigest,
  });
  return utf8Encode(`sigilo/v1/identity:${bound}`);
}

/**
 * Valida, canonicaliza, rellena a 4096 bytes y cifra el bloque de identidad hacia la autoridad.
 * Seguridad: el relleno fijo oculta la longitud de los datos. El AAD liga el sobre al recibo
 * (`authVerifier`), a las llaves del buzón y al contenido de la denuncia, así que no puede
 * trasplantarse a otra denuncia aunque se copie también el `authVerifier`.
 * Lanza error si el bloque o el contexto son inválidos o si el bloque excede el tamaño.
 */
export async function sealIdentity(
  block: IdentityBlock,
  authority: EnvelopeRecipient,
  context: IdentityContext,
): Promise<HpkeEnvelope> {
  const parsed = IdentityBlockSchema.safeParse(block);
  if (!parsed.success) {
    // Seguridad: no se reenvían los detalles de validación porque podrían citar datos personales.
    throw new Error('El bloque de identidad no es válido.');
  }
  const aad = identityAad(context);
  const padded = padToBlock(utf8Encode(canonicalize(parsed.data)), IDENTITY_PADDED_SIZE);
  if (padded.length > IDENTITY_PADDED_SIZE) {
    throw new Error(`El bloque de identidad excede ${IDENTITY_PADDED_SIZE} bytes.`);
  }
  return sealToPublicKey(padded, authority, aad);
}

/**
 * Abre y valida un bloque de identidad con la llave privada de la autoridad y el contexto
 * recalculado (ver `identityContextFromDetail`).
 * Lanza el error genérico del sobre si no se puede descifrar, si el contexto es inválido o si el
 * contenido no es válido.
 */
export async function openIdentity(
  envelope: HpkeEnvelope,
  authorityPrivateKey: Uint8Array,
  context: IdentityContext,
): Promise<IdentityBlock> {
  let aad: Uint8Array;
  try {
    aad = identityAad(context);
  } catch {
    throw new Error(OPEN_ERROR);
  }
  const padded = await openEnvelope(envelope, authorityPrivateKey, aad);
  try {
    if (padded.length !== IDENTITY_PADDED_SIZE) throw new Error(OPEN_ERROR);
    const value: unknown = JSON.parse(utf8Decode(unpad(padded)));
    return IdentityBlockSchema.parse(value);
  } catch {
    throw new Error(OPEN_ERROR);
  }
}
