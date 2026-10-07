// Comparación de las llaves que publica el servidor con las fijadas en el bundle.
import type { PublicKeySet } from '@sigilo/contracts';

/** Campo del conjunto de llaves que no coincide. */
export type KeyField =
  | 'server.keyId'
  | 'server.signingPublicKey'
  | 'authority.keyId'
  | 'authority.boxPublicKey'
  | 'authority.signingPublicKey';

/** Error que bloquea el cifrado: el servidor publica llaves distintas de las fijadas. */
export class KeyMismatchError extends Error {
  readonly fields: KeyField[];

  constructor(fields: KeyField[]) {
    super(
      'Alerta de seguridad: las llaves del servidor no coinciden con las de esta aplicación. No enviamos nada.',
    );
    this.name = 'KeyMismatchError';
    this.fields = fields;
  }
}

/** Devuelve los campos que difieren entre las llaves fijadas y las publicadas. */
export function diffPublicKeys(pinned: PublicKeySet, served: PublicKeySet): KeyField[] {
  const pairs: [KeyField, string, string][] = [
    ['server.keyId', pinned.server.keyId, served.server.keyId],
    ['server.signingPublicKey', pinned.server.signingPublicKey, served.server.signingPublicKey],
    ['authority.keyId', pinned.authority.keyId, served.authority.keyId],
    ['authority.boxPublicKey', pinned.authority.boxPublicKey, served.authority.boxPublicKey],
    [
      'authority.signingPublicKey',
      pinned.authority.signingPublicKey,
      served.authority.signingPublicKey,
    ],
  ];
  return pairs.filter(([, expected, actual]) => expected !== actual).map(([field]) => field);
}

/**
 * Descarga las llaves publicadas y las compara con las fijadas.
 * Seguridad: si un intermediario o un servidor comprometido sustituye la llave de la autoridad,
 * la identidad se cifraría hacia él. Ante cualquier diferencia se lanza `KeyMismatchError`
 * y nunca se usan las llaves descargadas: siempre se cifra hacia las fijadas.
 */
export async function assertServedKeysMatch(
  fetchKeys: () => Promise<PublicKeySet>,
  pinned: PublicKeySet,
): Promise<void> {
  const fields = diffPublicKeys(pinned, await fetchKeys());
  if (fields.length > 0) throw new KeyMismatchError(fields);
}
