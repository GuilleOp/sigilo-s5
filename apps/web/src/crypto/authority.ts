// Panel de autoridad: importación de la llave de demostración, identidad y buzón.
import { AuthorityDemoKeySchema } from '@sigilo/contracts';
import type {
  AuthorityDirectory,
  AuthorityMessageRequest,
  ComplaintDetail,
  IdentityBlock,
  LedgerAnchor,
  LedgerPage,
  MailboxMessage,
  OpenIdentityResponse,
} from '@sigilo/contracts';
import {
  assertBoxKeyPair,
  assertSigningKeyPair,
  equalBytes,
  folioDigest,
  fromBase64Url,
  identityContextFromDetail,
  keyIdFor,
  nextMailboxSequence,
  openIdentity,
  openMailboxMessage,
  receivedPayloadDigest,
  sealMailboxMessage,
  submissionDigestFromDetail,
} from '@sigilo/core';
import type { PinnedKeys } from '../config/pinned-keys.ts';
import type { NetworkState } from '../network/directory.ts';
import {
  downloadSegment,
  LEDGER_PAGE_SIZE,
  verifyEventWithAnchors,
} from './ledger-verification.ts';

/** Llaves de la autoridad, en memoria y decodificadas. */
export interface AuthorityKeys {
  keyId: string;
  boxPublicKey: Uint8Array;
  boxPrivateKey: Uint8Array;
  signingPublicKey: Uint8Array;
  signingPrivateKey: Uint8Array;
}

const INVALID_FILE = 'El archivo no es una llave de autoridad válida.';

/**
 * Lee un archivo de llave de autoridad (`AuthorityDemoKeySchema`) y comprueba que cada privada
 * corresponda a su pública. No dice de qué autoridad es: eso lo decide `assertAuthorityKeyFor`.
 * Seguridad: la llave se queda solo en memoria; no se guarda en el navegador.
 */
export function readAuthorityKeyFile(text: string): AuthorityKeys {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(INVALID_FILE);
  }
  const parsed = AuthorityDemoKeySchema.safeParse(raw);
  if (!parsed.success) throw new Error(INVALID_FILE);
  const file = parsed.data;
  const keys: AuthorityKeys = {
    keyId: file.keyId,
    boxPublicKey: fromBase64Url(file.boxPublicKey),
    boxPrivateKey: fromBase64Url(file.boxPrivateKey),
    signingPublicKey: fromBase64Url(file.signingPublicKey),
    signingPrivateKey: fromBase64Url(file.signingPrivateKey),
  };
  try {
    assertBoxKeyPair({ publicKey: keys.boxPublicKey, privateKey: keys.boxPrivateKey });
    assertSigningKeyPair({ publicKey: keys.signingPublicKey, privateKey: keys.signingPrivateKey });
  } catch {
    wipeAuthorityKeys(keys);
    throw new Error(INVALID_FILE);
  }
  return keys;
}

/** Parte pública de una llave de autoridad, ya decodificada. */
interface PublicAuthorityKey {
  keyId: string;
  boxPublicKey: Uint8Array;
  signingPublicKey: Uint8Array;
}

/** Indica si las llaves importadas son exactamente la parte pública esperada. */
function isKey(keys: AuthorityKeys, expected: PublicAuthorityKey): boolean {
  return (
    keys.keyId === expected.keyId &&
    keyIdFor(keys.boxPublicKey) === keys.keyId &&
    equalBytes(keys.boxPublicKey, expected.boxPublicKey) &&
    equalBytes(keys.signingPublicKey, expected.signingPublicKey)
  );
}

function pinnedKey(pinned: PinnedKeys): PublicAuthorityKey {
  return {
    keyId: pinned.set.authority.keyId,
    boxPublicKey: pinned.authorityBoxPublicKey,
    signingPublicKey: pinned.authoritySigningPublicKey,
  };
}

