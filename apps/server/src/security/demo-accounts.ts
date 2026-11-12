// Autoridades y cuentas sintéticas de la demostración (nodos Federal, Querétaro y Oaxaca de
// docs/demo-escenario.md): arma el archivo local de cuentas con digestos scrypt y la lista de
// credenciales para entrar. Cada nodo tiene solo las autoridades de su entidad: no hay nodo común.
import type { AuthorityAccountsFile, AuthorityFunction } from '@sigilo/contracts';
import { randomBytes, toBase64Url, toHex } from '@sigilo/core';
import { DEFAULT_SCRYPT_LOG_N, hashPassword } from './passwords.ts';
import { generateTotpSecret, toBase32 } from './totp.ts';

/** Credencial de demostración en claro: solo para el archivo local que no se versiona. */
export interface DemoCredential {
  username: string;
  password: string;
  authorityId: string;
  functions: readonly AuthorityFunction[];
  /**
   * Secreto TOTP sintético en Base32 de una cuenta con el segundo factor ya inscrito (para
   * `npm run demo:codigo` o para agregarlo a una app de autenticación).
   */
  mfaSecret?: string;
  /** Códigos de recuperación sintéticos de esa cuenta (los agrega quien inscribe). */
  recoveryCodes?: string[];
  /** La cuenta inscribe el segundo factor en su primer inicio de sesión (`requireMfa`). */
  requireMfa?: boolean;
}

/**
 * Cuentas de la demostración con el segundo factor ya inscrito: la supervisora, la operación de
 * cada nodo y la fiscalía. Las demás entran solo con contraseña (el nodo de la demostración usa
 * `SIGILO_MFA=opcional`), así el recorrido principal no cambia.
 */
export const DEMO_MFA_USERS: ReadonlySet<string> = new Set([
  'supervision-oic',
  'operacion.federal',
  'operacion.queretaro',
  'operacion.oaxaca',
  'fiscalia',
]);

/**
 * Cuentas marcadas con `requireMfa`: inscriben el segundo factor en su primer inicio de sesión,
 * para mostrar la inscripción en vivo.
 */
export const DEMO_MFA_ENROLLMENT_USERS: ReadonlySet<string> = new Set(['oic-programas']);

/** Cuenta que debe quedar con el segundo factor inscrito antes de arrancar el nodo. */
export interface DemoMfaProvision {
  accountId: string;
  username: string;
  secret: Uint8Array;
}

/** Segundo factor de las cuentas de la demostración. */
export interface DemoMfaOptions {
  /** Usuarios con el factor ya inscrito (`DEMO_MFA_USERS`). */
  enrolled?: ReadonlySet<string>;
  /** Usuarios que lo inscriben al entrar (`DEMO_MFA_ENROLLMENT_USERS`). */
  requireEnrollment?: ReadonlySet<string>;
  /** Secreto de cada usuario inscrito; por omisión, aleatorio. Las pruebas E2E fijan uno. */
  secretFor?: (username: string) => Uint8Array;
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
 * cuenta recibe un seudónimo aleatorio nuevo. Devuelve también las cuentas cuyo segundo factor hay
 * que inscribir (`provisionMfaInDataDir`) antes de arrancar el nodo.
 * Seguridad: el archivo de cuentas solo guarda digestos; las credenciales en claro son para la
 * demostración y nunca se versionan.
 */
export function buildDemoAccounts(
  options: {
    passwordFor?: (username: string) => string;
    logN?: number;
    node?: DemoAccountsNode;
    mfa?: DemoMfaOptions;
  } = {},
): { file: AuthorityAccountsFile; credentials: DemoCredential[]; mfa: DemoMfaProvision[] } {
  const passwordFor = options.passwordFor ?? (() => randomDemoPassword());
  const logN = options.logN ?? DEFAULT_SCRYPT_LOG_N;
  const node = NODE_ACCOUNTS[options.node ?? 'federal'];
  const enrolled = options.mfa?.enrolled ?? DEMO_MFA_USERS;
  const requireEnrollment = options.mfa?.requireEnrollment ?? DEMO_MFA_ENROLLMENT_USERS;
  const secretFor = options.mfa?.secretFor ?? (() => generateTotpSecret());
  const mfa: DemoMfaProvision[] = [];
  const credentials: DemoCredential[] = [];
  const accounts = node.users.map((user) => {
    const accountId = `acct-${toHex(randomBytes(8))}`;
    const password = passwordFor(user.username);
    const isRequired = requireEnrollment.has(user.username);
    const credential: DemoCredential = {
      ...user,
      password,
      ...(isRequired ? { requireMfa: true } : {}),
    };
    if (enrolled.has(user.username)) {
      const secret = secretFor(user.username);
      mfa.push({ accountId, username: user.username, secret });
      credential.mfaSecret = toBase32(secret);
    }
    credentials.push(credential);
    return {
      accountId,
      username: user.username,
      authorityId: user.authorityId,
      functions: [...user.functions],
      passwordHash: hashPassword(password, logN),
      ...(isRequired ? { requireMfa: true } : {}),
    };
  });
  return {
    file: {
      version: 1,
      inboxAuthorityId: node.inboxAuthorityId,
      authorities: node.authorities,
      accounts,
    },
    credentials,
    mfa,
  };
}

/**
 * Agrega a cada credencial con segundo factor sus códigos de recuperación recién inscritos
 * (`provisionMfaInDataDir` los devuelve por cuenta).
 */
export function withRecoveryCodes(
  credentials: readonly DemoCredential[],
  provisions: readonly DemoMfaProvision[],
  codes: ReadonlyMap<string, string[]>,
): DemoCredential[] {
  return credentials.map((credential) => {
    const provision = provisions.find((item) => item.username === credential.username);
    const recoveryCodes = provision === undefined ? undefined : codes.get(provision.accountId);
    return recoveryCodes === undefined ? credential : { ...credential, recoveryCodes };
  });
}
