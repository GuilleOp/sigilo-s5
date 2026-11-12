// Operaciones de la ventanilla única (perfil «ventanilla») hacia las rutas públicas de un nodo, por
// los pasos del mismo origen del enrutador: la bitácora pública, para el registro público, y la
// solicitud de alta, que revisa la operación del nodo del estado. Ninguna lleva denuncias.
import {
  LedgerPageSchema,
  POW_HEADER,
  PowChallengeSchema,
  RegistrationReceiptSchema,
  SignedLedgerHeadSchema,
  VENTANILLA_ROUTES,
} from '@sigilo/contracts';
import type {
  AuthorityDirectory,
  DirectoryNode,
  LedgerPage,
  PowChallenge,
  RegistrationReceipt,
  RegistrationRequest,
  SignedLedgerHead,
} from '@sigilo/contracts';
import { functionTableFor } from '@sigilo/red';
import { createApiClient } from '../services/api-client.ts';
import type { ApiClient } from '../services/api-client.ts';

/**
 * Nodo que cubre la entidad (o, con `null`, el orden federal) según su tabla de funciones, o
 * `null` si la entidad todavía no tiene nodo.
 */
export function nodeForJurisdiction(
  directory: AuthorityDirectory,
  stateCode: string | null,
): DirectoryNode | null {
  const table = functionTableFor(directory, stateCode);
  return table === undefined
    ? null
    : (directory.nodes.find((node) => node.id === table.nodeId) ?? null);
}

/** Bitácora pública de un nodo, a través de la ventanilla. */
export interface NodeLedgerApi {
  getLedgerHead(): Promise<SignedLedgerHead>;
  getLedgerEvents(from: number, limit: number): Promise<LedgerPage>;
}

export function createNodeLedgerApi(
  nodeId: string,
  client: ApiClient = createApiClient(),
): NodeLedgerApi {
  return {
    getLedgerHead: () =>
      client.json(VENTANILLA_ROUTES.nodeLedgerHead(nodeId), SignedLedgerHeadSchema),
    getLedgerEvents: (from, limit) =>
      client.json(VENTANILLA_ROUTES.nodeLedgerEvents(nodeId), LedgerPageSchema, {
        query: { from: String(from), limit: String(limit) },
      }),
  };
}

/** Solicitud de alta en un nodo, a través de la ventanilla. */
export interface NodeRegistrationApi {
  getPowChallenge(): Promise<PowChallenge>;
  submitRegistration(request: RegistrationRequest, proof: string): Promise<RegistrationReceipt>;
}

export function createNodeRegistrationApi(
  nodeId: string,
  client: ApiClient = createApiClient(),
): NodeRegistrationApi {
  return {
    getPowChallenge: () =>
      client.json(VENTANILLA_ROUTES.nodeRegistrationChallenge(nodeId), PowChallengeSchema),
    submitRegistration: (request, proof) =>
      client.json(VENTANILLA_ROUTES.nodeRegistrationRequests(nodeId), RegistrationReceiptSchema, {
        json: request,
        headers: { [POW_HEADER]: proof },
      }),
  };
}
