// Turnado a una autoridad de otro nodo (ADR 0005, SEC-19), hecho en el navegador de recepción y
// turnado: arma de nuevo la denuncia con las mismas llaves de seguimiento de quien denunció, abre
// cada prueba con la llave de la autoridad y la vuelve a cifrar hacia la autoridad destino (con el
// folio nuevo en el AAD y la misma sal, así el compromiso anclado no cambia), la cifra hacia ese
// nodo y el servidor solo la transporta. El enrutador y los nodos nunca ven las pruebas en claro.
import { SubmitComplaintResponseSchema } from '@sigilo/contracts';
import type {
  AuthorityDirectory,
  ComplaintDetail,
  EvidenceDescriptor,
  SubmitComplaintRequest,
} from '@sigilo/contracts';
import {
  encodeFileKey,
  fromBase64Url,
  generateFolio,
  sealEscalation,
  sealEvidence,
} from '@sigilo/core';
import type { EscalationEvidenceKey } from '@sigilo/core';
import { openRoutedReply, sealRoutedRequest } from '@sigilo/red';
import { createProofProvider, sendWithProof, workerPowSolver } from '../../crypto/proof-of-work.ts';
import type { PowSolver } from '../../crypto/proof-of-work.ts';
import type { AuthorityKeys } from '../../crypto/authority.ts';
import { EvidenceUnreadableError, openForAuthority } from '../../crypto/evidence.ts';
import { verifySubmission } from '../../crypto/submission.ts';
import { destinationFor, keysForDestination } from '../../network/network-keys.ts';
import { createRelayApi, sameOriginRelaySender } from '../../network/relay-api.ts';
import type { RelaySender } from '../../network/relay-api.ts';
import type { SigiloApi } from '../../services/api.ts';

/** Turnado que no se puede hacer; el mensaje es para mostrarse. */
export class TransferBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransferBlockedError';
  }
}

/** Resultado del turnado: folio nuevo en el nodo destino. */
export interface TransferResult {
  folio: string;
  authorityName: string;
  nodeName: string;
}

/** Datos del turnado. */
export interface TransferInput {
  token: string;
  /** Llaves de la autoridad de la sesión, para abrir las pruebas antes de volver a cifrarlas. */
  keys: AuthorityKeys;
  /** Autoridad de la sesión (va en el AAD de las pruebas cifradas hacia ella). */
  authorityId: string;
  detail: ComplaintDetail;
  directory: AuthorityDirectory;
  targetAuthorityId: string;
  note: string;
  api: SigiloApi;
  send?: RelaySender;
  solver?: PowSolver;
  onProgress?: (message: string) => void;
}

/**
 * Autoridades de otros nodos a las que se puede turnar (nunca supervisoras; sí su buzón general).
 * El nodo propio se reconoce por la primera autoridad conocida de `ownAuthorityIds`; si ninguna
 * está en el directorio, se listan todas y el servidor rechaza las del mismo nodo.
 */
export function transferTargets(directory: AuthorityDirectory, ownAuthorityIds: readonly string[]) {
  const own = directory.authorities.find((item) => ownAuthorityIds.includes(item.id));
  return directory.authorities.filter(
    (item) => item.role !== 'supervisory' && (own === undefined || item.nodeId !== own.nodeId),
  );
}

/**
 * Turna la denuncia a una autoridad de otro nodo.
 * Seguridad: el sobre se cifra en este navegador hacia la llave del nodo destino del directorio
 * verificado; el nodo de origen y el enrutador no pueden leerlo. Se conservan las llaves de
 * seguimiento de quien denunció, así sigue con sus mismas 8 palabras. La identidad sellada no se
 * puede volver a sellar sin abrirla (dos aprobaciones), por eso esas denuncias no se turnan aquí.
 * Lanza `TransferBlockedError` si no se puede, o si el comprobante del destino no verifica.
 */
