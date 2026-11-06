// Autoridades y cuentas sintéticas de la demostración (nodos Federal y Querétaro de
// docs/demo-escenario.md): arma el archivo local de cuentas con digestos scrypt y la lista de
// credenciales para entrar.
import type { AuthorityAccountsFile, AuthorityFunction } from '@sigilo/contracts';
import { randomBytes, toBase64Url, toHex } from '@sigilo/core';
import { DEFAULT_SCRYPT_LOG_N, hashPassword } from './passwords.ts';

/** Credencial de demostración en claro: solo para el archivo local que no se versiona. */
export interface DemoCredential {
  username: string;
  password: string;
  authorityId: string;
  function: AuthorityFunction;
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
  {
    authorityId: 'authority.comptroller-ejemplo',
    name: 'Contraloría Ficticia del Estado Ejemplo',
  },
];

/** Usuarios de la demostración: uno por persona, cada uno con su autoridad y su función. */
export const DEMO_USERS: readonly Omit<DemoCredential, 'password'>[] = [
  { username: 'recepcion.buzon', authorityId: DEMO_INBOX_AUTHORITY, function: 'intake' },
  { username: 'recepcion.iffe', authorityId: 'authority.oic-iffe', function: 'intake' },
  {
    username: 'investigacion.iffe.uno',
    authorityId: 'authority.oic-iffe',
    function: 'investigation',
  },
  {
    username: 'investigacion.iffe.dos',
    authorityId: 'authority.oic-iffe',
    function: 'investigation',
  },
  { username: 'supervision.iffe', authorityId: 'authority.oic-iffe', function: 'supervision' },
  { username: 'recepcion.dfps', authorityId: 'authority.oic-dfps', function: 'intake' },
  {
    username: 'investigacion.dfps.uno',
    authorityId: 'authority.oic-dfps',
    function: 'investigation',
  },
  {
    username: 'investigacion.dfps.dos',
    authorityId: 'authority.oic-dfps',
    function: 'investigation',
  },
  {
    username: 'supervision.federal.uno',
    authorityId: DEMO_SUPERVISOR_AUTHORITY,
    function: 'supervision',
  },
  {
    username: 'supervision.federal.dos',
    authorityId: DEMO_SUPERVISOR_AUTHORITY,
    function: 'supervision',
  },
  {
    username: 'investigacion.fiscalia',
    authorityId: 'authority.prosecutor-anticorruption',
    function: 'investigation',
  },
  {
    username: 'recepcion.ejemplo',
    authorityId: 'authority.comptroller-ejemplo',
    function: 'intake',
  },
  {
    username: 'investigacion.ejemplo',
    authorityId: 'authority.comptroller-ejemplo',
    function: 'investigation',
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

/** Usuarios del nodo Querétaro. */
export const QUERETARO_USERS: readonly Omit<DemoCredential, 'password'>[] = [
  {
    username: 'recepcion.buzon.queretaro',
    authorityId: DEMO_QUERETARO_INBOX_AUTHORITY,
    function: 'intake',
  },
  {
    username: 'recepcion.contraloria.queretaro',
    authorityId: 'authority.comptroller-queretaro',
    function: 'intake',
  },
  {
    username: 'investigacion.contraloria.queretaro',
    authorityId: 'authority.comptroller-queretaro',
    function: 'investigation',
  },
];

/** Nodo de la demostración cuyas cuentas se arman. */
export type DemoAccountsNode = 'federal' | 'queretaro';

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
  const isQueretaro = options.node === 'queretaro';
  const users = isQueretaro ? QUERETARO_USERS : DEMO_USERS;
  const credentials = users.map((user) => ({ ...user, password: passwordFor(user.username) }));
  return {
    file: {
      version: 1,
      inboxAuthorityId: isQueretaro ? DEMO_QUERETARO_INBOX_AUTHORITY : DEMO_INBOX_AUTHORITY,
      authorities: isQueretaro ? QUERETARO_AUTHORITIES : DEMO_AUTHORITIES,
      accounts: credentials.map((credential) => ({
        accountId: `acct-${toHex(randomBytes(8))}`,
        username: credential.username,
        authorityId: credential.authorityId,
        function: credential.function,
        passwordHash: hashPassword(credential.password, logN),
      })),
    },
    credentials,
  };
}
