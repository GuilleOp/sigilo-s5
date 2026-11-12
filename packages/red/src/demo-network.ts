// Red sintética del escenario de la demostración (docs/demo-escenario.md, sección 2): un nodo por
// entidad (Querétaro y Oaxaca) y el nodo federal, sin nodo común; autoridades (con el
// buzón general de cada nodo), la tabla de funciones de cada nodo firmada por él, observadores y
// testigos 2 de 3, con llaves generadas al momento. Nada es real.
import type {
  AuthorityCompetence,
  AuthorityDirectory,
  AuthorityRole,
  DirectoryAuthority,
  DirectoryCorroboration,
  FunctionRule,
  FunctionTable,
  GovernmentLevel,
} from '@sigilo/contracts';
import { generateBoxKeyPair, generateSigningKeyPair } from '@sigilo/core';
import type { KeyPair } from '@sigilo/core';
import { DIRECTORY_GENESIS_DIGEST, encodePublicKey } from './directory.ts';
import { signFunctionTable } from './function-table.ts';

export const DEMO_NODE_IDS = ['node.queretaro', 'node.federal', 'node.oaxaca'] as const;
export type DemoNodeId = (typeof DEMO_NODE_IDS)[number];

export const DEMO_AUTHORITY_IDS = [
  'authority.oic-iffe',
  'authority.oversight-federal',
  'authority.oic-dfps',
  'authority.prosecutor-anticorruption',
  'authority.comptroller-queretaro',
  'authority.comptroller-oaxaca',
  'authority.buzon-federal',
  'authority.buzon-queretaro',
  'authority.buzon-oaxaca',
] as const;
export type DemoAuthorityId = (typeof DEMO_AUTHORITY_IDS)[number];

/**
 * Buzón general de cada nodo: recibe lo que no tiene autoridad competente en el directorio y una
 * persona lo turna (Bases de la PDN, arts. 56 y 58). Su llave es la de `keys.json` del nodo.
 */
export const DEMO_INBOX_AUTHORITY_IDS: Readonly<Record<DemoNodeId, DemoAuthorityId>> = {
  'node.federal': 'authority.buzon-federal',
  'node.queretaro': 'authority.buzon-queretaro',
  'node.oaxaca': 'authority.buzon-oaxaca',
};

/** Nombre de cada nodo de la demostración. */
export const DEMO_NODE_NAMES: Readonly<Record<DemoNodeId, string>> = {
  'node.queretaro': 'Nodo estatal Querétaro',
  'node.federal': 'Nodo Federal',
  'node.oaxaca': 'Nodo estatal Oaxaca',
};

export const DEMO_OBSERVER_IDS = ['observer.cpc-queretaro', 'observer.university-ejemplo'] as const;
export type DemoObserverId = (typeof DEMO_OBSERVER_IDS)[number];

/** Testigos de la bitácora nacional y del directorio, con umbral 2 de 3. */
export const DEMO_WITNESS_IDS = [
  'observer.cpc-queretaro',
  'observer.university-ejemplo',
  'node.queretaro',
] as const;
export const DEMO_WITNESS_THRESHOLD = 2;

/** Llave con solo su parte pública (la que entra al directorio). */
interface PublicPart {
  publicKey: Uint8Array;
}

/** Llaves de toda la red de demostración; para armar el directorio basta su parte pública. */
export interface DemoNetworkKeys<Key extends PublicPart = KeyPair> {
  operator: Key;
  nodes: Record<DemoNodeId, { box: Key; signing: Key }>;
  authorities: Record<DemoAuthorityId, { box: Key; signing: Key }>;
  observers: Record<DemoObserverId, Key>;
}

function pairs<Id extends string>(
  ids: readonly Id[],
): Record<Id, { box: KeyPair; signing: KeyPair }> {
  return Object.fromEntries(
    ids.map((id) => [id, { box: generateBoxKeyPair(), signing: generateSigningKeyPair() }]),
  ) as Record<Id, { box: KeyPair; signing: KeyPair }>;
}

