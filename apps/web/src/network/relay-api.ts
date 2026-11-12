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
  RelayResponse,
  ReporterMessageRequest,
  RoutedBody,
  RoutedRequest,
  SubmitComplaintRequest,
  SubmitComplaintResponse,
  TrackingCredentials,
  TrackingView,
} from '@sigilo/contracts';
import { toBase64Url } from '@sigilo/core';
import { openRoutedReply, sealRoutedRequest } from '@sigilo/red';
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
  submitComplaint(request: SubmitComplaintRequest, proof: string): Promise<SubmitComplaintResponse>;
  track(credentials: TrackingCredentials): Promise<TrackingView>;
  sendReporterMessage(request: ReporterMessageRequest, proof: string): Promise<MailboxMessage>;
  fileAppeal(request: AppealRequest, proof: string): Promise<AppealResponse>;
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
 */
export function createRelayApi(target: RelayTarget, send: RelaySender): ReporterApi {
  async function call<T>(
    operationId: RoutedRequest['operationId'],
    schema: ResponseSchema<T>,
    body: RoutedBody,
    options: { proof?: string; query?: Record<string, string> } = {},
  ): Promise<T> {
    const sealed = await sealRoutedRequest(
      {
        to: target.authorityId,
        operationId,
        query: options.query ?? {},
        proofOfWork: options.proof ?? null,
        body,
      },
      target.node,
    );
    let reply;
    try {
      reply = await openRoutedReply(
        await send(sealed.relay),
        sealed.replyPrivateKey,
        target.authorityId,
      );
    } catch (error) {
      if (error instanceof ApiRequestError) throw error;
      throw new ApiRequestError('network', 0);
    } finally {
      sealed.replyPrivateKey.fill(0);
    }
    const value = reply.body.kind === 'json' ? reply.body.value : undefined;
    if (reply.status < 200 || reply.status >= 300) throw apiErrorFrom(reply.status, value);
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new ApiRequestError('invalid_response', reply.status);
    return parsed.data;
  }

  return {
    getPowChallenge: (purpose) =>
      call('getPowChallenge', PowChallengeSchema, { kind: 'none' }, { query: { purpose } }),
    uploadEvidence: async (image, mediaType, proof) =>
      call(
        'uploadEvidence',
        EvidenceUploadResponseSchema,
        { kind: 'binary', mediaType, data: await blobToBase64Url(image) },
        { proof },
      ),
    submitComplaint: (request, proof) =>
      call(
        'submitComplaint',
        SubmitComplaintResponseSchema,
        { kind: 'json', value: request },
        { proof },
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
