// La competencia por dependencia como hoja de cálculo, la misma en el panel de la operación y en
// `sigilo tabla` (`config/competencia-por-dependencia.csv`). Columnas:
//   ente               clave del ente (PDN-<entidad>-<id> o ficticio de la demostración)
//   nombre             nombre del ente (solo para leer; al importar no cuenta)
//   estado             asignado, sin_oic o pendiente
//   quien              authority.<id> o institucion:<nombre oficial>; vacío si está pendiente
//   fundamento         obligatorio en sin_oic
//   solo_identificada  «si» si quien atiende solo admite denuncias con nombre y firma
import { EntityAssignmentSchema } from '@sigilo/contracts';
import type { EntityAssignment, FunctionHolder } from '@sigilo/contracts';

/** Encabezado del CSV de competencia por dependencia. */
export const COMPETENCE_CSV_HEADER = [
  'ente',
  'nombre',
  'estado',
  'quien',
  'fundamento',
  'solo_identificada',
] as const;

const STATUS_NAMES: Readonly<Record<EntityAssignment['status'], string>> = {
  assigned: 'asignado',
  without_oic: 'sin_oic',
  pending: 'pendiente',
};

/** Separa un CSV (RFC 4180: comillas dobles, comas y saltos dentro de comillas). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const source = text.replace(/^\uFEFF/u, '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inQuotes) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

/**
 * Celda de CSV con comillas si hace falta. Seguridad: una celda que empieza con `=`, `+`, `-` o `@`
 * lleva un apóstrofo para que la hoja de cálculo no la ejecute como fórmula.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@]/u.test(value) ? `'${value}` : value;
  return /[",\n\r]/u.test(safe) ? `"${safe.replace(/"/gu, '""')}"` : safe;
}

/** `authority.<id>`, `observer.<id>` o `institucion:<nombre>`. */
export function holderToCsv(holder: FunctionHolder): string {
  if (holder.kind === 'authority') return holder.authorityId;
  if (holder.kind === 'observer') return holder.observerId;
  return `institucion:${holder.name}`;
}

/** Lee `quien`; `null` si no es de ninguna de las tres formas. */
export function holderFromCsv(text: string): FunctionHolder | null {
  const value = text.trim();
  if (value.startsWith('authority.')) return { kind: 'authority', authorityId: value };
  if (value.startsWith('observer.')) return { kind: 'observer', observerId: value };
  const match = /^instituci[oó]n:\s*(.+)$/iu.exec(value);
  return match?.[1] === undefined ? null : { kind: 'institution', name: match[1].trim() };
}

/** Escribe la competencia por dependencia como CSV (con el nombre de cada ente para leerla). */
export function entitiesToCsv(
  entities: readonly EntityAssignment[],
  entityName: (entityId: string) => string = () => '',
): string {
  const lines = [COMPETENCE_CSV_HEADER.join(',')];
  for (const item of entities) {
    lines.push(
      [
        item.entityId,
        entityName(item.entityId),
        STATUS_NAMES[item.status],
        item.holder === undefined ? '' : holderToCsv(item.holder),
        item.legalBasis ?? '',
        item.requiresIdentifiedReporter === true ? 'si' : '',
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

/** Lee la competencia por dependencia. Devuelve los entes (o `null`) y los problemas con su línea. */
export function csvToEntities(text: string): {
  entities: EntityAssignment[] | null;
  problems: string[];
} {
  const rows = parseCsv(text);
  const first = rows[0]?.map((cell) => cell.trim().toLowerCase());
  if (first === undefined || COMPETENCE_CSV_HEADER.some((name, index) => first[index] !== name)) {
    return {
      entities: null,
      problems: [`La primera línea debe ser: ${COMPETENCE_CSV_HEADER.join(',')}`],
    };
  }
  const problems: string[] = [];
  const entities: EntityAssignment[] = [];
  const seen = new Set<string>();
  rows.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const [entityId = '', , statusName = '', who = '', basis = '', identified = ''] = cells.map(
      (cell) => cell.trim(),
    );
    const status = (Object.keys(STATUS_NAMES) as EntityAssignment['status'][]).find(
      (key) => STATUS_NAMES[key] === statusName.toLowerCase(),
    );
    if (status === undefined) {
      problems.push(`Línea ${line}: el estado debe ser asignado, sin_oic o pendiente.`);
      return;
    }
    if (seen.has(entityId)) {
      problems.push(`Línea ${line}: el ente ${entityId} ya está en otra línea.`);
      return;
    }
    seen.add(entityId);
    const holder = who === '' ? undefined : holderFromCsv(who);
    if (holder === null) {
      problems.push(`Línea ${line}: «quien» debe ser authority.… o institucion:…`);
      return;
    }
    const parsed = EntityAssignmentSchema.safeParse({
      entityId,
      status,
      ...(holder === undefined ? {} : { holder }),
      ...(basis === '' ? {} : { legalBasis: basis }),
      ...(['si', 'sí'].includes(identified.toLowerCase())
        ? { requiresIdentifiedReporter: true }
        : {}),
    });
    if (!parsed.success) {
      problems.push(
        `Línea ${line}: ${parsed.error.issues.map((issue) => issue.message).join(' ')}`,
      );
      return;
    }
    entities.push(parsed.data);
  });
  return problems.length > 0 ? { entities: null, problems } : { entities, problems };
}
