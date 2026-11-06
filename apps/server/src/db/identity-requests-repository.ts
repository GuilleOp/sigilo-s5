// Solicitudes de apertura de la identidad sellada y sus aprobaciones (2 de 3), de solo agregar.
import type { DatabaseSync } from 'node:sqlite';
import type { IdentityApproval } from '@sigilo/contracts';
import { readText } from './database.ts';
import type { Row } from './database.ts';

/** Solicitud de apertura tal como se guarda. */
export interface StoredIdentityRequest {
  requestId: string;
  folio: string;
  authorityId: string;
  requestedOn: string;
  legalBasis: string;
  requestedBy: string;
}

/** Operaciones sobre `identity_requests` e `identity_approvals`. */
export interface IdentityRequestsRepository {
  insertRequest(request: StoredIdentityRequest): void;
  findRequest(requestId: string): StoredIdentityRequest | null;
  listRequests(folio: string): StoredIdentityRequest[];
  /**
   * Registra una aprobación; devuelve `false` si esa cuenta ya había aprobado la solicitud.
   * Seguridad: el índice único (solicitud, cuenta) lo impide también en la base.
   */
  insertApproval(approvalId: string, requestId: string, approval: IdentityApproval): boolean;
  listApprovals(requestId: string): IdentityApproval[];
}

function toRequest(row: Row): StoredIdentityRequest {
  return {
    requestId: readText(row, 'request_id'),
    folio: readText(row, 'folio'),
    authorityId: readText(row, 'authority_id'),
    requestedOn: readText(row, 'requested_on'),
    legalBasis: readText(row, 'legal_basis'),
    requestedBy: readText(row, 'requested_by'),
  };
}

/** Crea el repositorio de solicitudes de apertura sobre `db`. */
export function createIdentityRequestsRepository(db: DatabaseSync): IdentityRequestsRepository {
  const insertRequestStatement = db.prepare(
    `INSERT INTO identity_requests (request_id, folio, authority_id, requested_on, legal_basis,
       requested_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const findRequestStatement = db.prepare('SELECT * FROM identity_requests WHERE request_id = ?');
  const listRequestsStatement = db.prepare(
    'SELECT * FROM identity_requests WHERE folio = ? ORDER BY requested_on, request_id',
  );
  const insertApprovalStatement = db.prepare(
    `INSERT OR IGNORE INTO identity_approvals (approval_id, request_id, account_id, approved_on,
       legal_basis)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const listApprovalsStatement = db.prepare(
    `SELECT account_id, approved_on, legal_basis FROM identity_approvals
     WHERE request_id = ? ORDER BY approved_on, approval_id`,
  );
  return {
    insertRequest: (request) => {
      insertRequestStatement.run(
        request.requestId,
        request.folio,
        request.authorityId,
        request.requestedOn,
        request.legalBasis,
        request.requestedBy,
      );
    },
    findRequest: (requestId) => {
      const row = findRequestStatement.get(requestId);
      return row === undefined ? null : toRequest(row);
    },
    listRequests: (folio) => listRequestsStatement.all(folio).map(toRequest),
    insertApproval: (approvalId, requestId, approval) => {
      const result = insertApprovalStatement.run(
        approvalId,
        requestId,
        approval.accountId,
        approval.on,
        approval.legalBasis,
      );
      return Number(result.changes) > 0;
    },
    listApprovals: (requestId) =>
      listApprovalsStatement.all(requestId).map((row) => ({
        accountId: readText(row, 'account_id'),
        on: readText(row, 'approved_on'),
        legalBasis: readText(row, 'legal_basis'),
      })),
  };
}
