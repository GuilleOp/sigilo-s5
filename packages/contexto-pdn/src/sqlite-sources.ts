// Fuentes S3 y S6 leídas de las salidas privadas de datos/proceso (SQLite), en solo lectura.
// Seguridad: solo para el nodo de la autoridad; las bases viven fuera del repositorio y no se copian.

import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { institutionRefKey, SANCTION_LABELS } from './names.ts';
import type {
  ContractRecord,
  ContractsSource,
  ProcurementMethod,
  SanctionRecord,
  SanctionsSource,
  Supplier,
} from './types.ts';

/** Rutas de las bases privadas. Una ruta ausente o inexistente desactiva esa fuente. */
export interface SqliteSourcesOptions {
  /** Ruta de `s3.sqlite`. */
  s3Path?: string;
  /** Ruta de `s6_apf.sqlite`. */
  s6Path?: string;
  /** Fecha de los datos de S6 (AAAA-MM). Por omisión, enero de 2023 (fin de la descarga de la APF). */
  s6DataAsOf?: string;
  /** Fecha de los datos de S3 si la base no la trae en `metadatos`. */
  s3DataAsOf?: string;
}

/** Fuentes abiertas y las que quedaron desactivadas, con el motivo. */
export interface SqliteSources {
  s3: SanctionsSource | null;
  s6: ContractsSource | null;
  disabled: readonly { system: 'S3S' | 'S6'; reason: string }[];
  close(): void;
}

type Row = Record<string, unknown>;