/** Genera llaves nuevas para la operación, los nodos, las autoridades y los observadores. */
export function generateDemoNetworkKeys(): DemoNetworkKeys {
  return {
    operator: generateSigningKeyPair(),
    nodes: pairs(DEMO_NODE_IDS),
    authorities: pairs(DEMO_AUTHORITY_IDS),
    observers: Object.fromEntries(
      DEMO_OBSERVER_IDS.map((id) => [id, generateSigningKeyPair()]),
    ) as Record<DemoObserverId, KeyPair>,
  };
}

interface DemoAuthoritySpec {
  name: string;
  nodeId: DemoNodeId;
  governmentLevel: GovernmentLevel;
  stateCode: string | null;
  role: AuthorityRole;
  competence: AuthorityCompetence;
  supervisorId: DemoAuthorityId | null;
}

const DEMO_AUTHORITIES: Readonly<Record<DemoAuthorityId, DemoAuthoritySpec>> = {
  'authority.oic-iffe': {
    name: 'Órgano Interno de Control en el Instituto Federal Ficticio de Equipamiento',
    nodeId: 'node.federal',
    governmentLevel: 'federal',
    stateCode: null,
    role: 'investigating',
    competence: {
      governmentLevels: ['federal'],
      stateCodes: [],
      entityIds: ['VE-INSTITUTO'],
      laws: ['LGRA'],
    },
    supervisorId: 'authority.oversight-federal',
  },
  'authority.oversight-federal': {
    name: 'Unidad Ficticia de Supervisión de Órganos Internos de Control',
    nodeId: 'node.federal',
    governmentLevel: 'federal',
    stateCode: null,
    role: 'supervisory',
    competence: { governmentLevels: ['federal'], stateCodes: [], entityIds: [], laws: ['LGRA'] },
    supervisorId: null,
  },
  'authority.oic-dfps': {
    name: 'Órgano Interno de Control en la Delegación Federal Ficticia de Programas Sociales',
    nodeId: 'node.federal',
    governmentLevel: 'federal',
    stateCode: null,
    role: 'investigating',
    competence: {
      governmentLevels: ['federal'],
      stateCodes: [],
      entityIds: ['VE-PROGRAMAS'],
      laws: ['LGRA'],
    },
    supervisorId: 'authority.oversight-federal',
  },
  'authority.prosecutor-anticorruption': {
    name: 'Fiscalía Ficticia Especializada en Hechos de Corrupción',
    nodeId: 'node.federal',
    governmentLevel: 'federal',
    stateCode: null,
    role: 'prosecution',
    competence: { governmentLevels: ['federal'], stateCodes: [], entityIds: [], laws: ['CPF'] },
    supervisorId: null,
  },
  'authority.comptroller-queretaro': {
    name: 'Contraloría Estatal Ficticia de Querétaro',
    nodeId: 'node.queretaro',
    governmentLevel: 'estatal',
    stateCode: '22',
    role: 'investigating',
    competence: {
      governmentLevels: ['estatal'],
      stateCodes: ['22'],
      entityIds: [],
      laws: ['LGRA'],
    },
    supervisorId: null,
  },
  'authority.comptroller-oaxaca': {
    name: 'Contraloría Ficticia de Oaxaca',
    nodeId: 'node.oaxaca',
    governmentLevel: 'estatal',
    stateCode: '20',
    role: 'investigating',
    competence: {
      governmentLevels: ['estatal'],
      stateCodes: ['20'],
      entityIds: [],
      laws: ['LGRA'],
    },
    supervisorId: null,
  },
  // Buzones generales: no se proponen por competencia; reciben lo que no encuentra autoridad. El
  // federal atiende solo a los entes federales; el de cada estado, a los de su entidad.
  'authority.buzon-federal': {
    name: 'Buzón general ficticio del nodo Federal',
    nodeId: 'node.federal',
    governmentLevel: 'federal',
    stateCode: null,
    role: 'inbox',
    competence: {
      governmentLevels: ['federal'],
      stateCodes: [],
      entityIds: [],
      laws: ['LGRA', 'CPF'],
    },
    supervisorId: 'authority.oversight-federal',
  },
  'authority.buzon-queretaro': {
    name: 'Buzón general ficticio del nodo Querétaro',
    nodeId: 'node.queretaro',
    governmentLevel: 'estatal',
    stateCode: '22',
    role: 'inbox',
    competence: {
      governmentLevels: ['estatal', 'municipal'],
      stateCodes: ['22'],
      entityIds: [],
      laws: ['LGRA', 'CPF'],
    },
    supervisorId: null,
  },
  'authority.buzon-oaxaca': {
    name: 'Buzón general ficticio del nodo Oaxaca',
    nodeId: 'node.oaxaca',
    governmentLevel: 'estatal',
    stateCode: '20',
    role: 'inbox',
    competence: {
      governmentLevels: ['estatal', 'municipal'],
      stateCodes: ['20'],
      entityIds: [],
      laws: ['LGRA', 'CPF'],
    },
    supervisorId: null,
  },
};

