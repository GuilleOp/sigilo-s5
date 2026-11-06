// Red sintética del escenario de la demostración (docs/demo-escenario.md, sección 2): nodos,
// autoridades, observadores y testigos 2 de 3, con llaves generadas al momento. Nada es real.
import type {
  AuthorityCompetence,
  AuthorityDirectory,
  AuthorityRole,
  DirectoryAuthority,
  DirectoryCorroboration,
  GovernmentLevel,
} from '@sigilo/contracts';
import { generateBoxKeyPair, generateSigningKeyPair } from '@sigilo/core';
import type { KeyPair } from '@sigilo/core';
import { DIRECTORY_GENESIS_DIGEST, encodePublicKey } from './directory.ts';

export const DEMO_NODE_IDS = ['node.queretaro', 'node.federal'] as const;
export type DemoNodeId = (typeof DEMO_NODE_IDS)[number];

export const DEMO_AUTHORITY_IDS = [
  'authority.oic-iffe',
  'authority.oversight-federal',
  'authority.oic-dfps',
  'authority.prosecutor-anticorruption',
  'authority.comptroller-queretaro',
  'authority.comptroller-ejemplo',
] as const;
export type DemoAuthorityId = (typeof DEMO_AUTHORITY_IDS)[number];

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
  'authority.comptroller-ejemplo': {
    name: 'Contraloría Ficticia del Estado Ejemplo',
    nodeId: 'node.federal',
    governmentLevel: 'estatal',
    stateCode: 'state.ejemplo',
    role: 'investigating',
    competence: {
      governmentLevels: ['estatal'],
      stateCodes: ['state.ejemplo'],
      entityIds: [],
      laws: ['LGRA'],
    },
    supervisorId: null,
  },
};

/** Opciones del directorio de demostración. */
export interface DemoDirectoryOptions {
  issuedOn: string;
  /** Origen público de cada nodo. */
  baseUrls: Record<DemoNodeId, string>;
  serial?: number;
  previousDigest?: string;
  /** Llave del evaluador OPRF y orígenes de la corroboración ciega; sin ella, no se ofrece. */
  corroboration?: DirectoryCorroboration;
  /** Último día en que se acepta esta versión (H10); sin él, no vence. */
  validUntil?: string;
}

/** Arma la primera versión (sin firmar) del directorio del escenario. */
export function buildDemoDirectory(
  keys: DemoNetworkKeys<PublicPart>,
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
        name:
          id === 'node.queretaro' ? 'Nodo estatal Querétaro' : 'Nodo Federal (también nodo común)',
        baseUrl: options.baseUrls[id],
        isCommonNode: id === 'node.federal',
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