export async function transferToOtherNode(input: TransferInput): Promise<TransferResult> {
  const { detail, directory, token, api } = input;
  const progress = input.onProgress ?? (() => undefined);
  if (detail.summary.mode === 'sealed') {
    throw new TransferBlockedError(
      'Esta denuncia tiene identidad sellada. Para turnarla a otro nodo habría que abrirla con dos aprobaciones y volver a sellarla hacia la autoridad destino; este prototipo todavía no lo hace. Puedes reasignarla dentro del nodo.',
    );
  }
  const destination = destinationFor(directory, input.targetAuthorityId);
  const send = input.send ?? sameOriginRelaySender();
  const relayApi = createRelayApi(
    { authorityId: destination.authority.id, node: destination.node },
    send,
  );
  const proofs = createProofProvider(
    relayApi,
    'complaint',
    input.solver ?? workerPowSolver,
    progress,
  );

  // El folio del destino se elige aquí, antes de volver a cifrar las pruebas: va en su AAD.
  const targetFolio = generateFolio();
  const destinationKey = {
    keyId: destination.authority.keyId,
    publicKey: fromBase64Url(destination.authority.boxPublicKey),
  };
  const evidence: EvidenceDescriptor[] = [];
  const evidenceKeys: EscalationEvidenceKey[] = [];
  for (const [index, descriptor] of detail.evidence.entries()) {
    progress(
      `Cifrando la prueba ${index + 1} de ${detail.evidence.length} para la autoridad destino.`,
    );
    let blob: Blob;
    try {
      blob = await api.getEvidence(token, descriptor.evidenceId);
    } catch {
      throw new TransferBlockedError(
        'Una de las pruebas ya no está guardada (se descartó o venció su retención). No se puede turnar completa.',
      );
    }
    let opened;
    try {
      opened = await openForAuthority(
        new Uint8Array(await blob.arrayBuffer()),
        descriptor,
        detail,
        input.keys,
        input.authorityId,
      );
    } catch (failure) {
      throw new TransferBlockedError(
        failure instanceof EvidenceUnreadableError
          ? `No pudimos abrir una de las pruebas para volver a cifrarla: ${failure.message}`
          : 'No pudimos abrir una de las pruebas para volver a cifrarla.',
      );
    }
    // Seguridad: con la misma sal, el compromiso del contenido es el anclado aquí; la copia del
    // destino queda ligada a la del origen sin revelar nada en la bitácora.
    const resealed = await sealEvidence(
      opened.plaintext,
      destinationKey,
      {
        folio: targetFolio,
        authorityId: destination.authority.id,
        mediaType: descriptor.mediaType,
      },
      opened.isLegacy ? undefined : opened.salt,
    );
    opened.plaintext.fill(0);
    if (!opened.isLegacy && resealed.commitment !== opened.commitment) {
      throw new TransferBlockedError('La prueba re-cifrada no conserva su compromiso.');
    }
    progress(`Enviando la prueba ${index + 1} de ${detail.evidence.length} al nodo destino.`);
    const uploaded = await sendWithProof(proofs, (proof) =>
      relayApi.uploadEvidence(
        new Blob([new Uint8Array(resealed.container)], { type: descriptor.mediaType }),
        descriptor.mediaType,
        proof,
      ),
    );
    if (uploaded.sha256 !== resealed.sha256 || uploaded.sizeBytes !== resealed.container.length) {
      throw new TransferBlockedError('El nodo destino no guardó una prueba tal como se envió.');
    }
    evidence.push(uploaded);
    evidenceKeys.push({
      evidenceId: uploaded.evidenceId,
      fileKey: encodeFileKey(resealed.fileKey),
    });
  }

  const request: SubmitComplaintRequest = {
    version: 1,
    mode: detail.summary.mode,
    facts: detail.facts,
    evidence,
    protectionRequested: detail.summary.protectionRequested,
    reporterKeys: detail.reporterKeys,
    authVerifier: detail.authVerifier,
  };
  // Segunda llave hacia la supervisora de la autoridad destino (hechos, pruebas y las llaves de sus
  // archivos, nunca identidad).
  if (destination.supervisor !== undefined) {
    request.escalationEnvelope = await sealEscalation(
      {
        version: 1,
        mode: request.mode,
        facts: request.facts,
        evidence: request.evidence,
        protectionRequested: request.protectionRequested,
      },
      {
        keyId: destination.supervisor.keyId,
        publicKey: fromBase64Url(destination.supervisor.boxPublicKey),
      },
      { authVerifier: request.authVerifier, reporterKeys: request.reporterKeys },
      evidenceKeys,
    );
  }

  progress('Cerrando la denuncia con la llave del nodo destino.');
  const proof = await proofs.current();
  const sealed = await sealRoutedRequest(
    {
      to: destination.authority.id,
      operationId: 'submitComplaint',
      query: {},
      proofOfWork: proof,
      body: { kind: 'json', value: request },
      folio: targetFolio,
    },
    destination.node,
  );
  progress('Turnando por el enrutador ciego.');
  const response = await api.transferComplaint(token, detail.summary.folio, {
    toAuthorityId: destination.authority.id,
    relay: sealed.relay,
    note: input.note,
  });
  const reply = await openRoutedReply(
    response.relay,
    sealed.replyPrivateKey,
    destination.authority.id,
  );
  sealed.replyPrivateKey.fill(0);
  const parsed =
    reply.body.kind === 'json' ? SubmitComplaintResponseSchema.safeParse(reply.body.value) : null;
  if (
    parsed === null ||
    !parsed.success ||
    reply.status !== 201 ||
    parsed.data.folio !== targetFolio
  ) {
    throw new TransferBlockedError(
      'El nodo destino no recibió la denuncia. El turnado quedó registrado aquí; avisa a soporte para revisarlo.',
    );
  }
  if (!verifySubmission(request, parsed.data, keysForDestination(destination))) {
    throw new TransferBlockedError(
      'El comprobante del nodo destino no verifica con su llave del directorio. No avisamos a la persona.',
    );
  }
  progress('Avisando a la persona su folio nuevo.');
  // El nodo de origen liga el comprobante a esta denuncia con la denuncia que recibió el destino.
  await api.confirmTransfer(token, detail.summary.folio, {
    transferId: response.transferId,
    receipt: parsed.data.receipt,
    request,
  });
  return {
    folio: parsed.data.folio,
    authorityName: destination.authority.name,
    nodeName: destination.node.name,
  };
}