const STATE_LEVELS: GovernmentLevel[] = ['estatal', 'municipal'];
const FEDERAL_LEVELS: GovernmentLevel[] = ['federal'];

type RuleExtra = Partial<Pick<FunctionRule, 'entityIds' | 'severity' | 'legalBasis'>>;

function rule(
  governmentLevels: GovernmentLevel[],
  holder: FunctionRule['holder'],
  extra: RuleExtra = {},
): FunctionRule {
  return {
    governmentLevels,
    entityIds: extra.entityIds ?? [],
    ...(extra.severity === undefined ? {} : { severity: extra.severity }),
    holder,
    ...(extra.legalBasis === undefined ? {} : { legalBasis: extra.legalBasis }),
  };
}

function authorityRule(
  governmentLevels: GovernmentLevel[],
  authorityId: DemoAuthorityId,
  extra: RuleExtra = {},
): FunctionRule {
  return rule(governmentLevels, { kind: 'authority', authorityId }, extra);
}

function institutionRule(
  governmentLevels: GovernmentLevel[],
  name: string,
  extra: RuleExtra = {},
): FunctionRule {
  return rule(governmentLevels, { kind: 'institution', name }, extra);
}

/**
 * Tabla de funciones que declara cada nodo de la demostración. Querétaro y Oaxaca cubren
 * sus entes estatales y municipales («municipales sin OIC → Contraloría»); el federal, los entes
 * federales, cada uno con su OIC («ente X → su OIC») y sin regla general: un ente federal sin OIC en
 * el directorio va al buzón federal, que lo turna.
 */
