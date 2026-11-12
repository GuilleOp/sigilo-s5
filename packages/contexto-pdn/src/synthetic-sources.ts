// Fuentes SINTÉTICAS en memoria con los datos de docs/demo-escenario.md, sección 5.
// Todo es ficticio (docs/datos-sinteticos.md); las fechas se expresan como desfase del día 0.

import { addDays } from './citation.ts';
import type { CoverageMatrix, CoverageRow, MatrixSystem } from './coverage.ts';
import { institutionRefKey, personNameKey } from './names.ts';
import type {
  ContractRecord,
  ContractsSource,
  DeclarationRecord,
  DeclaredInterestsSource,
  ProcurementStaffRecord,
  ProcurementStaffSource,
  SanctionRecord,
  SanctionsSource,
  SourceInfo,
  SourceScope,
  TaxListEntry,
  TaxListSource,
} from './types.ts';

/** Día 0 del escenario: lunes 9 de noviembre de 2026. */
export const SCENARIO_DAY_ZERO = '2026-11-09';

/**
 * Clave INEGI de Oaxaca. En el escenario SINTÉTICO hace el papel de entidad sin CPC y sin S3
 * conectado; no describe la situación real de Oaxaca.
 */
export const SYNTHETIC_STATE_OAXACA = '20';

export const IFFE = 'Instituto Federal Ficticio de Equipamiento';
export const DFPS = 'Delegación Federal Ficticia de Programas Sociales';
const QUERETARO_ENTES = [
  'Secretaría de Salud Estatal Ficticia',
  'Secretaría de Educación Estatal Ficticia',
  'Secretaría de Finanzas Estatal Ficticia',
  'Instituto de Movilidad Estatal Ficticio',
];

/** Opciones del reloj de las fuentes sintéticas. */
export interface SyntheticSourcesOptions {
  /** Fecha actual del reloj de la demostración (AAAA-MM-DD). Por omisión, el día 0. */
  today?: string;
  dayZero?: string;
}

/** Conjunto de fuentes del escenario. */
export interface SyntheticSources {
  matrix: CoverageMatrix;
  s1: DeclaredInterestsSource;
  s2: ProcurementStaffSource;
  /** `s3.federal` y `s3.queretaro`; Oaxaca no tiene fuente en el escenario. */
  s3: readonly SanctionsSource[];
  s6: ContractsSource;
  taxList: TaxListSource;
}

function row(
  stateCode: string,
  stateName: string,
  system: MatrixSystem,
  hasData: boolean,
): CoverageRow {
  return {
    stateCode,
    stateName,
    system,
    period: 'total',
    hasData,
    dateMin: null,
    dateMax: null,
    notes: [],
  };
}

/** Matriz de cobertura sintética del escenario (sección 2.4 y 5.3). */
export const SYNTHETIC_COVERAGE_MATRIX: CoverageMatrix = {
  rows: [
    ...(['S1', 'S2', 'S3S', 'S6'] as const).map((system) => row('00', 'Federación', system, true)),
    row('00', 'Federación', 'S3P', false),
    row('22', 'Querétaro', 'S3S', true),
    ...(['S1', 'S2', 'S3P', 'S6'] as const).map((system) => row('22', 'Querétaro', system, false)),
    ...(['S1', 'S2', 'S3S', 'S3P', 'S6'] as const).map((system) =>
      row(SYNTHETIC_STATE_OAXACA, 'Oaxaca', system, false),
    ),
  ],
};

function scope(stateCode: string, institutions: readonly string[]): SourceScope {
  return {
    stateCodes: [stateCode],
    institutionKeys: institutions.map((name) => institutionRefKey(name, stateCode)),
  };
}

function info(
  id: string,
  system: SourceInfo['system'],
  label: string,
  dataAsOf: string,
): SourceInfo {
  return { id, system, label, dataAsOf, isSynthetic: true };
}

