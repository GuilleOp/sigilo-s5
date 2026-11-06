// Autoridades del nodo y cuentas individuales de su personal, leídas del archivo local de cuentas
// (`authority-accounts.json`, que no se versiona). Ninguna cuenta se comparte.
import { readFileSync } from 'node:fs';
import { AuthorityAccountsFileSchema } from '@sigilo/contracts';
import type {
  AuthorityAccountRecord,
  AuthorityAccountsFile,
  AuthorityAccountView,
  AuthorityProfile,
} from '@sigilo/contracts';
import { MIN_SCRYPT_LOG_N, parsePasswordHash } from './passwords.ts';

/** Cuenta individual tal como la usa el servidor. */
export type AuthorityAccount = AuthorityAccountRecord;

/** Autoridades y cuentas del nodo. */
export interface AuthorityRegistry {
  /** Buzón general del nodo: recibe las denuncias nuevas y las turna. */
  inboxAuthorityId: string;
  /** Autoridad que custodia la llave de la supervisora (segunda llave), si la hay. */
  supervisorAuthorityId: string | null;
  authority(authorityId: string): AuthorityProfile | null;
  listAuthorities(): AuthorityProfile[];
  /** Supervisora de una autoridad, o `null` si no tiene. */
  supervisorOf(authorityId: string): string | null;
  /** Persona titular de la autoridad (para revisar el conflicto de interés), o `null`. */
  headOf(authorityId: string): { fullName: string; institution: string; stateCode: string } | null;
  /** Autoridades que supervisa `authorityId` (sin incluirla). */
  supervisedBy(authorityId: string): string[];
  findByUsername(username: string): AuthorityAccount | null;
  findAccount(accountId: string): AuthorityAccount | null;
}

/** Vista pública de una cuenta: seudónimo, autoridad y función. */
export function accountView(account: AuthorityAccount): AuthorityAccountView {
  return {
    accountId: account.accountId,
    authorityId: account.authorityId,
    function: account.function,
  };
}

/** Opciones de validación del archivo de cuentas. */
export interface RegistryOptions {
  /** Costo mínimo de scrypt de los digestos (`MIN_SCRYPT_LOG_N`); las pruebas usan menos. */
  minScryptLogN?: number;
}

/**
 * Valida el archivo de cuentas y construye el registro.
 * Lanza error si el formato no es válido, si se repite un usuario, un seudónimo o una autoridad,
 * si una cuenta o una supervisión apunta a una autoridad que no existe, si el buzón general no es
 * una autoridad del nodo, si hay más de una autoridad supervisora (el nodo tiene una sola segunda
 * llave) o si un digesto tiene un costo menor que el mínimo.
 * Seguridad: los mensajes nunca citan usuarios ni digestos.
 */
export function createAuthorityRegistry(
  raw: unknown,
  options: RegistryOptions = {},
): AuthorityRegistry {
  const parsed = AuthorityAccountsFileSchema.safeParse(raw);
  if (!parsed.success) throw new Error('El archivo de cuentas no tiene el formato esperado.');
  const file: AuthorityAccountsFile = parsed.data;
  const minLogN = options.minScryptLogN ?? MIN_SCRYPT_LOG_N;
  const authorities = new Map<string, AuthorityProfile>();
  for (const item of file.authorities) {
    if (authorities.has(item.authorityId)) throw new Error('Hay una autoridad repetida.');
    authorities.set(item.authorityId, {
      authorityId: item.authorityId,
      name: item.name,
      ...(item.supervisorId === undefined ? {} : { supervisorId: item.supervisorId }),
      isInbox: item.authorityId === file.inboxAuthorityId,
    });
  }
  if (!authorities.has(file.inboxAuthorityId)) {
    throw new Error('El buzón general no es una autoridad del nodo.');
  }
  const supervisors = new Set<string>();
  for (const profile of authorities.values()) {
    if (profile.supervisorId === undefined) continue;
    if (!authorities.has(profile.supervisorId) || profile.supervisorId === profile.authorityId) {
      throw new Error('Una autoridad tiene una supervisora que no existe.');
    }
    supervisors.add(profile.supervisorId);
  }
  if (supervisors.size > 1) {
    throw new Error(
      'El nodo tiene una sola llave de supervisora: todas las autoridades deben compartir supervisora.',
    );
  }
  const byUsername = new Map<string, AuthorityAccount>();
  const byId = new Map<string, AuthorityAccount>();
  for (const account of file.accounts) {
    if (byUsername.has(account.username) || byId.has(account.accountId)) {
      throw new Error('Hay una cuenta repetida.');
    }
    if (!authorities.has(account.authorityId)) {
      throw new Error('Una cuenta pertenece a una autoridad que no existe.');
    }
    const hash = parsePasswordHash(account.passwordHash);
    if (hash === null || hash.logN < minLogN) {
      throw new Error(
        `Una contraseña tiene un digesto inválido o con costo menor que 2^${minLogN}.`,
      );
    }
    byUsername.set(account.username, account);
    byId.set(account.accountId, account);
  }
  const supervisorAuthorityId = [...supervisors][0] ?? null;
  const heads = new Map(
    file.authorities.flatMap((item) =>
      item.head === undefined ? [] : [[item.authorityId, item.head] as const],
    ),
  );
  return {
    inboxAuthorityId: file.inboxAuthorityId,
    supervisorAuthorityId,
    authority: (authorityId) => authorities.get(authorityId) ?? null,
    listAuthorities: () => [...authorities.values()],
    supervisorOf: (authorityId) => authorities.get(authorityId)?.supervisorId ?? null,
    headOf: (authorityId) => heads.get(authorityId) ?? null,
    supervisedBy: (authorityId) =>
      [...authorities.values()]
        .filter((profile) => profile.supervisorId === authorityId)
        .map((profile) => profile.authorityId),
    findByUsername: (username) => byUsername.get(username) ?? null,
    findAccount: (accountId) => byId.get(accountId) ?? null,
  };
}

/** Registro sin cuentas: el panel de autoridad queda cerrado (toda petición responde 401). */
export function emptyAuthorityRegistry(): AuthorityRegistry {
  return createAuthorityRegistry({
    version: 1,
    inboxAuthorityId: 'authority.inbox',
    authorities: [{ authorityId: 'authority.inbox', name: 'Buzón general' }],
    accounts: [],
  });
}

/** Lee y valida el archivo de cuentas. Lanza error si falta o no es válido. */
export function loadAuthorityRegistry(path: string): AuthorityRegistry {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(
      'No se pudo leer el archivo de cuentas de la autoridad; ejecuta npm run accounts:generate.',
    );
  }
  return createAuthorityRegistry(raw);
}