export function demoFunctionTables(issuedOn: string): Record<DemoNodeId, FunctionTable> {
  const table = (
    nodeId: DemoNodeId,
    stateCode: string | null,
    functions: FunctionTable['functions'],
  ): FunctionTable => ({ format: 1, nodeId, stateCode, version: 1, issuedOn, functions });
  return {
    'node.queretaro': table('node.queretaro', '22', {
      intake: [authorityRule(STATE_LEVELS, 'authority.buzon-queretaro')],
      operation: [
        institutionRule(
          STATE_LEVELS,
          'Secretaría Ejecutiva Ficticia del Sistema Estatal Anticorrupción de Querétaro',
        ),
      ],
      investigation: [
        authorityRule(STATE_LEVELS, 'authority.comptroller-queretaro', {
          legalBasis: 'LGRA, arts. 3, fr. II, y 10',
        }),
      ],
      substantiation: [
        institutionRule(
          STATE_LEVELS,
          'Dirección Ficticia de Responsabilidades de la Contraloría de Querétaro',
          { legalBasis: 'LGRA, art. 3, fr. III' },
        ),
      ],
      resolution: [
        institutionRule(STATE_LEVELS, 'Contraloría Estatal Ficticia de Querétaro (resolutora)', {
          severity: 'non_serious',
          legalBasis: 'LGRA, art. 10',
        }),
        institutionRule(STATE_LEVELS, 'Tribunal de Justicia Administrativa Ficticio de Querétaro', {
          severity: 'serious',
          legalBasis: 'LGRA, art. 12',
        }),
      ],
      supervision: [
        institutionRule(STATE_LEVELS, 'Titular de la Contraloría Estatal Ficticia de Querétaro'),
      ],
      prosecution: [institutionRule(STATE_LEVELS, 'Fiscalía Anticorrupción Ficticia de Querétaro')],
      observer: [rule(STATE_LEVELS, { kind: 'observer', observerId: 'observer.cpc-queretaro' })],
    }),
    'node.federal': table('node.federal', null, {
      intake: [authorityRule(FEDERAL_LEVELS, 'authority.buzon-federal')],
      operation: [
        institutionRule(
          FEDERAL_LEVELS,
          'Secretaría Anticorrupción y Buen Gobierno Ficticia (operación del nodo federal)',
        ),
      ],
      investigation: [
        authorityRule(FEDERAL_LEVELS, 'authority.oic-iffe', { entityIds: ['VE-INSTITUTO'] }),
        authorityRule(FEDERAL_LEVELS, 'authority.oic-dfps', { entityIds: ['VE-PROGRAMAS'] }),
      ],
      substantiation: [
        authorityRule(FEDERAL_LEVELS, 'authority.oic-iffe', {
          entityIds: ['VE-INSTITUTO'],
          legalBasis: 'Área de responsabilidades del OIC (LGRA, art. 3, fr. III)',
        }),
        authorityRule(FEDERAL_LEVELS, 'authority.oic-dfps', {
          entityIds: ['VE-PROGRAMAS'],
          legalBasis: 'Área de responsabilidades del OIC (LGRA, art. 3, fr. III)',
        }),
      ],
      resolution: [
        authorityRule(FEDERAL_LEVELS, 'authority.oic-iffe', {
          entityIds: ['VE-INSTITUTO'],
          severity: 'non_serious',
          legalBasis: 'LGRA, art. 10',
        }),
        authorityRule(FEDERAL_LEVELS, 'authority.oic-dfps', {
          entityIds: ['VE-PROGRAMAS'],
          severity: 'non_serious',
          legalBasis: 'LGRA, art. 10',
        }),
        institutionRule(FEDERAL_LEVELS, 'Tribunal Federal Ficticio de Justicia Administrativa', {
          severity: 'serious',
          legalBasis: 'LGRA, art. 12',
        }),
      ],
      supervision: [authorityRule(FEDERAL_LEVELS, 'authority.oversight-federal')],
      prosecution: [authorityRule(FEDERAL_LEVELS, 'authority.prosecutor-anticorruption')],
      observer: [
        institutionRule(
          FEDERAL_LEVELS,
          'Comité de Participación Ciudadana Ficticio del Sistema Nacional Anticorrupción',
        ),
      ],
    }),
    'node.oaxaca': table('node.oaxaca', '20', {
      intake: [authorityRule(STATE_LEVELS, 'authority.buzon-oaxaca')],
      operation: [
        institutionRule(
          STATE_LEVELS,
          'Secretaría de la Contraloría Ficticia de Oaxaca (operación del nodo)',
        ),
      ],
      investigation: [
        authorityRule(STATE_LEVELS, 'authority.comptroller-oaxaca', {
          legalBasis: 'LGRA, arts. 3, fr. II, y 10',
        }),
      ],
      substantiation: [
        institutionRule(
          STATE_LEVELS,
          'Dirección Ficticia de Responsabilidades de la Contraloría Ficticia de Oaxaca',
        ),
      ],
      resolution: [
        institutionRule(STATE_LEVELS, 'Contraloría Ficticia de Oaxaca (resolutora)', {
          severity: 'non_serious',
        }),
        institutionRule(STATE_LEVELS, 'Tribunal de Justicia Administrativa Ficticio de Oaxaca', {
          severity: 'serious',
        }),
      ],
      supervision: [],
      prosecution: [institutionRule(STATE_LEVELS, 'Fiscalía Ficticia de Oaxaca')],
      // Sin CPC en el escenario sintético (sección 2.4); no describe la situación real de Oaxaca.
      observer: [],
    }),
  };
}

