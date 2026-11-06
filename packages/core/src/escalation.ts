// Sobre de escalamiento (segunda llave, ADR 0007): hechos y pruebas de la denuncia cifrados en el
// navegador hacia la autoridad supervisora. Nunca lleva la identidad sellada.
import { Base64UrlSchema, EscalationContentSchema, ReporterKeysSchema } from '@sigilo/contracts';
import type { HpkeEnvelope, ReporterKeys } from '@sigilo/contracts';
import { canonicalize, sha256Hex } from './canonical-json.ts';
import { utf8Decode, utf8Encode } from './encoding.ts';
import type { EnvelopeRecipient } from './envelope.ts';
import { openEnvelope, sealToPublicKey } from './envelope.ts';
import type { ComplaintContent } from './identity.ts';
import { padToBlock, unpad } from './padding.ts';

/**
 * Tamaño fijo del texto en claro del sobre de escalamiento: cabe la denuncia más grande (12 000
 * caracteres de texto libre a 3 bytes cada uno, más 10 descriptores de pruebas) con holgura.
 */
export const ESCALATION_PADDED_SIZE = 49_152;

/** Contexto al que queda ligado el sobre de escalamiento; forma su AAD. */
export interface EscalationContext {
  authVerifier: string;
  reporterKeys: ReporterKeys;
}

const OPEN_ERROR = 'No se pudo abrir el sobre.';

function escalationAad(context: EscalationContext): Uint8Array {
  const isValid =
    Base64UrlSchema.safeParse(context.authVerifier).success &&
    ReporterKeysSchema.safeParse(context.reporterKeys).success;
  if (!isValid) throw new Error('El contexto del sobre de escalamiento no es válido.');
  const { boxPublicKey, signingPublicKey } = context.reporterKeys;
  const bound = canonicalize({
    authVerifier: context.authVerifier,
    reporterKeys: { boxPublicKey, signingPublicKey },
  });
  return utf8Encode(`sigilo/v1/escalation:${bound}`);
}

/** `sha256Hex(canonicalize(envelope))`: digesto del sobre de escalamiento que entra al envío. */
export function escalationEnvelopeDigest(envelope: HpkeEnvelope): string {
  return sha256Hex(canonicalize(envelope));
}

/**
 * Cifra hacia la supervisora el contenido de la denuncia (versión, modo, hechos, pruebas y
 * protección), rellenado a `ESCALATION_PADDED_SIZE` bytes y ligado por el AAD al recibo y a las
 * llaves del buzón.
 * Seguridad: nunca recibe la identidad; el relleno fijo oculta la longitud del relato. El digesto
 * del sobre entra al `submissionDigest`, así que el nodo no puede sustituirlo sin que se note.
 * Lanza error si el contenido no es válido o excede el tamaño.
 */
export async function sealEscalation(
  content: ComplaintContent,
  supervisor: EnvelopeRecipient,
  context: EscalationContext,
): Promise<HpkeEnvelope> {
  const parsed = EscalationContentSchema.safeParse({
    version: content.version,
    mode: content.mode,
    facts: content.facts,
    evidence: content.evidence,
    protectionRequested: content.protectionRequested,
  });
  // Seguridad: no se reenvían los detalles de validación porque podrían citar el relato.
  if (!parsed.success) throw new Error('El contenido del sobre de escalamiento no es válido.');
  const aad = escalationAad(context);
  const padded = padToBlock(utf8Encode(canonicalize(parsed.data)), ESCALATION_PADDED_SIZE);
  if (padded.length > ESCALATION_PADDED_SIZE) {
    throw new Error(`El contenido excede ${ESCALATION_PADDED_SIZE} bytes.`);
  }
  return sealToPublicKey(padded, supervisor, aad);
}

/**
 * Abre el sobre de escalamiento con la llave privada de la supervisora y devuelve el contenido de
 * la denuncia. Lanza el error genérico del sobre si no abre o si el contenido no es válido.
 */
export async function openEscalation(
  envelope: HpkeEnvelope,
  supervisorPrivateKey: Uint8Array,
  context: EscalationContext,
): Promise<ComplaintContent> {
  let aad: Uint8Array;
  try {
    aad = escalationAad(context);
  } catch {
    throw new Error(OPEN_ERROR);
  }
  const padded = await openEnvelope(envelope, supervisorPrivateKey, aad);
  try {
    if (padded.length !== ESCALATION_PADDED_SIZE) throw new Error(OPEN_ERROR);
    return EscalationContentSchema.parse(JSON.parse(utf8Decode(unpad(padded))));
  } catch {
    throw new Error(OPEN_ERROR);
  }
}

/** Datos de la entrega a la supervisora con los que se recalcula el digesto del envío. */
export interface EscalationDeliveryContext extends EscalationContext {
  escalationEnvelope: HpkeEnvelope;
  /** Solo en modo `sealed`: digesto del sobre de identidad, que la supervisora nunca recibe. */
  sealedIdentityDigest?: string | undefined;
  /** Digesto de la corroboración ciega, si la denuncia la trae (la etiqueta no se entrega). */
  corroborationDigest?: string | undefined;
}

/**
 * Recalcula `submissionDigest` con el contenido abierto del sobre de escalamiento y los datos de la
 * entrega. Seguridad: si coincide con el del evento `complaint.received` publicado, el sobre, los
 * hechos y las llaves del buzón son los que envió la persona; el nodo no los cambió.
 */
export function submissionDigestFromEscalation(
  content: ComplaintContent,
  delivery: EscalationDeliveryContext,
): string {
  return sha256Hex(
    canonicalize({
      version: content.version,
      mode: content.mode,
      facts: content.facts,
      evidence: content.evidence,
      ...(delivery.sealedIdentityDigest === undefined
        ? {}
        : { sealedIdentity: delivery.sealedIdentityDigest }),
      escalationEnvelope: escalationEnvelopeDigest(delivery.escalationEnvelope),
      ...(delivery.corroborationDigest === undefined
        ? {}
        : { corroboration: delivery.corroborationDigest }),
      protectionRequested: content.protectionRequested,
      reporterKeys: {
        boxPublicKey: delivery.reporterKeys.boxPublicKey,
        signingPublicKey: delivery.reporterKeys.signingPublicKey,
      },
      authVerifier: delivery.authVerifier,
    }),
  );
}
