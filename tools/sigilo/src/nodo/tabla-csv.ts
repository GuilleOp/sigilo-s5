// La tabla de funciones como hoja de cálculo (`config/tabla-de-funciones.csv`), para editarla en
// Excel o LibreOffice. Columnas: funcion, orden, ente, gravedad, quien, fundamento y, desde el
// formato 2, instancia y solo_identificada (opcionales).
//   funcion            buzon, operacion, investigacion, substanciacion, resolucion, tribunal,
//                      supervision, penal, observador
//   orden              federal, estatal o municipal; varios separados por «;»
//   ente               claves de ente separadas por «;» (vacío: todos los del orden)
//   gravedad           vacío, grave o no_grave
//   quien              authority.<id>, observer.<id> o institucion:<nombre oficial>
//   fundamento         opcional, en lenguaje claro
//   instancia          solo en tribunal: vacío, primera o alzada
//   solo_identificada  «si» si quien cumple la función solo admite denuncias con nombre y firma
// El órgano interno de control de cada dependencia va aparte, en
// `config/competencia-por-dependencia.csv` (ver `@sigilo/red`, competence-csv.ts).
import { FunctionTableSchema, functionRulesOf, NODE_FUNCTIONS } from '@sigilo/contracts';
import type {
  EntityAssignment,
  FunctionRule,
  FunctionTable,
  FunctionTableSettings,
  NodeFunction,
} from '@sigilo/contracts';
import { holderFromCsv, holderToCsv, parseCsv } from '@sigilo/red';

export { parseCsv } from '@sigilo/red';

const FUNCTION_NAMES: Readonly<Record<NodeFunction, string>> = {
  intake: 'buzon',
  operation: 'operacion',
  investigation: 'investigacion',
  substantiation: 'substanciacion',
  resolution: 'resolucion',
  court: 'tribunal',
  supervision: 'supervision',
  prosecution: 'penal',
  observer: 'observador',
};

const HEADER = ['funcion', 'orden', 'ente', 'gravedad', 'quien', 'fundamento'];
const FORMAT2_COLUMNS = ['instancia', 'solo_identificada'];

function csvCell(value: string): string {
  return /[",\n\r]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value;
}

/** Escribe la tabla como CSV (con las columnas del formato 2 si la tabla es de ese formato). */
export function tableToCsv(table: FunctionTable): string {
  const isFormat2 = table.format === 2;
  const lines = [(isFormat2 ? [...HEADER, ...FORMAT2_COLUMNS] : HEADER).join(',')];
  for (const fn of NODE_FUNCTIONS) {
    for (const rule of functionRulesOf(table, fn)) {
      const cells = [
        FUNCTION_NAMES[fn],
        rule.governmentLevels.join(';'),
        rule.entityIds.join(';'),
        rule.severity === undefined ? '' : rule.severity === 'serious' ? 'grave' : 'no_grave',
        holderToCsv(rule.holder),
        rule.legalBasis ?? '',
      ];
      if (isFormat2) {
        cells.push(
          rule.instance === undefined ? '' : rule.instance === 'first' ? 'primera' : 'alzada',
          rule.requiresIdentifiedReporter === true ? 'si' : '',
        );
      }
      lines.push(cells.map(csvCell).join(','));
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
  /** Competencia por dependencia (de `competencia-por-dependencia.csv`); con ella, formato 2. */
  entities?: readonly EntityAssignment[];
  /** Ajustes del nodo que ya tenía la tabla vigente (se conservan; formato 2). */
  settings?: FunctionTableSettings;
}

/**
 * Lee la tabla desde el CSV. Devuelve la tabla (o `null`) y los problemas, cada uno con su línea.
 * Es de formato 2 si usa el tribunal, las columnas nuevas, la competencia por dependencia o ajustes.
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
  let usesFormat2 =
    first.length > HEADER.length || header.entities !== undefined || header.settings !== undefined;
  const functions = Object.fromEntries(
    NODE_FUNCTIONS.map((fn) => [fn, [] as FunctionRule[]]),
  ) as Record<NodeFunction, FunctionRule[]>;
  rows.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const [
      fnName = '',
      levels = '',
      entities = '',
      severity = '',
      who = '',
      basis = '',
      instanceName = '',
      identified = '',
    ] = cells;
    const fn = NODE_FUNCTIONS.find(
      (candidate) => FUNCTION_NAMES[candidate] === fnName.trim().toLowerCase(),
    );
    if (fn === undefined) {
      problems.push(`Línea ${line}: función «${fnName}» desconocida.`);
      return;
    }
    const holder = holderFromCsv(who);
    if (holder === null) {
      problems.push(`Línea ${line}: «quien» debe ser authority.…, observer.… o institucion:…`);
      return;
    }
    const severityValue = severity.trim().toLowerCase();
    if (!['', 'grave', 'no_grave'].includes(severityValue)) {
      problems.push(`Línea ${line}: la gravedad debe quedar vacía o ser grave o no_grave.`);
      return;
    }
    const instance = instanceName.trim().toLowerCase();
    if (!['', 'primera', 'alzada'].includes(instance)) {
      problems.push(`Línea ${line}: la instancia debe quedar vacía o ser primera o alzada.`);
      return;
    }
    const isIdentifiedOnly = ['si', 'sí'].includes(identified.trim().toLowerCase());
    if (fn === 'court' || instance !== '' || isIdentifiedOnly) usesFormat2 = true;
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
      ...(isIdentifiedOnly ? { requiresIdentifiedReporter: true } : {}),
      ...(instance === '' ? {} : { instance: instance === 'primera' ? 'first' : 'appeal' }),
    });
  });
  if (problems.length > 0) return { table: null, problems };
  const { entities, settings, ...rest } = header;
  const { court, ...format1Functions } = functions;
  const parsed = FunctionTableSchema.safeParse(
    usesFormat2
      ? {
          format: 2,
          ...rest,
          functions,
          ...(settings === undefined ? {} : { settings }),
          ...(entities === undefined ? {} : { entities: [...entities] }),
        }
      : { format: 1, ...rest, functions: court.length > 0 ? functions : format1Functions },
  );
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
