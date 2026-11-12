// `sigilo cuenta nueva`: una cuenta individual del panel para una persona de una autoridad que
// aloja el nodo. Pide usuario, autoridad y funciones y devuelve una contraseña temporal; el
// archivo solo guarda su digesto scrypt. Reemplaza el paso manual con `accounts:generate`.
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
import { hashPassword } from '../../../../apps/server/src/security/passwords.ts';
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
  return 0;
}
