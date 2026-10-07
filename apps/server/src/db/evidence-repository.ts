// Repositorio de pruebas: registro de cada imagen subida y su asociación a una denuncia.
import type { DatabaseSync } from 'node:sqlite';
import { EvidenceMediaTypeSchema } from '@sigilo/contracts';
import type { EvidenceDescriptor } from '@sigilo/contracts';
import { readInteger, readOptionalText, readText } from './database.ts';
import type { Row } from './database.ts';

/** Registro de una prueba; `folio` es nulo mientras está pendiente. */
export interface EvidenceRecord extends EvidenceDescriptor {
  folio: string | null;
}

/** Prueba guardada de una denuncia sin atender, candidata a la retención o al desalojo. */
export interface UnattendedEvidence {
  evidenceId: string;
  sizeBytes: number;
}

/** Operaciones sobre la tabla `evidence`. */
export interface EvidenceRepository {
  insertPending(descriptor: EvidenceDescriptor, uploadedOn: string): void;
  find(evidenceId: string): EvidenceRecord | null;
  /** Asocia una prueba pendiente; devuelve `false` si ya no estaba pendiente. */
  associate(evidenceId: string, folio: string, position: number): boolean;
  listByFolio(folio: string): EvidenceDescriptor[];
  /** Identificadores de pruebas pendientes subidas antes del día `beforeDay` (`AAAA-MM-DD`). */
  listPendingBefore(beforeDay: string): string[];
  /** Borra una prueba solo si sigue pendiente; devuelve `true` si la borró. */
  deletePending(evidenceId: string): boolean;
  /** Bytes de todas las pruebas cuyo archivo sigue guardado (pendientes o asociadas). */
  totalStoredBytes(): number;
  /** Bytes de las pruebas pendientes (sin denuncia) guardadas. */
  pendingStoredBytes(): number;
  /**
   * Pruebas guardadas de denuncias que siguen en `received` (la autoridad no las ha atendido),
   * de las recibidas antes primero; con `beforeDay`, solo de las recibidas antes de ese día.
   */
  listUnattendedStored(beforeDay: string | null, limit: number): UnattendedEvidence[];
  /** Marca que el archivo de la prueba se borró por la retención o el desalojo. */
  markUnstored(evidenceId: string): void;
}

function toDescriptor(row: Row): EvidenceDescriptor {
  return {
    evidenceId: readText(row, 'evidence_id'),
    mediaType: EvidenceMediaTypeSchema.parse(readText(row, 'media_type')),
    sha256: readText(row, 'sha256'),
    sizeBytes: readInteger(row, 'size_bytes'),
  };
}

/** Crea el repositorio de pruebas sobre `db`. */
export function createEvidenceRepository(db: DatabaseSync): EvidenceRepository {
  const insertStatement = db.prepare(
    `INSERT INTO evidence (evidence_id, media_type, sha256, size_bytes, uploaded_on)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const findStatement = db.prepare('SELECT * FROM evidence WHERE evidence_id = ?');
  const associateStatement = db.prepare(
    'UPDATE evidence SET folio = ?, position = ? WHERE evidence_id = ? AND folio IS NULL',
  );
  const listStatement = db.prepare('SELECT * FROM evidence WHERE folio = ? ORDER BY position');
  const pendingStatement = db.prepare(
    'SELECT evidence_id FROM evidence WHERE folio IS NULL AND uploaded_on < ?',
  );
  const deleteStatement = db.prepare(
    'DELETE FROM evidence WHERE evidence_id = ? AND folio IS NULL',
  );
  const totalStatement = db.prepare(
    'SELECT COALESCE(SUM(size_bytes), 0) AS total FROM evidence WHERE is_stored = 1',
  );
  const pendingTotalStatement = db.prepare(
    `SELECT COALESCE(SUM(size_bytes), 0) AS total FROM evidence
     WHERE folio IS NULL AND is_stored = 1`,
  );
  // Dentro de un mismo día se ordena por folio (aleatorio), nunca por llegada.
  const unattendedStatement = db.prepare(
    `SELECT evidence.evidence_id, evidence.size_bytes FROM evidence
     JOIN complaints ON complaints.folio = evidence.folio
     WHERE evidence.is_stored = 1 AND complaints.status = 'received'
       AND complaints.received_on < ?
     ORDER BY complaints.received_on, complaints.folio, evidence.position
     LIMIT ?`,
  );
  const unstoreStatement = db.prepare('UPDATE evidence SET is_stored = 0 WHERE evidence_id = ?');

  return {
    insertPending: (descriptor, uploadedOn) => {
      insertStatement.run(
        descriptor.evidenceId,
        descriptor.mediaType,
        descriptor.sha256,
        descriptor.sizeBytes,
        uploadedOn,
      );
    },
    find: (evidenceId) => {
      const row = findStatement.get(evidenceId);
      if (row === undefined) return null;
      return { ...toDescriptor(row), folio: readOptionalText(row, 'folio') };
    },
    associate: (evidenceId, folio, position) =>
      Number(associateStatement.run(folio, position, evidenceId).changes) === 1,
    listByFolio: (folio) => listStatement.all(folio).map(toDescriptor),
    listPendingBefore: (beforeDay) =>
      pendingStatement.all(beforeDay).map((row) => readText(row, 'evidence_id')),
    deletePending: (evidenceId) => Number(deleteStatement.run(evidenceId).changes) === 1,
    totalStoredBytes: () => {
      const row = totalStatement.get();
      return row === undefined ? 0 : readInteger(row, 'total');
    },
    pendingStoredBytes: () => {
      const row = pendingTotalStatement.get();
      return row === undefined ? 0 : readInteger(row, 'total');
    },
    listUnattendedStored: (beforeDay, limit) =>
      // '~' es mayor que cualquier fecha AAAA-MM-DD: sin `beforeDay` entran todas.
      unattendedStatement.all(beforeDay ?? '~', limit).map((row) => ({
        evidenceId: readText(row, 'evidence_id'),
        sizeBytes: readInteger(row, 'size_bytes'),
      })),
    markUnstored: (evidenceId) => {
      unstoreStatement.run(evidenceId);
    },
  };
}
