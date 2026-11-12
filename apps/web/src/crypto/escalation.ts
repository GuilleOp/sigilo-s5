// Segunda llave en el panel de supervisión: importa la llave de la supervisora, abre el sobre de
// escalamiento en el navegador y comprueba contra el registro público que es el que envió la
// persona denunciante.
import { SupervisorDemoKeySchema } from '@sigilo/contracts';
import type { EscalationDelivery, LedgerPage } from '@sigilo/contracts';
import {
  assertBoxKeyPair,
  equalBytes,
  fromBase64Url,
  keyIdFor,
  openEscalation,
  submissionDigestFromEscalation,
} from '@sigilo/core';
import type { EscalationOpenedContent } from '@sigilo/core';
import type { PinnedKeys } from '../config/pinned-keys.ts';
import { verifyReceivedEvent } from './authority.ts';
import type { ReporterKeysVerification } from './authority.ts';

/** Llave privada de la supervisora, en memoria y decodificada. */
export interface SupervisorKey {
  keyId: string;
  boxPrivateKey: Uint8Array;
}

/** Mensajes de rechazo de la llave (se muestran tal cual). */
export const SUPERVISOR_KEY_ERRORS = {
  invalid: 'El archivo no es una llave de supervisora válida.',
  unpinned: 'Este despliegue no tiene llave de supervisora fijada: no hay segunda llave que abrir.',
  mismatch: 'Esta llave no es la de la supervisora fijada en este despliegue.',
} as const;

/**
 * Lee el archivo de la llave de la supervisora (`SupervisorDemoKeySchema`), comprueba que la
 * privada corresponda a su pública y que esa pública sea la FIJADA en el bundle.
 * Seguridad: la llave se queda solo en memoria; no se guarda en el navegador. Si el servidor
 * sustituyera la llave publicada, el sobre no se habría cifrado hacia esta.
 */
export function readSupervisorKeyFile(text: string, pinned: PinnedKeys): SupervisorKey {
  const expected = pinned.supervisorBoxPublicKey;
  if (expected === undefined) throw new Error(SUPERVISOR_KEY_ERRORS.unpinned);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(SUPERVISOR_KEY_ERRORS.invalid);
  }
  const parsed = SupervisorDemoKeySchema.safeParse(raw);
  if (!parsed.success) throw new Error(SUPERVISOR_KEY_ERRORS.invalid);
  let publicKey: Uint8Array;
  let privateKey: Uint8Array;
  try {
    publicKey = fromBase64Url(parsed.data.boxPublicKey);
    privateKey = fromBase64Url(parsed.data.boxPrivateKey);
    assertBoxKeyPair({ publicKey, privateKey });
  } catch {
    throw new Error(SUPERVISOR_KEY_ERRORS.invalid);
  }
  const isPinned =
    keyIdFor(publicKey) === parsed.data.keyId &&
    parsed.data.keyId === pinned.set.supervisor?.keyId &&
    equalBytes(publicKey, expected);
  if (!isPinned) {
    privateKey.fill(0);
    throw new Error(SUPERVISOR_KEY_ERRORS.mismatch);
  }
  return { keyId: parsed.data.keyId, boxPrivateKey: privateKey };
}

/** Borra de memoria la llave privada de la supervisora. */
export function wipeSupervisorKey(key: SupervisorKey): void {
  key.boxPrivateKey.fill(0);
}

/** Sobre abierto y su comprobación contra el registro público. */
export interface OpenedEscalation {
  /** Contenido de la denuncia y las llaves de los archivos de sus pruebas. */
  content: EscalationOpenedContent;
  verification: ReporterKeysVerification;
}

/**
 * Abre el sobre de escalamiento con la llave de la supervisora y recalcula el digesto del envío
 * con lo abierto; lo compara con el evento `complaint.received` publicado.
 * Seguridad: el nodo conoce la llave pública de la supervisora y podría cifrar otro contenido
 * hacia ella; solo `verified` prueba que los hechos son los que envió la persona. Lanza el error
 * genérico del sobre si no abre.
 */
export async function openEscalationDelivery(
  delivery: EscalationDelivery,
  key: SupervisorKey,
  fetchPage: (from: number, limit: number) => Promise<LedgerPage>,
  pinned: PinnedKeys,
): Promise<OpenedEscalation> {
  const context = { authVerifier: delivery.authVerifier, reporterKeys: delivery.reporterKeys };
  const content = await openEscalation(delivery.escalationEnvelope, key.boxPrivateKey, context);
  const submissionDigest = submissionDigestFromEscalation(content, {
    ...context,
    escalationEnvelope: delivery.escalationEnvelope,
    sealedIdentityDigest: delivery.sealedIdentityDigest,
    corroborationDigest: delivery.corroborationDigest,
  });
  const verification = await verifyReceivedEvent(
    { folio: delivery.folio, seq: delivery.receivedEventSeq, submissionDigest },
    fetchPage,
    pinned,
  );
  return { content, verification };
}