/** Autoridad del directorio cuyas llaves públicas son las importadas, si hay. */
function directoryOwnerOf(keys: AuthorityKeys, directory: AuthorityDirectory) {
  return directory.authorities.find((authority) => {
    try {
      return isKey(keys, {
        keyId: authority.keyId,
        boxPublicKey: fromBase64Url(authority.boxPublicKey),
        signingPublicKey: fromBase64Url(authority.signingPublicKey),
      });
    } catch {
      return false;
    }
  });
}

/** Mensajes de rechazo de la llave (se muestran tal cual en la pantalla de entrada). */
export const KEY_MISMATCH = {
  deployment: 'Esta llave no corresponde a la autoridad de este despliegue.',
  inbox:
    'Esta llave no es la del buzón general de este nodo. La cuenta del buzón general usa la llave del buzón del nodo.',
  unverified:
    'No pudimos verificar el directorio firmado de la red, así que no podemos comprobar que esta llave sea la de tu autoridad. Inténtalo de nuevo en unos minutos.',
} as const;

/**
 * Comprueba que las llaves importadas sean las de la autoridad de la cuenta (`authorityId`):
 * - con un solo nodo, la llave FIJADA en el bundle (`pinned-keys.json`);
 * - en la red con directorio verificado, la entrada de ESA autoridad en el directorio firmado
 *   (`keyId`, `boxPublicKey` y `signingPublicKey`); el buzón general del nodo no está en el
 *   directorio y sigue usando la llave fijada (la del buzón, con la que se sellan las denuncias que
 *   entran por la página propia del nodo);
 * - si el directorio no verifica o no se pudo descargar, solo se acepta la llave fijada del buzón.
 * Lanza un `Error` con un mensaje para la persona; no borra las llaves (eso le toca a quien llama).
 * Seguridad: quien opera el nodo custodia la llave del buzón, no la de cada autoridad; por eso una
 * cuenta de una autoridad del directorio no entra con la del buzón ni con la de otra autoridad.
 */
export function assertAuthorityKeyFor(
  keys: AuthorityKeys,
  authorityId: string,
  network: NetworkState,
  pinned: PinnedKeys,
): void {
  const isPinned = isKey(keys, pinnedKey(pinned));
  if (network.kind === 'single-node') {
    if (!isPinned) throw new Error(KEY_MISMATCH.deployment);
    return;
  }
  if (network.kind !== 'verified') {
    if (!isPinned) throw new Error(KEY_MISMATCH.unverified);
    return;
  }
  const directory = network.directory;
  const own = directory.authorities.find((authority) => authority.id === authorityId);
  const owner = directoryOwnerOf(keys, directory);
  if (own === undefined) {
    if (isPinned) return;
    throw new Error(
      owner === undefined
        ? KEY_MISMATCH.inbox
        : `Esta llave es de «${owner.name}». La cuenta del buzón general usa la llave del buzón del nodo.`,
    );
  }
  if (owner?.id === own.id) return;
  if (isPinned) {
    throw new Error(
      `Esta es la llave del buzón general del nodo. Tu cuenta es de «${own.name}»: importa la llave propia de tu autoridad, la que corresponde a su candado en el directorio firmado.`,
    );
  }
  throw new Error(
    owner === undefined
      ? `Esta llave no corresponde a «${own.name}» en el directorio firmado de la red.`
      : `Esta llave es de «${owner.name}», no de «${own.name}», la autoridad de tu cuenta.`,
  );
}

/**
 * Lee la llave y comprueba que sea la FIJADA en el bundle (perfil de un solo nodo o buzón general).
 * Seguridad: la llave se queda solo en memoria; no se guarda en el navegador.
 */
export function importAuthorityKey(text: string, pinned: PinnedKeys): AuthorityKeys {
  const keys = readAuthorityKeyFile(text);
  try {
    assertAuthorityKeyFor(keys, '', { kind: 'single-node' }, pinned);
  } catch (failure) {
    wipeAuthorityKeys(keys);
    throw failure;
  }
  return keys;
}

