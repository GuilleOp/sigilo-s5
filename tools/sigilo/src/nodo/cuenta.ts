// `sigilo cuenta nueva`: una cuenta individual del panel para una persona de una autoridad que
// aloja el nodo. Pide usuario, autoridad y funciones y devuelve una contraseña temporal; el
// archivo solo guarda su digesto scrypt. Reemplaza el paso manual con `accounts:generate`.
// `sigilo cuenta reiniciar-mfa <usuario>`: borra el segundo factor de una cuenta.
import { existsSync } from 'node:fs';
import {
  AuthorityAccountsFileSchema,
  AuthorityFunctionsSchema,
  SignedAuthorityDirectorySchema,
  UsernameSchema,
} from '@sigilo/contracts';
import type { AuthorityFunction } from '@sigilo/contracts';
import { randomBytes, toHex } from '@sigilo/core';
import { createAuthorityRegistry } from '../../../../apps/server/src/security/authority-registry.ts';
import { openDatabase } from '../../../../apps/server/src/db/database.ts';
import { hashPassword } from '../../../../apps/server/src/security/passwords.ts';
import { resetMfa } from '../../../../apps/server/src/services/mfa-provisioning.ts';
import { CliError, readJson, writeJson } from '../base.ts';
import type { Context } from '../base.ts';
import { nodePaths, readInstallRecord } from './comun.ts';
import { readablePassword } from './instalar.ts';

function parseFunctions(value: string): AuthorityFunction[] | null {
  const parsed = AuthorityFunctionsSchema.safeParse(
    value
      .split(/[,;\s]+/u)
      .map((item) => item.trim())
      .filter((item) => item !== ''),
  );
  return parsed.success ? parsed.data : null;
}

/** Crea la cuenta. Devuelve 0. */
export async function newAccount(ctx: Context): Promise<number> {
  const { screen, answers } = ctx;
  const record = readInstallRecord(ctx);
  const paths = nodePaths(ctx);
  const file = AuthorityAccountsFileSchema.parse(readJson(paths.accounts, 'las cuentas del nodo'));
  // Autoridades que el directorio aloja en este nodo (las que se pueden elegir además del buzón).
  const hosted = existsSync(paths.directory)
    ? SignedAuthorityDirectorySchema.parse(
        readJson(paths.directory, 'datos/directory.json'),
      ).directory.authorities.filter((item) => item.nodeId === record.nodeId)
    : [];
  const choices = new Map<string, string>(
    file.authorities.map((item) => [item.authorityId, item.name]),
  );
  for (const item of hosted) choices.set(item.id, item.name);
  screen.line('Cuenta nueva del panel');
  for (const [id, name] of choices) screen.line(`    ${id} · ${name}`);
  const username = await answers.ask({
    key: 'usuario',
    text: 'Usuario (minúsculas, dígitos, punto y guiones)',
    validate: (value) =>
      !UsernameSchema.safeParse(value).success
        ? 'Usuario inválido.'
        : file.accounts.some((item) => item.username === value)
          ? 'Ese usuario ya existe.'
          : null,
  });
  const authorityId = await answers.ask({
    key: 'autoridad',
    text: 'Autoridad de la cuenta',
    default: record.buzonId,
    validate: (value) => (choices.has(value) ? null : 'No es una autoridad de este nodo.'),
  });
  const functions = parseFunctions(
    await answers.ask({
      key: 'funciones',
      text: 'Funciones (intake, investigation, supervision, substantiation u operation; intake,investigation juntas)',
      validate: (value) =>
        parseFunctions(value) === null ? 'Combinación de funciones inválida.' : null,
    }),
  ) as AuthorityFunction[];
  const password = readablePassword();
  const next = AuthorityAccountsFileSchema.parse({
    ...file,
    authorities: file.authorities.some((item) => item.authorityId === authorityId)
      ? file.authorities
      : [...file.authorities, { authorityId, name: choices.get(authorityId) ?? authorityId }],
    accounts: [
      ...file.accounts,
      {
        accountId: `acct-${toHex(randomBytes(8))}`,
        username,
        authorityId,
        functions,
        passwordHash: hashPassword(password),
      },
    ],
  });
  try {
    createAuthorityRegistry(next);
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : 'Las cuentas no son válidas.');
  }
  writeJson(paths.accounts, next);
  screen.ok(`Cuenta «${username}» de ${authorityId} (${functions.join(', ')})`);
  screen.line('  Contraseña temporal (entrégala en persona; no se vuelve a mostrar):');
  screen.line(`        ${username} · ${password}`);
  screen.line(
    '  La persona entra con la llave de SU autoridad (la del directorio), no con la del buzón.',
  );
  screen.line(
    '  En su primer inicio de sesión, el panel le pide activar la verificación en dos pasos (app de autenticación) y le da 10 códigos de recuperación.',
  );
  return 0;
}

/**
 * `sigilo cuenta reiniciar-mfa <usuario>`: borra el segundo factor de una cuenta (por ejemplo, si
 * la persona perdió su teléfono y sus códigos de recuperación). Al volver a entrar, el panel le
 * pide inscribir uno nuevo. Queda `mfa_reset` en el registro de seguridad del nodo, sin secretos.
 * Devuelve 0.
 * Seguridad: lo corre la operación del nodo tras confirmar en persona quién lo pide; con la
 * política `requerido`, las sesiones abiertas de la cuenta dejan de servir para el panel.
 */
export async function resetAccountMfa(ctx: Context): Promise<number> {
  const { screen, answers } = ctx;
  readInstallRecord(ctx);
  const paths = nodePaths(ctx);
  const username = ctx.args.positional[0] ?? ctx.args.flags.get('usuario');
  if (username === undefined || !UsernameSchema.safeParse(username).success) {
    throw new CliError('Uso: ./sigilo cuenta reiniciar-mfa <usuario>');
  }
  const file = AuthorityAccountsFileSchema.parse(readJson(paths.accounts, 'las cuentas del nodo'));
  const account = file.accounts.find((item) => item.username === username);
  if (account === undefined) throw new CliError(`No hay una cuenta «${username}» en este nodo.`);
  const isConfirmed = await answers.confirm(
    'confirmo',
    `¿Reiniciar la verificación en dos pasos de «${username}»? Confirma antes, en persona, que lo pide su dueña.`,
    false,
  );
  if (!isConfirmed) throw new CliError('No se reinició nada (falta confirmar con --confirmo).');
  const db = openDatabase(paths.database);
  let wasEnrolled: boolean;
  try {
    wasEnrolled = resetMfa(db, account.accountId, ctx.now());
  } finally {
    db.close();
  }
  screen.ok(
    wasEnrolled
      ? `Segundo factor de «${username}» reiniciado (${account.accountId}); quedó en el registro de seguridad.`
      : `«${username}» no tenía segundo factor inscrito; el intento quedó en el registro de seguridad.`,
  );
  screen.line(
    '  Al volver a entrar, el panel le pedirá escanear un código QR nuevo y le dará códigos de recuperación nuevos.',
  );
  return 0;
}