function text(row: Row, column: string): string {
  const value = row[column];
  return typeof value === 'string'
    ? value
    : value === null || value === undefined
      ? ''
      : String(value);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseJsonArray(value: unknown): unknown[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const METHODS: readonly ProcurementMethod[] = ['direct', 'limited', 'open', 'selective'];

/** Misma canonización de `ocid` que datos/proceso/pdn/s6.py (`canonical_ocid`). */
export function canonicalOcid(ocid: string): string {
  const trimmed = ocid.trim();
  return trimmed.startsWith('-') ? `ocds-07smqs${trimmed}` : trimmed;
}

function openS3(
  path: string,
  dataAsOf: string | undefined,
): { source: SanctionsSource; database: DatabaseSync } {
  const database = new DatabaseSync(path, { readOnly: true });
  const meta = database
    .prepare("SELECT valor FROM metadatos WHERE clave = 'fecha_referencia'")
    .get() as Row | undefined;
  const states = (
    database.prepare('SELECT DISTINCT entidad FROM s3_servidores').all() as Row[]
  ).map((row) => text(row, 'entidad'));
  const institutions = (
    database
      .prepare("SELECT DISTINCT ente_clave FROM s3_servidores WHERE ente_clave <> ''")
      .all() as Row[]
  ).map((row) => text(row, 'ente_clave'));
  const byFile = database.prepare(
    `SELECT id, entidad, expediente, nombres, primer_apellido, segundo_apellido, ente, ente_clave,
            sanciones, fecha_resolucion, autoridad_resolutora
       FROM s3_servidores WHERE expediente = ? AND entidad = ?`,
  );
  const source: SanctionsSource = {
    info: {
      id: 's3.pdn',
      system: 'S3S',
      label: 'S3 de la PDN',
      dataAsOf: (meta === undefined ? '' : text(meta, 'valor')) || dataAsOf || 'sin fecha',
      isSynthetic: false,
    },
    scope: { stateCodes: states, institutionKeys: institutions },
    // Los números de expediente se repiten entre entidades: siempre se filtra por la entidad.
    findByFileNumber: (fileNumber, stateCode) =>
      (byFile.all(fileNumber.trim(), stateCode) as Row[]).map((row): SanctionRecord => {
        const sanctions = parseJsonArray(row['sanciones']).filter(
          (item): item is string => typeof item === 'string',
        );
        return {
          recordId: text(row, 'id'),
          fileNumber: text(row, 'expediente'),
          fullName: [
            text(row, 'nombres'),
            text(row, 'primer_apellido'),
            text(row, 'segundo_apellido'),
          ]
            .filter(Boolean)
            .join(' '),
          institution: text(row, 'ente'),
          ...(text(row, 'ente_clave') === '' ? {} : { institutionKey: text(row, 'ente_clave') }),
          stateCode: text(row, 'entidad'),
          sanctions,
          sanctionText: sanctions
            .map((kind) => SANCTION_LABELS[kind] ?? kind.toLowerCase())
            .join(', '),
          resolutionDate: text(row, 'fecha_resolucion') || null,
          authority: text(row, 'autoridad_resolutora'),
        };
      }),
  };
  return { source, database };
}

function openS6(
  path: string,
  dataAsOf: string,
): { source: ContractsSource; database: DatabaseSync } {
  const database = new DatabaseSync(path, { readOnly: true });
  const range = database
    .prepare('SELECT MIN(fecha_inicio) AS desde, MAX(fecha_inicio) AS hasta FROM releases')
    .get() as Row | undefined;
  const buyers = (database.prepare('SELECT DISTINCT comprador FROM releases').all() as Row[]).map(
    (row) => institutionRefKey(text(row, 'comprador'), '00'),
  );
  const byOcid = database.prepare(
    'SELECT * FROM releases WHERE ocid = ? OR ocid_original = ? LIMIT 1',
  );
  const from = range === undefined ? '' : text(range, 'desde');
  const to = range === undefined ? '' : text(range, 'hasta');
  const source: ContractsSource = {
    info: { id: 's6.apf', system: 'S6', label: 'S6 federal', dataAsOf, isSynthetic: false },
    scope: {
      stateCodes: ['00'],
      institutionKeys: [...new Set(buyers)],
      ...(from === '' ? {} : { periodFrom: from }),
      ...(to === '' ? {} : { periodTo: to }),
    },
    findContract: ({ ocid }) => {
      if (ocid === undefined || ocid.trim() === '') return null;
      const row = byOcid.get(canonicalOcid(ocid), ocid.trim()) as Row | undefined;
      if (row === undefined) return null;
      const method = METHODS.find((item) => item === row['metodo']) ?? null;
      const awards = parseJsonArray(row['adjudicaciones'])
        .filter(isRecord)
        .map((award) => ({
          id: typeof award['id'] === 'string' && award['id'] !== '' ? award['id'] : null,
          suppliers: (Array.isArray(award['proveedores']) ? award['proveedores'] : [])
            .filter(isRecord)
            .map((supplier): Supplier => ({
              id:
                typeof supplier['id'] === 'string' && supplier['id'] !== '' ? supplier['id'] : null,
              name: typeof supplier['nombre'] === 'string' ? supplier['nombre'] : '',
            })),
          amount: numberOrNull(award['monto']),
          currency: typeof award['moneda'] === 'string' ? award['moneda'] : 'MXN',
        }));
      const record: ContractRecord = {
        ocid: text(row, 'ocid'),
        contractIds: [],
        buyer: { id: text(row, 'comprador_id') || null, name: text(row, 'comprador') },
        method,
        methodDetails: null,
        rationale: text(row, 'fundamento') || null,
        tenderers: numberOrNull(row['licitantes']),
        awards,
        date: text(row, 'fecha_inicio') || null,
      };
      return record;
    },
  };
  return { source, database };
}

/**
 * Abre las bases privadas en solo lectura. Si una ruta no se indica o no existe, esa fuente queda
 * desactivada (`null`) y se informa en `disabled`; nunca se crea una base vacía.
 */
export function openSqliteSources(options: SqliteSourcesOptions): SqliteSources {
  const disabled: { system: 'S3S' | 'S6'; reason: string }[] = [];
  const databases: DatabaseSync[] = [];
  let s3: SanctionsSource | null = null;
  let s6: ContractsSource | null = null;
  if (options.s3Path === undefined || !existsSync(options.s3Path)) {
    disabled.push({ system: 'S3S', reason: 'No se indicó la base de S3 o la ruta no existe.' });
  } else {
    const opened = openS3(options.s3Path, options.s3DataAsOf);
    s3 = opened.source;
    databases.push(opened.database);
  }
  if (options.s6Path === undefined || !existsSync(options.s6Path)) {
    disabled.push({ system: 'S6', reason: 'No se indicó la base de S6 o la ruta no existe.' });
  } else {
    const opened = openS6(options.s6Path, options.s6DataAsOf ?? '2023-01');
    s6 = opened.source;
    databases.push(opened.database);
  }
  return {
    s3,
    s6,
    disabled,
    close: () => {
      for (const database of databases) database.close();
    },
  };
}
