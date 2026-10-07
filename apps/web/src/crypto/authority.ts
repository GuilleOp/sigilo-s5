// Panel de autoridad: importación de la llave de demostración, identidad y buzón.
import { AuthorityDemoKeySchema } from '@sigilo/contracts';
import type {
  AuthorityMessageRequest,
  ComplaintDetail,
  IdentityBlock,
  LedgerPage,
  MailboxMessage,
  OpenIdentityResponse,
} from '@sigilo/contracts';
import {
  assertBoxKeyPair,
  assertSigningKeyPair,
  computeEventHash,
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
  verifyLedgerHead,
} from '@sigilo/core';
import type { PinnedKeys } from '../config/pinned-keys.ts';

/** Llaves de la autoridad, en memoria y decodificadas. */
export interface AuthorityKeys {
  keyId: string;
  boxPublicKey: Uint8Array;
  boxPrivateKey: Uint8Array;
  signingPublicKey: Uint8Array;
  signingPrivateKey: Uint8Array;
}

const INVALID_FILE = 'El archivo no es una llave de autoridad válida.';

function decodeKeyFile(text: string): AuthorityKeys {
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

/**
 * Lee `authority-demo-key.json` (`AuthorityDemoKeySchema`), comprueba que cada privada
 * corresponda a su pública y que las públicas sean las FIJADAS en el bundle.
 * Seguridad: la llave se queda solo en memoria; no se guarda en el navegador.
 */
export function importAuthorityKey(text: string, pinned: PinnedKeys): AuthorityKeys {
  const keys = decodeKeyFile(text);
  const matchesPinned =
    keys.keyId === pinned.set.authority.keyId &&
    keyIdFor(keys.boxPublicKey) === keys.keyId &&
    equalBytes(keys.boxPublicKey, pinned.authorityBoxPublicKey) &&
    equalBytes(keys.signingPublicKey, pinned.authoritySigningPublicKey);
  if (!matchesPinned) {
    wipeAuthorityKeys(keys);
    throw new Error('Esta llave no corresponde a la autoridad de este despliegue.');
  }
  return keys;
}

/**
 * Abre la identidad sellada con el contexto recalculado desde el detalle vigente.
 * Seguridad: no se confía en ningún digesto del servidor; si alteró hechos, pruebas, llaves o el
 * verificador del recibo, el sobre no abre. En modo sellado, abrirlo prueba además que
 * `detail.reporterKeys` son las de la persona denunciante (van en el AAD).
 */
export function openSealedIdentity(
  response: OpenIdentityResponse,
  detail: ComplaintDetail,
  keys: AuthorityKeys,
): Promise<IdentityBlock> {
  return openIdentity(
    response.sealedIdentity,
    keys.boxPrivateKey,
    identityContextFromDetail(detail),
  );
}

/**
 * Estado de las llaves de la persona denunciante frente al registro público: `verified` si el
 * digesto del envío recalculado desde el detalle coincide con el evento `complaint.received`
 * publicado, `pending` mientras ese evento no se publica y `mismatch` si no coincide.
 */
export type ReporterKeysVerification = 'verified' | 'pending' | 'mismatch';

/**
 * Recalcula `submissionDigest` desde el detalle (`submissionDigestFromDetail`) y lo compara con el
 * `payloadDigest` del evento `complaint.received` publicado en la bitácora, cuya cabeza debe estar
 * firmada por la llave FIJADA del servidor.
 * Seguridad: el evento lo verificó la persona denunciante contra su comprobante; si coincide, las
 * llaves del buzón, los hechos y las pruebas del detalle son los que ella envió, también en modo
 * anónimo (donde no hay sobre de identidad que lo pruebe).
 */
export async function verifyReporterKeys(
  detail: ComplaintDetail,
  fetchPage: (from: number, limit: number) => Promise<LedgerPage>,
  pinned: PinnedKeys,
): Promise<ReporterKeysVerification> {
  const seq = detail.receivedEventSeq;
  if (seq === undefined) return 'pending';
  const page = await fetchPage(seq, 1);
  const event = page.events[0];
  const folio = detail.summary.folio;
  const isAuthentic =
    event !== undefined &&
    event.seq === seq &&
    page.head.seq >= seq &&
    verifyLedgerHead(page.head, pinned.serverSigningPublicKey) &&
    event.type === 'complaint.received' &&
    event.at === detail.summary.receivedOn &&
    event.folioDigest === folioDigest(folio) &&
    event.hash === computeEventHash(event);
  if (!isAuthentic) return 'mismatch';
  const expected = receivedPayloadDigest(folio, submissionDigestFromDetail(detail));
  return event.payloadDigest === expected ? 'verified' : 'mismatch';
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
