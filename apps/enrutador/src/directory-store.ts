// Directorio vigente del enrutador: lo verifica al arrancar contra la raíz fijada o contra la
// versión anterior guardada, lo guarda y registra cada versión nueva en la bitácora nacional.
import type { DatabaseSync } from 'node:sqlite';
import { SignedAuthorityDirectorySchema } from '@sigilo/contracts';
import type {
  AuthorityDirectory,
  NetworkTrustAnchor,
  SignedAuthorityDirectory,
} from '@sigilo/contracts';
import {
  trustAnchorFromDirectory,
  verifyDirectoryUpdate,
  verifySignedDirectory,
} from '@sigilo/red';
import { readText, withTransaction } from './database.ts';
import type { NationalLedgerService } from './national-ledger-service.ts';

/** Directorio vigente y la raíz de confianza que define (para las cofirmas). */
export interface DirectoryStore {
  signed(): SignedAuthorityDirectory;
  directory(): AuthorityDirectory;
  trust(): NetworkTrustAnchor;
}

function latestStored(db: DatabaseSync): SignedAuthorityDirectory | null {
  const row = db
    .prepare('SELECT document FROM directory_versions ORDER BY serial DESC LIMIT 1')
    .get();
  return row === undefined
    ? null
    : SignedAuthorityDirectorySchema.parse(JSON.parse(readText(row, 'document')));
}

/**
 * Carga el directorio: sin versiones guardadas, lo verifica con la raíz fijada; con versiones,
 * exige que sea la misma o exactamente la siguiente, cofirmada por los testigos de la anterior.
 * Lanza error (y el enrutador no arranca) si no se verifica o si retrocede.
 * Seguridad: un directorio con una llave sustituida sin m cofirmas nunca llega a servirse.
 */
export function loadDirectoryStore(
  db: DatabaseSync,
  candidate: SignedAuthorityDirectory,
  pinnedTrust: NetworkTrustAnchor,
  national: NationalLedgerService,
  today: string,
): DirectoryStore {
  const previous = latestStored(db);
  let current: SignedAuthorityDirectory;
  if (previous !== null && candidate.directory.serial <= previous.directory.serial) {
    if (candidate.directory.serial < previous.directory.serial) {
      throw new Error('El directorio retrocede respecto de la versión guardada.');
    }
    if (candidate.digest !== previous.digest) {
      throw new Error('El directorio tiene el mismo número de versión con otro contenido.');
    }
    current = previous;
  } else {
    const result =
      previous === null
        ? verifySignedDirectory(candidate, pinnedTrust)
        : verifyDirectoryUpdate(previous, candidate);
    if (!result.valid) {
      throw new Error(`El directorio no se pudo verificar (${result.reason}).`);
    }
    withTransaction(db, () => {
      db.prepare('INSERT INTO directory_versions (serial, digest, document) VALUES (?, ?, ?)').run(
        candidate.directory.serial,
        candidate.digest,
        JSON.stringify(candidate),
      );
      national.appendDirectoryVersion(candidate, today);
    });
    current = candidate;
  }
  const trust = trustAnchorFromDirectory(current.directory);
  return { signed: () => current, directory: () => current.directory, trust: () => trust };
}