const DECLARATIONS: readonly DeclarationRecord[] = [
  {
    recordId: 's1.oic-head',
    fullName: 'Servidora Ficticia Dos',
    institution: IFFE,
    area: 'Órgano Interno de Control',
    position: 'Titular del Órgano Interno de Control',
    organizations: [
      {
        name: 'Inmobiliaria Ficticia Ejemplo, S.A. de C.V.',
        relation: 'DECLARANTE',
        participationType: 'Socio',
      },
      {
        name: 'Asociación Ficticia de Egresados Ejemplo, A.C.',
        relation: 'DECLARANTE',
        participationType: 'Asociado',
      },
    ],
  },
  {
    recordId: 's1.purchasing-head',
    fullName: 'Servidor Ficticio Uno',
    institution: IFFE,
    area: 'Departamento de Compras',
    position: 'Jefe del Departamento de Compras',
    organizations: [
      {
        name: 'Inmobiliaria Ficticia Ejemplo, S.A. de C.V.',
        relation: 'DECLARANTE',
        participationType: 'Socio',
      },
      {
        name: 'Asociación Ficticia de Egresados Ejemplo, A.C.',
        relation: 'DECLARANTE',
        participationType: 'Asociado',
      },
    ],
  },
  // Control negativo: el resto del área declara sin intereses en común con nadie del OIC.
  ...[
    'Marta Ejemplo',
    'Persona Ficticia Compras Dos',
    'Persona Ficticia Compras Tres',
    'Persona Ficticia Compras Cuatro',
  ].map((fullName, index): DeclarationRecord => ({
    recordId: `s1.purchasing-staff-${index + 1}`,
    fullName,
    institution: IFFE,
    area: 'Departamento de Compras',
    position: 'Personal de compras',
    organizations: [],
  })),
  {
    recordId: 's1.honest-director',
    fullName: 'Servidor Ficticio Tres',
    institution: DFPS,
    area: 'Dirección',
    position: 'Director de la Delegación',
    organizations: [],
  },
];

const HEAD = { fullName: 'Servidor Ficticio Uno', position: 'Jefe del Departamento de Compras' };
const STAFF: readonly ProcurementStaffRecord[] = [
  ['s2.marta', 'Marta Ejemplo', 'Auxiliar de compras'],
  ['s2.staff-2', 'Persona Ficticia Compras Dos', 'Analista de compras'],
  ['s2.staff-3', 'Persona Ficticia Compras Tres', 'Analista de compras'],
  ['s2.staff-4', 'Persona Ficticia Compras Cuatro', 'Capturista de compras'],
]
  .map(([recordId, fullName, position]): ProcurementStaffRecord => ({
    recordId: recordId ?? '',
    fullName: fullName ?? '',
    institution: IFFE,
    position: position ?? '',
    areaType: 'C',
    isContractingArea: true,
    supervisor: HEAD,
  }))
  .concat({
    recordId: 's2.head',
    fullName: 'Servidor Ficticio Uno',
    institution: IFFE,
    position: 'Jefe del Departamento de Compras',
    areaType: 'C',
    isContractingArea: true,
    supervisor: { fullName: 'Servidor Ficticio Cinco', position: 'Director de Administración' },
  });

interface DatedSanction extends Omit<SanctionRecord, 'resolutionDate'> {
  sourceId: 's3.federal' | 's3.queretaro';
  dayOffset: number;
}

const SANCTIONS: readonly DatedSanction[] = [
  {
    sourceId: 's3.federal',
    recordId: 's3.marta-outcome',
    fileNumber: 'TFF-SALA-0001',
    fullName: 'Servidor Ficticio Uno',
    institution: IFFE,
    stateCode: '00',
    sanctions: ['INHABILITACION'],
    sanctionText: 'Inhabilitación de 1 año',
    authority: 'Sala Ficticia Especializada en Responsabilidades Administrativas',
    dayOffset: 95,
  },
  {
    sourceId: 's3.federal',
    recordId: 's3.oic-0007',
    fileNumber: 'OIC-IFFE-RES-0007',
    fullName: 'Servidor Ficticio Seis',
    institution: IFFE,
    stateCode: '00',
    sanctions: ['AMONESTACION'],
    sanctionText: 'Amonestación privada',
    authority: 'Órgano Interno de Control en el Instituto Federal Ficticio de Equipamiento',
    dayOffset: -60,
  },
  {
    sourceId: 's3.queretaro',
    recordId: 's3.queretaro-0004',
    fileNumber: 'CEF-RES-0004',
    fullName: 'Servidor Ficticio Ocho',
    institution: 'Secretaría de Finanzas Estatal Ficticia',
    stateCode: '22',
    sanctions: ['AMONESTACION'],
    sanctionText: 'Amonestación privada',
    authority: 'Contraloría Estatal Ficticia de Querétaro',
    dayOffset: -90,
  },
];

interface DatedContract extends Omit<ContractRecord, 'date'> {
  dayOffsetSigned: number;
}

