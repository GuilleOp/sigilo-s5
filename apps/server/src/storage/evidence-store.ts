// Almacenamiento binario de las pruebas: en disco para el despliegue y en memoria para pruebas.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Guarda y recupera el contenido de las pruebas por su identificador. */
export interface EvidenceStore {
  write(evidenceId: string, bytes: Uint8Array): void;
  read(evidenceId: string): Uint8Array | null;
  remove(evidenceId: string): void;
}

const EVIDENCE_ID_PATTERN = /^[0-9a-f]{32}$/;

function assertEvidenceId(evidenceId: string): void {
  // Seguridad: el identificador forma parte de la ruta; solo se aceptan 32 hex para impedir recorridos.
  if (!EVIDENCE_ID_PATTERN.test(evidenceId)) throw new Error('Identificador de prueba inválido.');
}

/** Almacén en `directory`, un archivo por prueba con permisos 0600. */
export function createFileEvidenceStore(directory: string): EvidenceStore {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const pathFor = (evidenceId: string): string => {
    assertEvidenceId(evidenceId);
    return join(directory, evidenceId);
  };
  return {
    write: (evidenceId, bytes) => {
      writeFileSync(pathFor(evidenceId), bytes, { mode: 0o600, flag: 'wx' });
    },
    read: (evidenceId) => {
      try {
        return new Uint8Array(readFileSync(pathFor(evidenceId)));
      } catch {
        return null;
      }
    },
    remove: (evidenceId) => {
      rmSync(pathFor(evidenceId), { force: true });
    },
  };
}

/** Almacén en memoria, para pruebas. */
export function createMemoryEvidenceStore(): EvidenceStore {
  const files = new Map<string, Uint8Array>();
  return {
    write: (evidenceId, bytes) => {
      assertEvidenceId(evidenceId);
      files.set(evidenceId, bytes.slice());
    },
    read: (evidenceId) => files.get(evidenceId)?.slice() ?? null,
    remove: (evidenceId) => {
      files.delete(evidenceId);
    },
  };
}
