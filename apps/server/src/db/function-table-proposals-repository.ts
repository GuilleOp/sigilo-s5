// Versiones de la tabla de funciones firmadas desde el panel de la operación
// (`function_table_proposals`): solo se agregan; la más reciente es la que se entrega a la SESNA.
import type { DatabaseSync } from 'node:sqlite';
import { FunctionTableChangeSchema, SignedFunctionTableSchema } from '@sigilo/contracts';
import type { CompetenceProposal } from '@sigilo/contracts';
import { z } from 'zod';
import { readInteger, readText } from './database.ts';
import type { Row } from './database.ts';

/** Operaciones sobre `function_table_proposals`. */
export interface FunctionTableProposalsRepository {
  insert(proposal: CompetenceProposal, proposalId: string, createdAt: string): void;
  /** Las más recientes primero (hasta `limit`). */
  list(limit: number): CompetenceProposal[];
}

const ChangesSchema = z.array(FunctionTableChangeSchema);

function toProposal(row: Row): CompetenceProposal {
  return {
    version: readInteger(row, 'version'),
    signedOn: readText(row, 'signed_on'),
    signedBy: readText(row, 'signed_by'),
    changes: ChangesSchema.parse(JSON.parse(readText(row, 'changes_json'))),
    signedTable: SignedFunctionTableSchema.parse(JSON.parse(readText(row, 'signed_table'))),
  };
}

/** Crea el repositorio sobre `db`. */
export function createFunctionTableProposalsRepository(
  db: DatabaseSync,
): FunctionTableProposalsRepository {
  const insertStatement = db.prepare(
    `INSERT INTO function_table_proposals
       (proposal_id, version, signed_on, signed_by, signed_table, changes_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const listStatement = db.prepare(
    'SELECT * FROM function_table_proposals ORDER BY created_at DESC, proposal_id DESC LIMIT ?',
  );
  return {
    insert(proposal, proposalId, createdAt) {
      insertStatement.run(
        proposalId,
        proposal.version,
        proposal.signedOn,
        proposal.signedBy,
        JSON.stringify(proposal.signedTable),
        JSON.stringify(proposal.changes),
        createdAt,
      );
    },
    list(limit) {
      return listStatement.all(limit).map(toProposal);
    },
  };
}