/** La identidad se selló hacia otra llave (p. ej. la del buzón general antes de un turnado). */
export class SealedForOtherKeyError extends Error {
  constructor() {
    super(
      'La identidad de esta denuncia se selló con otra llave, no con la de tu autoridad (por ejemplo, con la del buzón general del nodo, si llegó por su página propia y después se turnó). Con tu llave no se puede abrir.',
    );
    this.name = 'SealedForOtherKeyError';
  }
}

/**
 * Abre la identidad sellada con el contexto recalculado desde el detalle vigente.
 * Seguridad: no se confía en ningún digesto del servidor; si alteró hechos, pruebas, llaves o el
 * verificador del recibo, el sobre no abre. En modo sellado, abrirlo prueba además que
 * `detail.reporterKeys` son las de la persona denunciante (van en el AAD). Si el sobre va hacia otra
 * llave (`keyId`), se rechaza con `SealedForOtherKeyError` antes de intentar abrirlo.
 */
export function openSealedIdentity(
  response: OpenIdentityResponse,
  detail: ComplaintDetail,
  keys: AuthorityKeys,
): Promise<IdentityBlock> {
  if (response.sealedIdentity.keyId !== keys.keyId) {
    return Promise.reject(new SealedForOtherKeyError());
  }
  return openIdentity(
    response.sealedIdentity,
    keys.boxPrivateKey,
    identityContextFromDetail(detail),
  );
}

/**
 * Estado de las llaves de la persona denunciante frente al registro público: `verified` si el
 * digesto del envío recalculado desde el detalle coincide con el evento `complaint.received`
 * publicado, `anchors-not-comparable` si coincide pero algún anclaje dado no se pudo comparar,
 * `pending` mientras ese evento no se publica y `mismatch` si no coincide.
 */
export type ReporterKeysVerification =
  'verified' | 'anchors-not-comparable' | 'pending' | 'mismatch';

/**
 * Recalcula `submissionDigest` desde el detalle (`submissionDigestFromDetail`) y lo compara con el
 * `payloadDigest` del evento `complaint.received` publicado en la bitácora. El evento debe quedar
 * probado dentro de la cadena (`verifyEventInChain`): se descarga el tramo desde su secuencia
 * hasta la cabeza, firmada por la llave FIJADA del servidor, y el último eslabón debe ser el de la
 * cabeza. Si se dan anclajes (configurados o pegados), deben coincidir; los anteriores al evento
 * se comparan descargando desde su secuencia (`verifyEventWithAnchors`) y, si no se puede, el
 * resultado es `anchors-not-comparable`, nunca `verified`.
 * Seguridad: un evento fabricado con un hash coherente consigo mismo no basta; el servidor tendría
 * que reescribir la cadena hasta la cabeza firmada que ven todos. El evento lo verificó la persona
 * denunciante contra su comprobante; si coincide, las llaves del buzón, los hechos y las pruebas
 * del detalle son los que ella envió, también en modo anónimo.
 */
export function verifyReporterKeys(
  detail: ComplaintDetail,
  fetchPage: (from: number, limit: number) => Promise<LedgerPage>,
  pinned: PinnedKeys,
  anchors: readonly LedgerAnchor[] = [],
): Promise<ReporterKeysVerification> {
  return verifyReceivedEvent(
    {
      folio: detail.summary.folio,
      seq: detail.receivedEventSeq,
      receivedOn: detail.summary.receivedOn,
      submissionDigest: submissionDigestFromDetail(detail),
    },
    fetchPage,
    pinned,
    anchors,
  );
}

/** Lo que se compara con el evento `complaint.received` publicado. */
export interface ReceivedEventClaim {
  folio: string;
  /** Secuencia del evento; `undefined` mientras no se publica. */
  seq: number | undefined;
  /** Día de recepción que debe tener el evento, si se conoce. */
  receivedOn?: string;
  /** `submissionDigest` recalculado en el navegador, nunca el que dice el servidor. */
  submissionDigest: string;
}

/**
 * Comprueba que el evento `complaint.received` publicado en la secuencia `claim.seq` sea del folio
 * y lleve el digesto del envío recalculado (ver `verifyReporterKeys`): lo usan el detalle de la
 * autoridad y la supervisora al abrir el sobre de escalamiento.
 */
