// Alta de autoridades (pasos 1 y 3 del protocolo): recibir la solicitud con el candado y que la
// cuenta de operación la apruebe con la huella confirmada por teléfono, o la rechace con motivo.
// Al aprobar se arma la entrada propuesta del directorio; firmarlo y crear las cuentas son pasos
// manuales aparte (docs/guia-conecta-tu-estado.md).
import { DirectoryAuthoritySchema } from '@sigilo/contracts';
import type {
  DirectoryAuthority,
  RegistrationDecision,
  RegistrationReceipt,
  RegistrationRequest,
  RegistrationView,
} from '@sigilo/contracts';
import {
  fromBase64Url,
  keyIdFor,
  padlockFingerprint,
  randomBytes,
  toDayDate,
  toHex,
} from '@sigilo/core';
import type { AppContext } from '../context.ts';
import type { RegistrationRecord } from '../db/registrations-repository.ts';
import { ApiFailure } from '../http/errors.ts';
import type { AuthorityAccount } from '../security/authority-registry.ts';

/** Nodo que se pone en la entrada propuesta cuando el servidor corre sin red. */
const SINGLE_NODE_ID = 'node.local';

/**
 * Comprueba que el candado sean dos llaves públicas de 32 bytes con su `keyId`, y calcula su huella.
 * Seguridad: el servidor no acepta un candado inconsistente, aunque la huella la vuelva a calcular
 * el navegador de quien aprueba.
 */
function fingerprintOf(request: RegistrationRequest): string {
  const box = fromBase64Url(request.padlock.boxPublicKey);
  const signing = fromBase64Url(request.padlock.signingPublicKey);
  if (box.length !== 32 || signing.length !== 32 || keyIdFor(box) !== request.padlock.keyId) {
    throw new ApiFailure('bad_request');
  }
  return padlockFingerprint(box, signing);
}

/** Registra una solicitud nueva y devuelve su folio y la huella del candado. */
export function submitRegistration(
  ctx: AppContext,
  request: RegistrationRequest,
): RegistrationReceipt {
  const fingerprint = fingerprintOf(request);
  const requestId = `ALTA-${toHex(randomBytes(6)).toUpperCase()}`;
  ctx.registrations.insert({
    requestId,
    receivedOn: toDayDate(ctx.deps.now()),
    request,
    fingerprint,
  });
  return { requestId, fingerprint };
}

/** Vista de una solicitud para la cuenta de operación. */
export function registrationView(ctx: AppContext, record: RegistrationRecord): RegistrationView {
  return {
    requestId: record.requestId,
    receivedOn: record.receivedOn,
    status: record.status,
    request: record.request,
    decision:
      record.decidedOn === null || record.decidedBy === null
        ? null
        : { on: record.decidedOn, accountId: record.decidedBy, reason: record.decisionReason },
    directoryEntry:
      record.status === 'approved' && record.decidedOn !== null
        ? directoryEntryFor(record, nodeIdOf(ctx), record.decidedOn)
        : null,
  };
}

/** Identificador corto y estable a partir del nombre: minúsculas, sin acentos, con guiones. */
function slugOf(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 48)
    .replace(/-+$/u, '');
  return slug === '' ? 'autoridad' : slug;
}

/** Entrada propuesta del directorio para una solicitud aprobada. */
export function directoryEntryFor(
  record: RegistrationRecord,
  nodeId: string,
  validFrom: string,
): DirectoryAuthority {
  const { request } = record;
  return DirectoryAuthoritySchema.parse({
    id: `authority.${slugOf(request.institutionName)}`,
    name: request.institutionName,
    nodeId,
    governmentLevel: request.governmentLevel,
    stateCode: request.stateCode,
    role: request.role,
    competence: {
      governmentLevels: [request.governmentLevel],
      stateCodes: request.stateCode === null ? [] : [request.stateCode],
      entityIds: [],
      laws: request.laws,
    },
    keyId: request.padlock.keyId,
    boxPublicKey: request.padlock.boxPublicKey,
    signingPublicKey: request.padlock.signingPublicKey,
    supervisorId: request.supervisorId,
    validFrom,
    validUntil: null,
  });
}

/** Nodo de este servidor (o el genérico sin red). */
export function nodeIdOf(ctx: AppContext): string {
  return ctx.deps.network?.nodeId ?? SINGLE_NODE_ID;
}

/**
 * Aprueba o rechaza una solicitud pendiente.
 * Seguridad: aprobar exige que la huella que leyó la institución por teléfono coincida con la del
 * candado guardado; si no, responde `conflict` y no cambia nada. Una solicitud ya resuelta no se
 * vuelve a resolver.
 */
export function decideRegistration(
  ctx: AppContext,
  account: AuthorityAccount,
  requestId: string,
  decision: RegistrationDecision,
): RegistrationView {
  const record = ctx.registrations.find(requestId);
  if (record === null) throw new ApiFailure('not_found');
  if (record.status !== 'pending') throw new ApiFailure('conflict');
  if (decision.decision === 'approve' && decision.fingerprint !== record.fingerprint) {
    throw new ApiFailure('conflict');
  }
  const today = toDayDate(ctx.deps.now());
  const isDecided = ctx.registrations.decide(requestId, {
    status: decision.decision === 'approve' ? 'approved' : 'rejected',
    decidedOn: today,
    decidedBy: account.accountId,
    decisionReason: decision.decision === 'reject' ? decision.reason : null,
  });
  if (!isDecided) throw new ApiFailure('conflict');
  const updated = ctx.registrations.find(requestId);
  if (updated === null) throw new ApiFailure('not_found');
  return registrationView(ctx, updated);
}
