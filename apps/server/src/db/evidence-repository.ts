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

/** Operaciones sobre la tabla `evidence`. */
export interface EvidenceRepository {
  insertPending(descriptor: EvidenceDescriptor, uploadedOn: string): void;
  find(evidenceId: string): EvidenceRecord | null;
  /** Asocia una prueba pendiente; devuelve `false` si ya no estaba pendiente. */
  associate(evidenceId: string, folio: string, position: number): boolean;
  listByFolio(folio: string): EvidenceDescriptor[];
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
  };
}
