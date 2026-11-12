// La tabla de funciones como hoja de cálculo (`config/tabla-de-funciones.csv`), para editarla en
// Excel o LibreOffice. Columnas: funcion, orden, ente, gravedad, quien, fundamento.
//   funcion     buzon, operacion, investigacion, substanciacion, resolucion, supervision, penal,
//               observador
//   orden       federal, estatal o municipal; varios separados por «;»
//   ente        claves de ente separadas por «;» (vacío: todos los del orden)
//   gravedad    vacío, grave o no_grave
//   quien       authority.<id>, observer.<id> o institucion:<nombre oficial>
//   fundamento  opcional, en lenguaje claro
import { FunctionTableSchema, NODE_FUNCTIONS } from '@sigilo/contracts';
import type { FunctionHolder, FunctionRule, FunctionTable, NodeFunction } from '@sigilo/contracts';

const FUNCTION_NAMES: Readonly<Record<NodeFunction, string>> = {
  intake: 'buzon',
  operation: 'operacion',
  investigation: 'investigacion',
  substantiation: 'substanciacion',
  resolution: 'resolucion',
  supervision: 'supervision',
  prosecution: 'penal',
  observer: 'observador',
};

const HEADER = ['funcion', 'orden', 'ente', 'gravedad', 'quien', 'fundamento'];

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

function csvCell(value: string): string {
  return /[",\n\r]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value;
}

function holderText(holder: FunctionHolder): string {
  if (holder.kind === 'authority') return holder.authorityId;
  if (holder.kind === 'observer') return holder.observerId;
  return `institucion:${holder.name}`;
}

/** Escribe la tabla como CSV. */
export function tableToCsv(table: FunctionTable): string {
  const lines = [HEADER.join(',')];
  for (const fn of NODE_FUNCTIONS) {
    for (const rule of table.functions[fn]) {
      lines.push(
        [
          FUNCTION_NAMES[fn],
          rule.governmentLevels.join(';'),
          rule.entityIds.join(';'),
          rule.severity === undefined ? '' : rule.severity === 'serious' ? 'grave' : 'no_grave',
          holderText(rule.holder),
          rule.legalBasis ?? '',
        ]
          .map(csvCell)
          .join(','),
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

/** Datos de la tabla que no vienen en el CSV. */
export interface TableHeader {
  nodeId: string;
  stateCode: string | null;
  version: number;
  issuedOn: string;
}

function parseHolder(text: string): FunctionHolder | null {
  const value = text.trim();
  if (value.startsWith('authority.')) return { kind: 'authority', authorityId: value };
  if (value.startsWith('observer.')) return { kind: 'observer', observerId: value };
  const match = /^instituci[oó]n:\s*(.+)$/iu.exec(value);
  return match?.[1] === undefined ? null : { kind: 'institution', name: match[1].trim() };
}

/**
 * Lee la tabla desde el CSV. Devuelve la tabla (o `null`) y los problemas, cada uno con su línea.
 */
export function csvToTable(
  text: string,
  header: TableHeader,
): { table: FunctionTable | null; problems: string[] } {
  const rows = parseCsv(text);
  const problems: string[] = [];
  const first = rows[0]?.map((cell) => cell.trim().toLowerCase());
  if (first === undefined || HEADER.some((name, index) => first[index] !== name)) {
    return { table: null, problems: [`La primera línea debe ser: ${HEADER.join(',')}`] };
  }
  const functions = Object.fromEntries(
    NODE_FUNCTIONS.map((fn) => [fn, [] as FunctionRule[]]),
  ) as Record<NodeFunction, FunctionRule[]>;
  rows.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const [fnName = '', levels = '', entities = '', severity = '', who = '', basis = ''] = cells;
    const fn = NODE_FUNCTIONS.find(
      (candidate) => FUNCTION_NAMES[candidate] === fnName.trim().toLowerCase(),
    );
    if (fn === undefined) {
      problems.push(`Línea ${line}: función «${fnName}» desconocida.`);
      return;
    }
    const holder = parseHolder(who);
    if (holder === null) {
      problems.push(`Línea ${line}: «quien» debe ser authority.…, observer.… o institucion:…`);
      return;
    }
    const severityValue = severity.trim().toLowerCase();
    if (!['', 'grave', 'no_grave'].includes(severityValue)) {
      problems.push(`Línea ${line}: la gravedad debe quedar vacía o ser grave o no_grave.`);
      return;
    }
    const split = (value: string): string[] =>
      value
        .split(';')
        .map((item) => item.trim())
        .filter((item) => item !== '');
    functions[fn].push({
      governmentLevels: split(levels) as FunctionRule['governmentLevels'],
      entityIds: split(entities),
      ...(severityValue === ''
        ? {}
        : { severity: severityValue === 'grave' ? 'serious' : 'non_serious' }),
      holder,
      ...(basis.trim() === '' ? {} : { legalBasis: basis.trim() }),
    });
  });
  if (problems.length > 0) return { table: null, problems };
  const parsed = FunctionTableSchema.safeParse({ format: 1, ...header, functions });
  if (!parsed.success) {
    return {
      table: null,
      problems: parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || 'tabla'}: ${issue.message}`,
      ),
    };
  }
  return { table: parsed.data, problems: [] };
}