const CONTRACTS: readonly DatedContract[] = [
  {
    ocid: 'ocds-fict00-IFFE-AD-2026-0042',
    contractIds: ['IFFE-AD-2026-0042'],
    buyer: { id: 'IFFE-0001', name: IFFE },
    method: 'direct',
    methodDetails: 'Adjudicación directa',
    rationale: 'Urgencia',
    tenderers: 1,
    awards: [
      {
        id: 'IFFE-AD-2026-0042-A1',
        suppliers: [
          { id: 'XAXX260101EJ1', name: 'Comercializadora Ficticia Ejemplo, S.A. de C.V.' },
        ],
        amount: 1_480_000,
        currency: 'MXN',
      },
    ],
    dayOffsetSigned: -240,
  },
  {
    ocid: 'ocds-fict00-DFPS-LP-2026-0007',
    contractIds: ['DFPS-LP-2026-0007'],
    buyer: { id: 'DFPS-0001', name: DFPS },
    method: 'open',
    methodDetails: 'Licitación pública',
    rationale: null,
    tenderers: 4,
    awards: [
      {
        id: 'DFPS-LP-2026-0007-A1',
        suppliers: [{ id: 'XAXX260101SE2', name: 'Servicios Ficticios Ejemplo Dos, S.A. de C.V.' }],
        amount: 820_000,
        currency: 'MXN',
      },
    ],
    dayOffsetSigned: -200,
  },
];

const TAX_LIST: readonly (Omit<TaxListEntry, 'publishedOn'> & { dayOffset: number })[] = [
  {
    rfc: 'XAXX260101EJ1',
    name: 'Comercializadora Ficticia Ejemplo, S.A. de C.V.',
    status: 'definitive',
    dayOffset: -400,
  },
];

function samePerson(a: string, b: string): boolean {
  return personNameKey(a) === personNameKey(b);
}

/** Crea las fuentes sintéticas del escenario con el reloj indicado. */
export function createSyntheticSources(options: SyntheticSourcesOptions = {}): SyntheticSources {
  const dayZero = options.dayZero ?? SCENARIO_DAY_ZERO;
  const today = options.today ?? dayZero;
  const at = (offset: number): string => addDays(dayZero, offset);
  const federalScope = scope('00', [IFFE, DFPS]);

  const s1: DeclaredInterestsSource = {
    info: info('s1.federal', 'S1', 'S1 federal (sintético)', today),
    scope: federalScope,
    findDeclaration: (person) =>
      DECLARATIONS.find(
        (item) =>
          samePerson(item.fullName, person.fullName) &&
          institutionRefKey(item.institution, '00') ===
            institutionRefKey(person.institution, person.stateCode),
      ) ?? null,
  };
  const s2: ProcurementStaffSource = {
    info: info('s2.federal', 'S2', 'S2 federal (sintético)', today),
    scope: federalScope,
    findStaff: (person) => STAFF.find((item) => samePerson(item.fullName, person.fullName)) ?? null,
  };
  const sanctionsFrom = (sourceId: DatedSanction['sourceId']): readonly SanctionRecord[] =>
    SANCTIONS.filter((item) => item.sourceId === sourceId && at(item.dayOffset) <= today).map(
      ({ sourceId: _source, dayOffset, ...record }) => ({
        ...record,
        institutionKey: institutionRefKey(record.institution, record.stateCode),
        resolutionDate: at(dayOffset),
      }),
    );
  const s3Source = (
    id: DatedSanction['sourceId'],
    label: string,
    dataAsOf: string,
    sourceScope: SourceScope,
  ): SanctionsSource => ({
    info: info(id, 'S3S', label, dataAsOf),
    scope: sourceScope,
    findByFileNumber: (fileNumber, stateCode) =>
      sanctionsFrom(id).filter(
        (item) => item.fileNumber === fileNumber.trim() && item.stateCode === stateCode,
      ),
  });
  const s6: ContractsSource = {
    info: info('s6.federal', 'S6', 'S6 federal (sintético)', today),
    scope: { stateCodes: ['00'] },
    findContract: ({ ocid, contractId }) => {
      const found = CONTRACTS.find(
        (item) =>
          (ocid !== undefined && item.ocid === ocid.trim()) ||
          (contractId !== undefined && item.contractIds.includes(contractId.trim())),
      );
      if (found === undefined) return null;
      const { dayOffsetSigned, ...record } = found;
      return { ...record, date: at(dayOffsetSigned) };
    },
  };
  const taxList: TaxListSource = {
    info: info('list69b.synthetic', 'L69B', 'Lista tipo 69-B (sintética)', today),
    scope: { stateCodes: [] },
    findByRfc: (rfc) => {
      const found = TAX_LIST.find((item) => item.rfc === rfc);
      if (found === undefined) return null;
      const { dayOffset, ...entry } = found;
      return { ...entry, publishedOn: at(dayOffset) };
    },
  };
  return {
    matrix: SYNTHETIC_COVERAGE_MATRIX,
    s1,
    s2,
    s3: [
      s3Source('s3.federal', 'S3 federal (sintético)', today, federalScope),
      s3Source(
        's3.queretaro',
        'S3 de Querétaro (sintético)',
        addDays(today, -1),
        scope('22', QUERETARO_ENTES),
      ),
    ],
    s6,
    taxList,
  };
}
