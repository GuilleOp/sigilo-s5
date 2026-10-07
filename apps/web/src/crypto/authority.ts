// Panel de autoridad: importación de la llave de demostración, identidad y buzón.
import { Base64UrlSchema, KeyIdSchema } from '@sigilo/contracts';
import type {
  AuthorityMessageRequest,
  ComplaintDetail,
  IdentityBlock,
  MailboxMessage,
  OpenIdentityResponse,
} from '@sigilo/contracts';
import {
  fromBase64Url,
  keyIdFor,
  openEnvelope,
  openIdentity,
  openMailboxMessage,
  sealMailboxMessage,
  sealToPublicKey,
  sign,
  utf8Encode,
  verify,
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

const KEY_LENGTH = 32;
const PAIR_CHECK = utf8Encode('sigilo/web/authority-key-check');
const INVALID_FILE = 'El archivo no es una llave de autoridad válida.';

function readKey(record: Record<string, unknown>, field: string): Uint8Array {
  const parsed = Base64UrlSchema.safeParse(record[field]);
  if (!parsed.success) throw new Error(INVALID_FILE);
  const bytes = fromBase64Url(parsed.data);
  if (bytes.length !== KEY_LENGTH) throw new Error(INVALID_FILE);
  return bytes;
}

/**
 * Lee `authority-demo-key.json` y comprueba que corresponda a las llaves FIJADAS y que cada
 * privada corresponda a su pública.
 * Seguridad: la llave se queda solo en memoria; no se guarda en el navegador.
 */
export async function importAuthorityKey(text: string, pinned: PinnedKeys): Promise<AuthorityKeys> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(INVALID_FILE);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error(INVALID_FILE);
  const record = raw as Record<string, unknown>;
  const keyId = KeyIdSchema.safeParse(record['keyId']);
  if (record['version'] !== 1 || !keyId.success) throw new Error(INVALID_FILE);
  const keys: AuthorityKeys = {
    keyId: keyId.data,
    boxPublicKey: readKey(record, 'boxPublicKey'),
    boxPrivateKey: readKey(record, 'boxPrivateKey'),
    signingPublicKey: readKey(record, 'signingPublicKey'),
    signingPrivateKey: readKey(record, 'signingPrivateKey'),
  };
  if (
    keys.keyId !== pinned.set.authority.keyId ||
    keyIdFor(keys.boxPublicKey) !== keys.keyId ||
    !equalBytes(keys.boxPublicKey, pinned.authorityBoxPublicKey) ||
    !equalBytes(keys.signingPublicKey, pinned.authoritySigningPublicKey)
  ) {
    throw new Error('Esta llave no corresponde a la autoridad de este despliegue.');
  }
  if (!verify(sign(PAIR_CHECK, keys.signingPrivateKey), PAIR_CHECK, keys.signingPublicKey)) {
    throw new Error(INVALID_FILE);
  }
  try {
    const probe = await sealToPublicKey(
      PAIR_CHECK,
      { keyId: keys.keyId, publicKey: keys.boxPublicKey },
      PAIR_CHECK,
    );
    await openEnvelope(probe, keys.boxPrivateKey, PAIR_CHECK);
  } catch {
    throw new Error(INVALID_FILE);
  }
  return keys;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

/** Abre la identidad sellada que entregó el servidor tras registrar la solicitud. */
export function openSealedIdentity(
  response: OpenIdentityResponse,
  keys: AuthorityKeys,
): Promise<IdentityBlock> {
  return openIdentity(response.sealedIdentity, keys.boxPrivateKey, response.authVerifier);
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
  const reporterSigning = fromBase64Url(detail.reporterSigningPublicKey);
  return Promise.all(
    detail.messages.map(async (message: MailboxMessage): Promise<AuthorityThreadItem> => {
      const base = { messageId: message.messageId, sentOn: message.sentOn };
      if (message.from === 'authority') {
        return { ...base, from: 'authority', state: 'sealed-for-reporter' };
      }
      try {
        const text = await openMailboxMessage(message, keys.boxPrivateKey, reporterSigning, {
          folio,
          from: 'reporter',
        });
        return { ...base, from: 'reporter', state: 'opened', text };
      } catch {
        return { ...base, from: 'reporter', state: 'unreadable' };
      }
    }),
  );
}

/** Cifra una pregunta hacia la llave del buzón de la persona denunciante y la firma. */
export async function sealAuthorityQuestion(
  text: string,
  detail: ComplaintDetail,
  keys: AuthorityKeys,
): Promise<AuthorityMessageRequest> {
  const reporterBox = fromBase64Url(detail.reporterBoxPublicKey);
  return sealMailboxMessage(
    text,
    { keyId: keyIdFor(reporterBox), publicKey: reporterBox },
    keys.signingPrivateKey,
    { folio: detail.summary.folio, from: 'authority' },
  );
}

/** Borra de memoria las llaves privadas de la autoridad. */
export function wipeAuthorityKeys(keys: AuthorityKeys): void {
  keys.boxPrivateKey.fill(0);
  keys.signingPrivateKey.fill(0);
}
