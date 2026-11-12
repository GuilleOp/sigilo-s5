// Turnado o reasignación dentro del nodo: antes de ceder la denuncia, el navegador de la autoridad
// que la tiene abre la llave de cada archivo de prueba y la vuelve a cifrar hacia la llave pública de
// la autoridad destino. El contenedor cifrado no cambia; el nodo guarda las llaves sin abrirlas.
import type { ComplaintDetail } from '@sigilo/contracts';
import { fromBase64Url } from '@sigilo/core';
import type { EnvelopeRecipient } from '@sigilo/core';
import type { PinnedKeys } from '../../config/pinned-keys.ts';
import { grantEvidenceKeysTo } from '../../crypto/evidence.ts';
import type { NetworkStatus } from '../../network/use-network-state.ts';
import type { SigiloApi } from '../../services/api.ts';
import type { AuthoritySession } from './authority-session.ts';

/** No se pudieron compartir las llaves de las pruebas; el mensaje es para mostrarse. */
export class EvidenceKeysError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvidenceKeysError';
  }
}

/**
 * Llave pública de una autoridad de este nodo: la del directorio firmado y verificado o, con un solo
 * nodo (todas las autoridades usan la llave fijada), la FIJADA en el bundle. `null` si la red no se
 * pudo verificar: no se cifra hacia una llave sin verificar.
 */
export function authorityRecipient(
  authorityId: string,
  network: NetworkStatus,
  pinned: PinnedKeys,
): EnvelopeRecipient | null {
  if (network.kind === 'single-node') {
    return { keyId: pinned.set.authority.keyId, publicKey: pinned.authorityBoxPublicKey };
  }
  if (network.kind !== 'verified') return null;
  const authority = network.directory.authorities.find((item) => item.id === authorityId);
  // El buzón general no figura siempre en el directorio: usa la llave fijada del nodo.
  if (authority === undefined) {
    return { keyId: pinned.set.authority.keyId, publicKey: pinned.authorityBoxPublicKey };
  }
  return { keyId: authority.keyId, publicKey: fromBase64Url(authority.boxPublicKey) };
}

/**
 * Comparte con la autoridad destino las llaves de las pruebas guardadas y devuelve cuántas
 * compartió (0 si la denuncia no tiene pruebas cifradas guardadas).
 * Lanza `EvidenceKeysError` si no se puede: sin llaves, la autoridad destino no podría abrirlas.
 */
export async function shareEvidenceKeys(input: {
  session: AuthoritySession;
  detail: ComplaintDetail;
  targetAuthorityId: string;
  network: NetworkStatus;
  pinned: PinnedKeys;
  api: SigiloApi;
}): Promise<number> {
  const { session, detail, api } = input;
  const stored = (detail.evidenceCustody?.items ?? []).filter((item) => item.isStored);
  if (stored.length === 0) return 0;
  const recipient = authorityRecipient(input.targetAuthorityId, input.network, input.pinned);
  if (recipient === null) {
    throw new EvidenceKeysError(
      'No pudimos verificar el directorio de la red para cifrar las llaves de las pruebas hacia la autoridad destino. Inténtalo de nuevo en unos minutos.',
    );
  }
  let grants;
  try {
    grants = await grantEvidenceKeysTo(
      detail,
      session.keys,
      session.account.authorityId,
      { authorityId: input.targetAuthorityId, recipient },
      async (evidenceId) =>
        new Uint8Array(await (await api.getEvidence(session.token, evidenceId)).arrayBuffer()),
    );
  } catch {
    throw new EvidenceKeysError(
      'No pudimos abrir las pruebas con tu llave para compartirlas con la autoridad destino. Sin ellas no podría verlas; no turnamos la denuncia.',
    );
  }
  if (grants.length === 0) return 0;
  const { granted } = await api.grantEvidenceKeys(session.token, detail.summary.folio, { grants });
  return granted;
}
