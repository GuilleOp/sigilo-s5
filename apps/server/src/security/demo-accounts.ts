// Autoridades y cuentas sintéticas de la demostración (nodos Federal, Querétaro y Oaxaca de
// docs/demo-escenario.md): arma el archivo local de cuentas con digestos scrypt y la lista de
// credenciales para entrar. Cada nodo tiene solo las autoridades de su entidad: no hay nodo común.
import type { AuthorityAccountsFile, AuthorityFunction } from '@sigilo/contracts';
import { randomBytes, toBase64Url, toHex } from '@sigilo/core';
import { DEFAULT_SCRYPT_LOG_N, hashPassword } from './passwords.ts';

/** Credencial de demostración en claro: solo para el archivo local que no se versiona. */
export interface DemoCredential {
  username: string;
  password: string;
  authorityId: string;
  functions: readonly AuthorityFunction[];
}

/** Buzón general del nodo de demostración. */
export const DEMO_INBOX_AUTHORITY = 'authority.buzon-federal';

/** Supervisora de demostración: custodia la segunda llave (`supervisor-demo-key.json`). */
export const DEMO_SUPERVISOR_AUTHORITY = 'authority.oversight-federal';

const DEMO_AUTHORITIES: AuthorityAccountsFile['authorities'] = [
  {
    authorityId: DEMO_INBOX_AUTHORITY,
    name: 'Buzón general ficticio del nodo Federal',
    supervisorId: DEMO_SUPERVISOR_AUTHORITY,
  },
  {
    authorityId: 'authority.oic-iffe',
    name: 'Órgano Interno de Control en el Instituto Federal Ficticio de Equipamiento',
    supervisorId: DEMO_SUPERVISOR_AUTHORITY,
    // Titular ficticia: la misma persona del S1 sintético, para la alerta de conflicto (5.1).
    head: {
      fullName: 'Servidora Ficticia Dos',
      institution: 'Instituto Federal Ficticio de Equipamiento',
      stateCode: '00',
    },
  },
  {
    authorityId: 'authority.oic-dfps',
    name: 'Órgano Interno de Control en la Delegación Federal Ficticia de Programas Sociales',
    supervisorId: DEMO_SUPERVISOR_AUTHORITY,
  },
  {
    authorityId: DEMO_SUPERVISOR_AUTHORITY,
    name: 'Unidad Ficticia de Supervisión de Órganos Internos de Control',
  },
  {
    authorityId: 'authority.prosecutor-anticorruption',
    name: 'Fiscalía Ficticia Especializada en Hechos de Corrupción',
  },
];

/** Autoridades de la demostración que tienen varias cuentas. */
const IFFE = 'authority.oic-iffe';

/**
 * Usuarios de la demostración: uno por persona, cada uno con su autoridad y sus funciones. Los
 * OIC y las contralorías reciben e investigan en la misma área (la LGRA no obliga a separarlas);
 * el buzón general solo recibe y turna, y nunca abre identidades. La substanciación del OIC IFFE
 * es otra persona que nunca investiga (LGRA art. 115). El OIC IFFE tiene dos personas para la
 * apertura de identidad de 2 de N.
 */
export const DEMO_USERS: readonly Omit<DemoCredential, 'password'>[] = [
  { username: 'buzon.federal', authorityId: DEMO_INBOX_AUTHORITY, functions: ['intake'] },
  // Operación del nodo: solo revisa solicitudes de alta (la cuenta se ancla al buzón del nodo).
  { username: 'operacion.federal', authorityId: DEMO_INBOX_AUTHORITY, functions: ['operation'] },
  {
    username: 'oic-equipamiento.persona1',
    authorityId: IFFE,
    functions: ['intake', 'investigation'],
  },
  {
    username: 'oic-equipamiento.persona2',
    authorityId: IFFE,
    functions: ['intake', 'investigation'],
  },
  { username: 'oic-equipamiento.titular', authorityId: IFFE, functions: ['supervision'] },
  {
    username: 'oic-equipamiento.substanciacion',
    authorityId: IFFE,
    functions: ['substantiation'],
  },
  {
    username: 'oic-programas',
    authorityId: 'authority.oic-dfps',
    functions: ['intake', 'investigation'],
  },
  {
    username: 'supervision-oic',
    authorityId: DEMO_SUPERVISOR_AUTHORITY,
    functions: ['supervision'],
  },
  {
    username: 'fiscalia',
    authorityId: 'authority.prosecutor-anticorruption',
    functions: ['investigation'],
  },
];

/** Buzón general del nodo Querétaro de la demostración. */
export const DEMO_QUERETARO_INBOX_AUTHORITY = 'authority.buzon-queretaro';

const QUERETARO_AUTHORITIES: AuthorityAccountsFile['authorities'] = [
  {
    authorityId: DEMO_QUERETARO_INBOX_AUTHORITY,
    name: 'Buzón general ficticio del nodo Querétaro',
  },
  {
    authorityId: 'authority.comptroller-queretaro',
    name: 'Contraloría Estatal Ficticia de Querétaro',
  },
];

