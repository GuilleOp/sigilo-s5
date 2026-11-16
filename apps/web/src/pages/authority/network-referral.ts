// Vista al Ministerio Público hacia una fiscalía de otro nodo de la red. Reutiliza el turnado entre
// nodos para las pruebas: este navegador abre cada una con la llave de la autoridad y la vuelve a
// cifrar hacia la llave de la fiscalía destino del directorio verificado (con el folio de la copia
// en el AAD), y la sube a ese nodo por el enrutador ciego. Después el nodo de origen firma y entrega
// el paquete de la vista (hechos y descriptores). No es un turnado: la denuncia, su identidad
// sellada y el buzón con la persona se quedan aquí.
import type {
  AuthorityDirectory,
  ComplaintDetail,
  CriminalReferralBasisKey,
  DirectoryAuthority,
  ProcedureState,
} from '@sigilo/contracts';
import { generateFolio, toDayDate } from '@sigilo/core';
import { isAuthorityValidOn } from '@sigilo/red';
import { createProofProvider, workerPowSolver } from '../../crypto/proof-of-work.ts';
import type { PowSolver } from '../../crypto/proof-of-work.ts';
import type { AuthorityKeys } from '../../crypto/authority.ts';
import { destinationFor } from '../../network/network-keys.ts';
import { createRelayApi, sameOriginRelaySender } from '../../network/relay-api.ts';
import type { RelaySender } from '../../network/relay-api.ts';
import type { SigiloApi } from '../../services/api.ts';
import { resealEvidenceTo } from './transfer.ts';

/** Fiscalía de otro nodo a la que se puede dar vista, con el nombre de su nodo. */
export interface NetworkProsecution {
  authority: DirectoryAuthority;
  nodeName: string;
}

/**
 * Fiscalías de otros nodos del directorio verificado (papel `prosecution`, vigentes hoy). El nodo
 * propio se reconoce por la primera autoridad conocida de `ownAuthorityIds`; si ninguna está en el
 * directorio, no se ofrece ninguna (el servidor tampoco firmaría la vista).
 */
export function networkProsecutions(
  directory: AuthorityDirectory,
  ownAuthorityIds: readonly string[],
  today: string = toDayDate(new Date()),
): NetworkProsecution[] {
  const own = directory.authorities.find((item) => ownAuthorityIds.includes(item.id));
  if (own === undefined) return [];
  return directory.authorities
    .filter(
      (item) =>
        item.role === 'prosecution' &&
        item.nodeId !== own.nodeId &&
        isAuthorityValidOn(item, today),
    )
    .map((authority) => ({
      authority,
      nodeName:
        directory.nodes.find((node) => node.id === authority.nodeId)?.name ?? authority.nodeId,
    }));
}

/** Datos de la vista a otro nodo. */
export interface NetworkReferralInput {
  token: string;
  keys: AuthorityKeys;
  /** Autoridad de la sesión (va en el AAD de las pruebas cifradas hacia ella). */
  authorityId: string;
  detail: ComplaintDetail;
  directory: AuthorityDirectory;
  targetAuthorityId: string;
  basis: CriminalReferralBasisKey;
  note?: string;
  api: SigiloApi;
  send?: RelaySender;
  solver?: PowSolver;
  onProgress?: (message: string) => void;
}

/**
 * Da vista a una fiscalía de otro nodo: re-cifra y sube las pruebas guardadas hacia su llave y pide
 * al nodo que entregue la vista. Devuelve el estado del trámite con la vista registrada.
 * Seguridad: las pruebas en claro solo existen en este navegador; la llave de la autoridad nunca
 * sale. La identidad sellada y los mensajes no viajan. Lanza `TransferBlockedError` si una prueba
 * no se puede abrir o el nodo destino no la guardó tal como se envió.
 */
export async function referToOtherNode(input: NetworkReferralInput): Promise<ProcedureState> {
  const progress = input.onProgress ?? (() => undefined);
  const destination = destinationFor(input.directory, input.targetAuthorityId);
  const relayApi = createRelayApi(
    { authorityId: destination.authority.id, node: destination.node },
    input.send ?? sameOriginRelaySender(),
  );
  const proofs = createProofProvider(
    relayApi,
    'complaint',
    input.solver ?? workerPowSolver,
    progress,
  );
  // El folio de la copia en el nodo destino se elige aquí: va en el AAD de las pruebas. No es el
  // folio de la persona denunciante ni sirve para darle seguimiento.
  const referralFolio = generateFolio();
  const { evidence } = await resealEvidenceTo({
    token: input.token,
    keys: input.keys,
    authorityId: input.authorityId,
    detail: input.detail,
    api: input.api,
    target: destination.authority,
    targetFolio: referralFolio,
    relayApi,
    proofs,
    progress,
    skipMissing: true,
  });
  progress('Entregando la vista por el enrutador ciego.');
  return input.api.referToNetworkProsecutor(input.token, input.detail.summary.folio, {
    toAuthorityId: destination.authority.id,
    basis: input.basis,
    referralFolio,
    evidence,
    ...(input.note === undefined ? {} : { note: input.note }),
  });
}
