// Operaciones de quien denuncia a través del enrutador ciego: cada petición se cifra hacia la llave
// del nodo de la autoridad destino y viaja por el paso del mismo origen al enrutador; la respuesta
// llega cifrada hacia una llave efímera que solo tiene esta pestaña.
import {
  AppealResponseSchema,
  EvidenceUploadResponseSchema,
  MailboxMessageSchema,
  NETWORK_ROUTES,
  PowChallengeSchema,
  RelayResponseSchema,
  SubmitComplaintResponseSchema,
  TrackingViewSchema,
} from '@sigilo/contracts';
import type {
  AppealRequest,
  AppealResponse,
  DirectoryNode,
  EvidenceDescriptor,
  MailboxMessage,
  PowChallenge,
  PowPurpose,
  RelayQueueReceipt,
  RelayResponse,
  ReporterMessageRequest,
  RoutedBody,
  RoutedReply,
  RoutedRequest,
  SubmitComplaintRequest,
  SubmitComplaintResponse,
  TrackingCredentials,
  TrackingView,
} from '@sigilo/contracts';
import { toBase64Url } from '@sigilo/core';
import { openRoutedReply, sealRoutedRequest, verifyRelayQueueReceipt } from '@sigilo/red';
import type { RelayRequest } from '@sigilo/contracts';
import { apiErrorFrom, ApiRequestError, createApiClient } from '../services/api-client.ts';
import type { ApiClient, ResponseSchema } from '../services/api-client.ts';

/** Operaciones de quien denuncia que también existen por la red. */
export interface ReporterApi {
  getPowChallenge(purpose: PowPurpose): Promise<PowChallenge>;
  uploadEvidence(
    image: Blob,
    mediaType: 'image/jpeg' | 'image/png',
    proof: string,
  ): Promise<EvidenceDescriptor>;
  /**
   * Envía la denuncia; `folio` es el que eligió el navegador (`generateFolio`), porque las pruebas
   * se cifran con el folio en el AAD antes de enviarla.
   */
  submitComplaint(
    request: SubmitComplaintRequest,
    proof: string,
    folio?: string,
  ): Promise<SubmitComplaintResponse>;
  track(credentials: TrackingCredentials): Promise<TrackingView>;
  sendReporterMessage(request: ReporterMessageRequest, proof: string): Promise<MailboxMessage>;
  fileAppeal(request: AppealRequest, proof: string): Promise<AppealResponse>;
}

/** Operaciones de quien denuncia por la red: además, la denuncia con folio propio y la cola. */
export interface RelayReporterApi extends ReporterApi {
  /** Si esta ventanilla puede dejar denuncias en la cola de entrega del enrutador. */
  readonly hasQueue: boolean;
  /** Reto de la cola del enrutador; lanza `not_found` sin cola. */
  getQueueChallenge(): Promise<PowChallenge>;
  /**
   * Envía la denuncia con un folio elegido en el navegador (`generateFolio`): así la persona lo
   * conoce aunque la respuesta se pierda o la denuncia quede en la cola de entrega.
   */
  submitRoutedComplaint(
    request: SubmitComplaintRequest,
    proof: string,
    folio: string,
  ): Promise<SubmitComplaintResponse>;
  /**
   * Envía la denuncia pidiendo al enrutador que la guarde cerrada en su cola si el nodo no
   * responde. `queueProof` es la solución del reto de la cola. Lanza `ApiRequestError` con
   * `invalid_response` si el acuse no lo firmó la operación de la raíz fijada o no es de este
   * sobre, y `not_found` si la ventanilla no tiene cola.
   */
  submitDeferredComplaint(
    request: SubmitComplaintRequest,
    folio: string,
    queueProof: string,
  ): Promise<DeferredSubmission>;
}

/** Resultado de una denuncia con cola: entregada al momento o guardada en la cola. */
export type DeferredSubmission =
  | { kind: 'delivered'; response: SubmitComplaintResponse }
  | { kind: 'queued'; receipt: RelayQueueReceipt };

/** Lo que necesita la cola de entrega: su reto y la llave de la operación que firma el acuse. */
export interface RelayQueueAccess {
  getChallenge(): Promise<PowChallenge>;
  operator: { keyId: string; signingPublicKey: string };
}

/** Reto de la cola por el paso del mismo origen (`GET /api/v1/red/queue/challenge`). */
export function sameOriginQueueChallenge(
  client: ApiClient = createApiClient(),
): () => Promise<PowChallenge> {
  return () => client.json(NETWORK_ROUTES.queueChallenge, PowChallengeSchema);
}

/** Envío de un sobre al enrutador; se inyecta para probar sin red. */
export type RelaySender = (relay: RelayRequest) => Promise<RelayResponse>;

/** Envío por el paso del mismo origen (`POST /api/v1/red/relay`). */
export function sameOriginRelaySender(client: ApiClient = createApiClient()): RelaySender {
  return (relay) => client.json(NETWORK_ROUTES.relay, RelayResponseSchema, { json: relay });
}

/**
 * Destino de la red: autoridad y nodo que la aloja. El enrutador solo ve el nodo; la autoridad va
 * cifrada dentro del sobre (v2).
 */
