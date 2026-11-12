// Catálogos del Estándar S5 con el formato de PDNMX/catalogos: cada catálogo en un par `.json`
// (arreglo de `{ clave, valor, … }`) y `.csv` (`clave,valor,…`), para proponerlos a la SESNA tal
// cual. Se derivan de los catálogos de @sigilo/contracts. Función pura: no escribe nada.
import {
  AuthorityFunctionSchema,
  MUNICIPALITIES,
  NODE_FUNCTIONS,
  OFFENSES,
  OFFENSE_LAW_NAMES,
  PDN_CLOSURE_CATALOG,
  PDN_STATUS_CATALOG,
  STATES,
  UNCLASSIFIED_OFFENSE_CODE,
  offenseReference,
  offenseSeverity,
} from '@sigilo/contracts';
import type { AuthorityFunction, NodeFunction, OffenseLaw } from '@sigilo/contracts';

/** Carpeta de los catálogos, relativa a `estandar/`. */
export const CATALOGS_DIR = 'catalogos';

type CatalogValue = string | number | boolean | null;

/** Un catálogo: filas con `clave` y `valor` primero, como los de PDNMX/catalogos. */
export interface Catalog {
  name: string;
  rows: readonly ({ clave: string; valor: string } & Record<string, CatalogValue>)[];
}

/**
 * Puente con el catálogo `tipoFalta` del S3 (PDNMX/catalogos), solo donde la conducta es la misma
 * falta de la LGRA. Así una denuncia y una sanción del S3 se cruzan por conducta. Las faltas no
 * graves (arts. 49 y 50) van a la clave genérica `ANG`; las demás conductas no tienen una clave
 * equivalente clara y quedan en `null`.
 */
export const S3_TIPO_FALTA: Readonly<Record<string, string>> = {
  'LGRA-49': 'ANG',
  'LGRA-50': 'ANG',
  'LGRA-52': 'CEX',
  'LGRA-53': 'PEC',
  'LGRA-54': 'DRP',
  'LGRA-55': 'UII',
  'LGRA-57': 'AFN',
  'LGRA-58': 'ABCI',
  'LGRA-59': 'CIND',
  'LGRA-60': 'EOCI',
  'LGRA-61': 'TINF',
  'LGRA-62': 'ENCB',
  'LGRA-63': 'DSCT',
  'LGRA-64': 'OJUST',
};

const SEVERITY_NAMES = {
  non_serious: 'No grave',
  serious: 'Grave',
  private_party: 'De particulares',
  crime: 'Hecho de corrupción',
} as const;

/** Nombre de cada función de la tabla de funciones del nodo. */
export const NODE_FUNCTION_NAMES: Readonly<Record<NodeFunction, string>> = {
  intake: 'Buzón general: recibe y turna',
  operation: 'Operación del nodo: da de alta autoridades',
  investigation: 'Investigación y calificación',
  substantiation: 'Substanciación',
  resolution: 'Resolución',
  supervision: 'Supervisión: superior jerárquico, recibe escalamientos',
  prosecution: 'Vía penal: fiscalía',
  observer: 'Observador: Comité de Participación Ciudadana',
};

/** Nombre de cada función de una cuenta de la autoridad. */
export const ACCOUNT_FUNCTION_NAMES: Readonly<Record<AuthorityFunction, string>> = {
  intake: 'Recepción y turnado',
  investigation: 'Investigación',
  supervision: 'Supervisión',
  substantiation: 'Substanciación y resolución',
  operation: 'Operación del nodo (solo solicitudes de alta)',
};

function capitalized(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** Conductas: una fila por clave aceptada (principal o equivalente), con su ley y su artículo. */
function offensesCatalog(): Catalog {
  const rows: Catalog['rows'][number][] = [];
  for (const offense of OFFENSES) {
    for (const code of [offense.code, ...offense.equivalentCodes]) {
      const reference = offenseReference(code);
      const law: OffenseLaw | null = reference?.law ?? null;
      // Una clave equivalente del CPF es un delito aunque su principal sea una falta de la LGRA.
      const severity = law === 'CPF' ? 'crime' : offenseSeverity(code);
      rows.push({
        clave: code,
        valor: capitalized(offense.legalTerm),
        claveLey: law,
        ley: law === null ? null : OFFENSE_LAW_NAMES[law],
        articulo: reference?.article ?? null,
        gravedad:
          code === UNCLASSIFIED_OFFENSE_CODE || severity === undefined
            ? null
            : SEVERITY_NAMES[severity],
        equivaleA: code === offense.code ? null : offense.code,
        s3TipoFalta: S3_TIPO_FALTA[code] ?? null,
      });
    }
  }
  return {
    name: 'faltas',
    rows: rows.sort((left, right) => left.clave.localeCompare(right.clave)),
  };
}

/** Todos los catálogos, por nombre de archivo. */
export function buildCatalogs(): Catalog[] {
  return [
    offensesCatalog(),
    {
      name: 'entidades',
      rows: STATES.map((state) => ({
        clave: state.code,
        valor: state.name,
        claveAGEE: state.code,
      })),
    },
    {
      name: 'municipios',
      // `claveAGEE` es siempre una cadena de 2 dígitos, como en `entidades` (el demo del S5 la da
      // como número en sus municipios y como cadena en sus entidades).
      rows: MUNICIPALITIES.map((municipality) => ({
        clave: `${municipality.stateCode}${municipality.code}`,
        valor: municipality.name,
        claveAGEE: municipality.stateCode,
        claveAGEM: municipality.code,
      })).sort((left, right) => left.clave.localeCompare(right.clave)),
    },
    {
      name: 'funciones-tabla',
      rows: NODE_FUNCTIONS.map((fn) => ({ clave: fn, valor: NODE_FUNCTION_NAMES[fn] })),
    },
    {
      name: 'funciones-cuenta',
      rows: AuthorityFunctionSchema.options.map((fn) => ({
        clave: fn,
        valor: ACCOUNT_FUNCTION_NAMES[fn],
      })),
    },
    {
      name: 'motivos-cierre',
      rows: PDN_CLOSURE_CATALOG.map(({ key, clave, valor }) => ({ clave, valor, claveApi: key })),
    },
    {
      name: 'estatus-denuncia',
      rows: PDN_STATUS_CATALOG.map(({ key, clave, valor }) => ({ clave, valor, claveApi: key })),
    },
  ];
}

function csvCell(value: CatalogValue): string {
  const text = value === null ? '' : String(value);
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Catálogo en CSV (RFC 4180, UTF-8), con las columnas en el orden de la primera fila. */
export function catalogToCsv(catalog: Catalog): string {
  const columns = Object.keys(catalog.rows[0] ?? { clave: '', valor: '' });
  const lines = [columns.join(',')];
  for (const row of catalog.rows)
    lines.push(columns.map((column) => csvCell(row[column] ?? null)).join(','));
  return `${lines.join('\n')}\n`;
}
