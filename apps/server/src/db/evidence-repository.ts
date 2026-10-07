// Repositorio de pruebas: registro de cada imagen subida, su asociación a una denuncia y los
// descartes de la autoridad.
import type { DatabaseSync } from 'node:sqlite';
import { EvidenceMediaTypeSchema } from '@sigilo/contracts';
import type { EvidenceDescriptor, EvidenceDiscardEntry } from '@sigilo/contracts';
import { readInteger, readOptionalText, readText } from './database.ts';
import type { Row } from './database.ts';

/** Registro de una prueba; `folio` es nulo mientras está pendiente. */
export interface EvidenceRecord extends EvidenceDescriptor {
  folio: string | null;
}

/** Prueba guardada de una denuncia sin atender o archivada, candidata a la retención. */
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
   * Pruebas guardadas de denuncias en `received` (la autoridad no las ha atendido) o `archived`
   * que se recibieron antes de `beforeDay`, de las recibidas antes primero.
   */
  listUnattendedStored(beforeDay: string, limit: number): UnattendedEvidence[];
  /** Indica si la denuncia tiene alguna prueba cuyo archivo sigue guardado. */
  hasStoredForFolio(folio: string): boolean;
  /** Identificadores de las pruebas de la denuncia cuyo archivo sigue guardado. */
  listStoredIdsForFolio(folio: string): string[];
  /** Marca que el archivo de la prueba se borró (por la retención o por un descarte). */
  markUnstored(evidenceId: string): void;
  /** Registra un descarte de `count` pruebas de la denuncia el día `discardedOn`. */
  insertDiscard(folio: string, discardedOn: string, count: number): void;
  /** Descartes de la denuncia en el orden en que ocurrieron. */
  listDiscardsByFolio(folio: string): EvidenceDiscardEntry[];
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
     WHERE evidence.is_stored = 1 AND complaints.status IN ('received', 'archived')
       AND complaints.received_on < ?
     ORDER BY complaints.received_on, complaints.folio, evidence.position
     LIMIT ?`,
  );
  const unstoreStatement = db.prepare('UPDATE evidence SET is_stored = 0 WHERE evidence_id = ?');
  const storedForFolioStatement = db.prepare(
    'SELECT 1 AS found FROM evidence WHERE folio = ? AND is_stored = 1 LIMIT 1',
  );
  const storedIdsForFolioStatement = db.prepare(
    'SELECT evidence_id FROM evidence WHERE folio = ? AND is_stored = 1 ORDER BY position',
  );
  const insertDiscardStatement = db.prepare(
    `INSERT INTO evidence_discards (folio, position, discarded_on, evidence_count)
     VALUES (?, (SELECT COALESCE(MAX(position) + 1, 0) FROM evidence_discards WHERE folio = ?),
       ?, ?)`,
  );
  const listDiscardsStatement = db.prepare(
    'SELECT * FROM evidence_discards WHERE folio = ? ORDER BY position',
  );

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
      unattendedStatement.all(beforeDay, limit).map((row) => ({
        evidenceId: readText(row, 'evidence_id'),
        sizeBytes: readInteger(row, 'size_bytes'),
      })),
    hasStoredForFolio: (folio) => storedForFolioStatement.get(folio) !== undefined,
    listStoredIdsForFolio: (folio) =>
      storedIdsForFolioStatement.all(folio).map((row) => readText(row, 'evidence_id')),
    markUnstored: (evidenceId) => {
      unstoreStatement.run(evidenceId);
    },
    insertDiscard: (folio, discardedOn, count) => {
      insertDiscardStatement.run(folio, folio, discardedOn, count);
    },
    listDiscardsByFolio: (folio) =>
      listDiscardsStatement.all(folio).map((row) => ({
        on: readText(row, 'discarded_on'),
        count: readInteger(row, 'evidence_count'),
      })),
  };
}
