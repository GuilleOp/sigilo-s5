// Calificaciones de la falta (LGRA, art. 100) y recursos de inconformidad de la persona denunciante
// (arts. 102 a 110). Ambas tablas son de solo agregar: una recalificación es un registro nuevo.
import type { DatabaseSync } from 'node:sqlite';
import { readInteger, readText } from './database.ts';
import type { Row } from './database.ts';

/** Calificación guardada con su acuerdo en versión pública. */
export interface StoredQualification {
  position: number;
  authorityId: string;
  on: string;
  legalOn: string;
  severity: 'serious' | 'non_serious';
  legalBasis: string;
  agreement: string;
  agreementDigest: string;
  actorId: string;
}

/** Inconformidad presentada contra una calificación. */
export interface StoredAppeal {
  appealId: string;
  folio: string;
  filedOn: string;
  legalOn: string;
  reasons: string;
  openingId: string;
  qualificationPosition: number;
}

/** Operaciones sobre `qualifications` y `appeals`. */
export interface QualificationRepository {
  insertQualification(folio: string, item: Omit<StoredQualification, 'position'>): number;
  lastQualification(folio: string): StoredQualification | null;
  listQualifications(): (StoredQualification & { folio: string })[];
  insertAppeal(appeal: StoredAppeal): void;
  findAppeal(folio: string): StoredAppeal | null;
  /**
   * Guarda la siguiente secuencia del buzón de la autoridad al momento de un archivo o una
   * calificación: solo los mensajes con esa secuencia o mayor son posteriores al acto.
   */
  insertActInstant(
    folio: string,
    act: 'closure' | 'qualification',
    authoritySequence: number,
  ): void;
  /** Secuencia registrada en el último archivo o calificación del folio, o `null`. */
  lastActInstant(folio: string, act: 'closure' | 'qualification'): number | null;
  insertRelease(release: StoredRelease): void;
  listReleases(folio: string): StoredRelease[];
}

/** Entrega del sobre de identidad a una cuenta de la autoridad (H7). */
export interface StoredRelease {
  releaseId: string;
  folio: string;
  openingId: string;
  releasedOn: string;
  actorId: string;
}

function toQualification(row: Row): StoredQualification {
  return {
    position: readInteger(row, 'position'),
    authorityId: readText(row, 'authority_id'),
    on: readText(row, 'on_day'),
    legalOn: readText(row, 'legal_on'),
    severity: readText(row, 'severity') === 'serious' ? 'serious' : 'non_serious',
    legalBasis: readText(row, 'legal_basis'),
    agreement: readText(row, 'agreement'),
    agreementDigest: readText(row, 'agreement_digest'),
    actorId: readText(row, 'actor_id'),
  };
}

/** Crea el repositorio sobre `db`. */
export function createQualificationRepository(db: DatabaseSync): QualificationRepository {
  const insertQualification = db.prepare(
    `INSERT INTO qualifications (folio, position, authority_id, on_day, legal_on, severity,
       legal_basis, agreement, agreement_digest, actor_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const nextPosition = db.prepare(
    'SELECT COALESCE(MAX(position) + 1, 0) AS next FROM qualifications WHERE folio = ?',
  );
  const lastQualification = db.prepare(
    'SELECT * FROM qualifications WHERE folio = ? ORDER BY position DESC LIMIT 1',
  );
  const listQualifications = db.prepare(
    `SELECT q.* FROM qualifications AS q
     WHERE q.position = (SELECT MAX(position) FROM qualifications WHERE folio = q.folio)
     ORDER BY q.folio`,
  );
  const insertAppeal = db.prepare(
    `INSERT INTO appeals (appeal_id, folio, filed_on, legal_on, reasons, opening_id,
       qualification_position) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const findAppeal = db.prepare('SELECT * FROM appeals WHERE folio = ?');
  const insertInstant = db.prepare(
    'INSERT OR IGNORE INTO act_instants (folio, act, authority_sequence) VALUES (?, ?, ?)',
  );
  const lastInstant = db.prepare(
    'SELECT MAX(authority_sequence) AS seq FROM act_instants WHERE folio = ? AND act = ?',
  );
  const insertRelease = db.prepare(
    `INSERT INTO identity_releases (release_id, folio, opening_id, released_on, actor_id)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const listReleases = db.prepare(
    'SELECT * FROM identity_releases WHERE folio = ? ORDER BY released_on, release_id',
  );
  return {
    insertQualification: (folio, item) => {
      const row = nextPosition.get(folio);
      const position = row === undefined ? 0 : readInteger(row, 'next');
      insertQualification.run(
        folio,
        position,
        item.authorityId,
        item.on,
        item.legalOn,
        item.severity,
        item.legalBasis,
        item.agreement,
        item.agreementDigest,
        item.actorId,
      );
      return position;
    },
    lastQualification: (folio) => {
      const row = lastQualification.get(folio);
      return row === undefined ? null : toQualification(row);
    },
    listQualifications: () =>
      listQualifications
        .all()
        .map((row) => ({ ...toQualification(row), folio: readText(row, 'folio') })),
    insertAppeal: (appeal) => {
      insertAppeal.run(
        appeal.appealId,
        appeal.folio,
        appeal.filedOn,
        appeal.legalOn,
        appeal.reasons,
        appeal.openingId,
        appeal.qualificationPosition,
      );
    },
    insertActInstant: (folio, act, authoritySequence) => {
      insertInstant.run(folio, act, authoritySequence);
    },
    lastActInstant: (folio, act) => {
      const row = lastInstant.get(folio, act);
      const value = row?.['seq'];
      return typeof value === 'number' || typeof value === 'bigint' ? Number(value) : null;
    },
    insertRelease: (release) => {
      insertRelease.run(
        release.releaseId,
        release.folio,
        release.openingId,
        release.releasedOn,
        release.actorId,
      );
    },
    listReleases: (folio) =>
      listReleases.all(folio).map((row) => ({
        releaseId: readText(row, 'release_id'),
        folio: readText(row, 'folio'),
        openingId: readText(row, 'opening_id'),
        releasedOn: readText(row, 'released_on'),
        actorId: readText(row, 'actor_id'),
      })),
    findAppeal: (folio) => {
      const row = findAppeal.get(folio);
      if (row === undefined) return null;
      return {
        appealId: readText(row, 'appeal_id'),
        folio: readText(row, 'folio'),
        filedOn: readText(row, 'filed_on'),
        legalOn: readText(row, 'legal_on'),
        reasons: readText(row, 'reasons'),
        openingId: readText(row, 'opening_id'),
        qualificationPosition: readInteger(row, 'qualification_position'),
      };
    },
  };
}