export async function verifyReceivedEvent(
  claim: ReceivedEventClaim,
  fetchPage: (from: number, limit: number) => Promise<LedgerPage>,
  pinned: PinnedKeys,
  anchors: readonly LedgerAnchor[] = [],
): Promise<ReporterKeysVerification> {
  const seq = claim.seq;
  if (seq === undefined) return 'pending';
  const first = await fetchPage(seq, LEDGER_PAGE_SIZE);
  const event = first.events[0];
  const folio = claim.folio;
  if (event === undefined || event.seq !== seq || first.head.seq < seq) return 'mismatch';
  const chain = await downloadSegment(fetchPage, seq, first.head, first.events);
  const inChain = await verifyEventWithAnchors(
    event,
    chain,
    first.head,
    pinned.serverSigningPublicKey,
    anchors,
    fetchPage,
  );
  const isNotComparable = !inChain.valid && inChain.reason === 'anchor-not-comparable';
  const isAuthentic =
    (inChain.valid || isNotComparable) &&
    event.type === 'complaint.received' &&
    (claim.receivedOn === undefined || event.at === claim.receivedOn) &&
    event.folioDigest === folioDigest(folio);
  if (!isAuthentic) return 'mismatch';
  const expected = receivedPayloadDigest(folio, claim.submissionDigest);
  if (event.payloadDigest !== expected) return 'mismatch';
  return isNotComparable ? 'anchors-not-comparable' : 'verified';
}

/** Mensaje del buzón visto por la autoridad. */
export type AuthorityThreadItem =
  | { messageId: string; from: 'reporter'; sentOn: string; state: 'opened'; text: string }
  | { messageId: string; from: 'reporter'; sentOn: string; state: 'unreadable' }
  | { messageId: string; from: 'authority'; sentOn: string; state: 'sealed-for-reporter' };

/** Descifra las respuestas de la persona denunciante y verifica su firma. */
export async function decodeAuthorityThread(
  detail: ComplaintDetail,
  keys: AuthorityKeys,
): Promise<AuthorityThreadItem[]> {
  const folio = detail.summary.folio;
  const reporterSigning = fromBase64Url(detail.reporterKeys.signingPublicKey);
  return Promise.all(
    detail.messages.map(async (message: MailboxMessage): Promise<AuthorityThreadItem> => {
      const base = { messageId: message.messageId, sentOn: message.sentOn };
      if (message.from === 'authority') {
        return { ...base, from: 'authority', state: 'sealed-for-reporter' };
      }
      try {
        const text = await openMailboxMessage(message, keys.boxPrivateKey, reporterSigning, folio);
        return { ...base, from: 'reporter', state: 'opened', text };
      } catch {
        return { ...base, from: 'reporter', state: 'unreadable' };
      }
    }),
  );
}

/**
 * Cifra una pregunta hacia la llave del buzón de la persona denunciante y la firma con la
 * siguiente secuencia de la autoridad según los mensajes del detalle.
 * Lanza error si el texto está vacío o excede `MAX_MAILBOX_TEXT_LENGTH`.
 */
export async function sealAuthorityQuestion(
  text: string,
  detail: ComplaintDetail,
  keys: AuthorityKeys,
): Promise<AuthorityMessageRequest> {
  const reporterBox = fromBase64Url(detail.reporterKeys.boxPublicKey);
  const sequence = nextMailboxSequence(detail.messages, 'authority');
  const sealed = await sealMailboxMessage(
    text,
    { keyId: keyIdFor(reporterBox), publicKey: reporterBox },
    keys.signingPrivateKey,
    { folio: detail.summary.folio, from: 'authority', sequence },
  );
  return { sequence: sealed.sequence, envelope: sealed.envelope, signature: sealed.signature };
}

/** Borra de memoria las llaves privadas de la autoridad. */
export function wipeAuthorityKeys(keys: AuthorityKeys): void {
  keys.boxPrivateKey.fill(0);
  keys.signingPrivateKey.fill(0);
}