/** Usuarios del nodo Querétaro: el buzón general y la contraloría, que recibe e investiga. */
export const QUERETARO_USERS: readonly Omit<DemoCredential, 'password'>[] = [
  {
    username: 'buzon.queretaro',
    authorityId: DEMO_QUERETARO_INBOX_AUTHORITY,
    functions: ['intake'],
  },
  {
    username: 'operacion.queretaro',
    authorityId: DEMO_QUERETARO_INBOX_AUTHORITY,
    functions: ['operation'],
  },
  {
    username: 'contraloria.queretaro',
    authorityId: 'authority.comptroller-queretaro',
    functions: ['intake', 'investigation'],
  },
];

/** Buzón general del nodo Oaxaca de la demostración. */
export const DEMO_OAXACA_INBOX_AUTHORITY = 'authority.buzon-oaxaca';

const OAXACA_AUTHORITIES: AuthorityAccountsFile['authorities'] = [
  {
    authorityId: DEMO_OAXACA_INBOX_AUTHORITY,
    name: 'Buzón general ficticio del nodo Oaxaca',
  },
  {
    authorityId: 'authority.comptroller-oaxaca',
    name: 'Contraloría Ficticia de Oaxaca',
  },
];

/**
 * Usuarios del nodo Oaxaca: el buzón general, la operación del nodo (la lleva su
 * contraloría: en el escenario sintético la entidad no tiene CPC ni SESEA) y la contraloría, que recibe e
 * investiga.
 */
export const OAXACA_USERS: readonly Omit<DemoCredential, 'password'>[] = [
  {
    username: 'buzon.oaxaca',
    authorityId: DEMO_OAXACA_INBOX_AUTHORITY,
    functions: ['intake'],
  },
  {
    username: 'operacion.oaxaca',
    authorityId: DEMO_OAXACA_INBOX_AUTHORITY,
    functions: ['operation'],
  },
  {
    username: 'contraloria.oaxaca',
    authorityId: 'authority.comptroller-oaxaca',
    functions: ['intake', 'investigation'],
  },
];

/** Nodo de la demostración cuyas cuentas se arman. */
export type DemoAccountsNode = 'federal' | 'queretaro' | 'oaxaca';

/** Buzón, autoridades y usuarios de cada nodo de la demostración. */
const NODE_ACCOUNTS: Readonly<
  Record<
    DemoAccountsNode,
    {
      inboxAuthorityId: string;
      authorities: AuthorityAccountsFile['authorities'];
      users: readonly Omit<DemoCredential, 'password'>[];
    }
  >
> = {
  federal: {
    inboxAuthorityId: DEMO_INBOX_AUTHORITY,
    authorities: DEMO_AUTHORITIES,
    users: DEMO_USERS,
  },
  queretaro: {
    inboxAuthorityId: DEMO_QUERETARO_INBOX_AUTHORITY,
    authorities: QUERETARO_AUTHORITIES,
    users: QUERETARO_USERS,
  },
  oaxaca: {
    inboxAuthorityId: DEMO_OAXACA_INBOX_AUTHORITY,
    authorities: OAXACA_AUTHORITIES,
    users: OAXACA_USERS,
  },
};

/** Contraseña aleatoria de 24 caracteres (18 bytes). */
export function randomDemoPassword(): string {
  return toBase64Url(randomBytes(18));
}

/**
 * Arma el archivo de cuentas de la demostración y sus credenciales en claro. `passwordFor` fija la
 * contraseña de cada usuario (las pruebas E2E usan una conocida); por omisión es aleatoria. Cada
 * cuenta recibe un seudónimo aleatorio nuevo.
 * Seguridad: el archivo de cuentas solo guarda digestos; las credenciales en claro son para la
 * demostración y nunca se versionan.
 */
export function buildDemoAccounts(
  options: {
    passwordFor?: (username: string) => string;
    logN?: number;
    node?: DemoAccountsNode;
  } = {},
): { file: AuthorityAccountsFile; credentials: DemoCredential[] } {
  const passwordFor = options.passwordFor ?? (() => randomDemoPassword());
  const logN = options.logN ?? DEFAULT_SCRYPT_LOG_N;
  const node = NODE_ACCOUNTS[options.node ?? 'federal'];
  const credentials = node.users.map((user) => ({
    ...user,
    password: passwordFor(user.username),
  }));
  return {
    file: {
      version: 1,
      inboxAuthorityId: node.inboxAuthorityId,
      authorities: node.authorities,
      accounts: credentials.map((credential) => ({
        accountId: `acct-${toHex(randomBytes(8))}`,
        username: credential.username,
        authorityId: credential.authorityId,
        functions: [...credential.functions],
        passwordHash: hashPassword(credential.password, logN),
      })),
    },
    credentials,
  };
}