export interface RelayTarget {
  authorityId: string;
  node: Pick<DirectoryNode, 'id' | 'boxKeyId' | 'boxPublicKey'>;
}

async function blobToBase64Url(blob: Blob): Promise<string> {
  return toBase64Url(new Uint8Array(await blob.arrayBuffer()));
}

/**
 * Crea las operaciones de quien denuncia hacia una autoridad de la red.
 * Seguridad: el enrutador solo ve el nodo destino y el tramo de tamaño; la autoridad, la
 * operación, el cuerpo y la prueba de trabajo van dentro del sobre. Si la respuesta no abre (el enrutador no
 * pudo entregar y respondió relleno), se trata como un fallo de conexión.
 * Con `queue`, `submitDeferredComplaint` puede dejar la denuncia en la cola del enrutador.
 */
export function createRelayApi(
  target: RelayTarget,
  send: RelaySender,
  queue?: RelayQueueAccess,
): RelayReporterApi {
  interface CallOptions {
    proof?: string;
    query?: Record<string, string>;
    folio?: string;
    deferral?: { proof: string };
  }

  async function exchange(
    operationId: RoutedRequest['operationId'],
    body: RoutedBody,
    options: CallOptions,
  ): Promise<{ reply: RoutedReply } | { queued: RelayQueueReceipt }> {
    const sealed = await sealRoutedRequest(
      {
        to: target.authorityId,
        operationId,
        query: options.query ?? {},
        proofOfWork: options.proof ?? null,
        body,
        ...(options.folio === undefined ? {} : { folio: options.folio }),
      },
      target.node,
    );
    const relay =
      options.deferral === undefined
        ? sealed.relay
        : { ...sealed.relay, deferral: options.deferral };
    try {
      const response = await send(relay);
      if (options.deferral !== undefined && response.queued !== null) {
        // Seguridad: el acuse vale solo si lo firmó la operación fijada y es de este mismo sobre.
        const isValid =
          queue !== undefined &&
          verifyRelayQueueReceipt(response.queued, queue.operator, {
            node: target.node.id,
            sealed: relay.sealed,
          });
        if (!isValid) throw new ApiRequestError('invalid_response', 200);
        return { queued: response.queued };
      }
      return {
        reply: await openRoutedReply(response, sealed.replyPrivateKey, target.authorityId),
      };
    } catch (error) {
      if (error instanceof ApiRequestError) throw error;
      throw new ApiRequestError('network', 0);
    } finally {
      sealed.replyPrivateKey.fill(0);
    }
  }

  function parseReply<T>(reply: RoutedReply, schema: ResponseSchema<T>): T {
    const value = reply.body.kind === 'json' ? reply.body.value : undefined;
    if (reply.status < 200 || reply.status >= 300) throw apiErrorFrom(reply.status, value);
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new ApiRequestError('invalid_response', reply.status);
    return parsed.data;
  }

  async function call<T>(
    operationId: RoutedRequest['operationId'],
    schema: ResponseSchema<T>,
    body: RoutedBody,
    options: CallOptions = {},
  ): Promise<T> {
    const result = await exchange(operationId, body, options);
    if (!('reply' in result)) throw new ApiRequestError('invalid_response', 200);
    return parseReply(result.reply, schema);
  }

  return {
    hasQueue: queue !== undefined,
    getQueueChallenge: () =>
      queue === undefined
        ? Promise.reject(new ApiRequestError('not_found', 404))
        : queue.getChallenge(),
    submitRoutedComplaint: (request, proof, folio) =>
      call(
        'submitComplaint',
        SubmitComplaintResponseSchema,
        { kind: 'json', value: request },
        { proof, folio },
      ),
    submitDeferredComplaint: async (request, folio, queueProof) => {
      if (queue === undefined) throw new ApiRequestError('not_found', 404);
      const result = await exchange(
        'submitComplaint',
        { kind: 'json', value: request },
        { folio, deferral: { proof: queueProof } },
      );
      if ('queued' in result) return { kind: 'queued', receipt: result.queued };
      return {
        kind: 'delivered',
        response: parseReply(result.reply, SubmitComplaintResponseSchema),
      };
    },
    getPowChallenge: (purpose) =>
      call('getPowChallenge', PowChallengeSchema, { kind: 'none' }, { query: { purpose } }),
    uploadEvidence: async (image, mediaType, proof) =>
      call(
        'uploadEvidence',
        EvidenceUploadResponseSchema,
        { kind: 'binary', mediaType, data: await blobToBase64Url(image) },
        { proof },
      ),
    submitComplaint: (request, proof, folio) =>
      call(
        'submitComplaint',
        SubmitComplaintResponseSchema,
        { kind: 'json', value: request },
        folio === undefined ? { proof } : { proof, folio },
      ),
    track: (credentials) =>
      call('getTracking', TrackingViewSchema, { kind: 'json', value: credentials }),
    sendReporterMessage: (request, proof) =>
      call(
        'sendReporterMessage',
        MailboxMessageSchema,
        { kind: 'json', value: request },
        { proof },
      ),
    fileAppeal: (request, proof) =>
      call('fileAppeal', AppealResponseSchema, { kind: 'json', value: request }, { proof }),
  };
}