/** Opciones del directorio de demostración. */
export interface DemoDirectoryOptions {
  issuedOn: string;
  /** Origen público de cada nodo; el que falte usa `http://<nodo>.invalid`. */
  baseUrls: Partial<Record<DemoNodeId, string>>;
  serial?: number;
  previousDigest?: string;
  /** Llave del evaluador OPRF y orígenes de la corroboración ciega; sin ella, no se ofrece. */
  corroboration?: DirectoryCorroboration;
  /** Último día en que se acepta esta versión (H10); sin él, no vence. */
  validUntil?: string;
}

/**
 * Arma la primera versión (sin firmar) del directorio del escenario, con la tabla de funciones de
 * cada nodo ya firmada por su llave (en la operación real, cada nodo la firma por separado).
 */
export function buildDemoDirectory(
  keys: DemoNetworkKeys,
  options: DemoDirectoryOptions,
): AuthorityDirectory {
  const operator = encodePublicKey(keys.operator.publicKey);
  const authorities: DirectoryAuthority[] = DEMO_AUTHORITY_IDS.map((id) => {
    const spec = DEMO_AUTHORITIES[id];
    const box = encodePublicKey(keys.authorities[id].box.publicKey);
    return {
      id,
      ...spec,
      keyId: box.keyId,
      boxPublicKey: box.publicKey,
      signingPublicKey: encodePublicKey(keys.authorities[id].signing.publicKey).publicKey,
      validFrom: options.issuedOn,
      validUntil: null,
    };
  });
  return {
    format: 1,
    serial: options.serial ?? 1,
    issuedOn: options.issuedOn,
    ...(options.validUntil === undefined ? {} : { validUntil: options.validUntil }),
    previousDigest: options.previousDigest ?? DIRECTORY_GENESIS_DIGEST,
    operator: {
      name: 'Operación ficticia de la ventanilla única (demostración)',
      signingKeyId: operator.keyId,
      signingPublicKey: operator.publicKey,
    },
    nodes: DEMO_NODE_IDS.map((id) => {
      const box = encodePublicKey(keys.nodes[id].box.publicKey);
      const signing = encodePublicKey(keys.nodes[id].signing.publicKey);
      return {
        id,
        name: DEMO_NODE_NAMES[id],
        baseUrl: options.baseUrls[id] ?? `http://${id.replace('.', '-')}.invalid`,
        boxKeyId: box.keyId,
        boxPublicKey: box.publicKey,
        signingKeyId: signing.keyId,
        signingPublicKey: signing.publicKey,
      };
    }),
    authorities,
    observers: [
      {
        id: 'observer.cpc-queretaro',
        name: 'Comité de Participación Ciudadana Ficticio de Querétaro',
        kind: 'cpc',
        ...signingFields(keys.observers['observer.cpc-queretaro'].publicKey),
      },
      {
        id: 'observer.university-ejemplo',
        name: 'Universidad Ficticia Ejemplo',
        kind: 'academia',
        ...signingFields(keys.observers['observer.university-ejemplo'].publicKey),
      },
    ],
    witnessPolicy: { threshold: DEMO_WITNESS_THRESHOLD, witnessIds: [...DEMO_WITNESS_IDS] },
    ...(options.corroboration === undefined ? {} : { corroboration: options.corroboration }),
    functionTables: Object.entries(demoFunctionTables(options.issuedOn)).map(([id, table]) =>
      signFunctionTable(table, keys.nodes[id as DemoNodeId].signing.privateKey),
    ),
  };
}

function signingFields(publicKey: Uint8Array): { signingKeyId: string; signingPublicKey: string } {
  const encoded = encodePublicKey(publicKey);
  return { signingKeyId: encoded.keyId, signingPublicKey: encoded.publicKey };
}

/** Llave privada de firma de un testigo de la demostración. */
export function demoWitnessPrivateKey(keys: DemoNetworkKeys, witnessId: string): Uint8Array {
  if (witnessId === 'node.queretaro') return keys.nodes['node.queretaro'].signing.privateKey;
  const observer = DEMO_OBSERVER_IDS.find((id) => id === witnessId);
  if (observer === undefined) throw new Error(`No es testigo de la demostración: ${witnessId}.`);
  return keys.observers[observer].privateKey;
}
