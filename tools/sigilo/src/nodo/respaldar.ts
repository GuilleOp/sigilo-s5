// `sigilo respaldar`: respaldo cifrado del nodo con el nodo en marcha. Copia consistente de la base
// (`VACUUM INTO` de SQLite), las llaves, la configuración y las pruebas cifradas, comprimidos y
// cifrados con AES-256-GCM bajo una llave scrypt de una frase de 8 palabras que se anota en papel.
// `--verificar <archivo>` lo abre y lista su contenido; `restaurar <archivo>` lo extrae a una
// carpeta nueva (o, con `--sobrescribir`, sobre la instalación, con el nodo detenido).
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync, gzipSync } from 'node:zlib';
import { z } from 'zod';
import { generateReceiptPhrase, normalizeWord } from '@sigilo/core';
import { CliError, ensureDir, flag, hasFlag, todayOf, writeText } from '../base.ts';
import type { Context } from '../base.ts';
import { nodePaths, readInstallRecord } from './comun.ts';

const MAGIC = 'SIGILO-RESPALDO-1\n';
/** Costo de scrypt por omisión: 2^17 (128 MiB de memoria). */
const DEFAULT_LOG_N = 17;
const MIN_LOG_N = 14;

const HeaderSchema = z
  .object({
    kdf: z
      .object({
        name: z.literal('scrypt'),
        logN: z.number().int().min(MIN_LOG_N).max(20),
        r: z.literal(8),
        p: z.literal(1),
        salt: z.string(),
      })
      .strict(),
    iv: z.string(),
    creado: z.string(),
    nodeId: z.string(),
  })
  .strict();

const ArchiveSchema = z
  .object({
    v: z.literal(1),
    archivos: z.array(
      z.object({ ruta: z.string(), modo: z.number().int(), datos: z.string() }).strict(),
    ),
  })
  .strict();

function deriveKey(phrase: string, salt: Buffer, logN: number): Buffer {
  const normalized = phrase
    .split(/[\s·,-]+/u)
    .filter((word) => word !== '')
    .map(normalizeWord)
    .join(' ');
  if (normalized.split(' ').length < 6) throw new CliError('La frase del respaldo es muy corta.');
  const N = 2 ** logN;
  return scryptSync(normalized, salt, 32, {
    N,
    r: 8,
    p: 1,
    maxmem: 256 * N * 8 + 16 * 1024 * 1024,
  });
}

function listFiles(root: string, directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(root, path);
    return entry.isFile() ? [relative(root, path)] : [];
  });
}

/** Archivos que entran al respaldo (rutas relativas a la instalación). */
function backupFiles(ctx: Context): string[] {
  const skip = /^datos\/(sigilo\.db(-wal|-shm)?|server\.lock)$|\.tmp$/u;
  const included = [
    ...['red.json', '.env'].filter((name) => existsSync(join(ctx.base, name))),
    ...listFiles(ctx.base, join(ctx.base, 'config')),
    ...listFiles(ctx.base, join(ctx.base, 'datos')),
    ...listFiles(ctx.base, join(ctx.base, 'llaves')),
  ];
  return included.map((path) => path.split(sep).join('/')).filter((path) => !skip.test(path));
}

function phraseFor(ctx: Context): { phrase: string; isNew: boolean } {
  const file = flag(ctx, 'frase-de-archivo');
  if (file !== undefined) return { phrase: readFileSync(file, 'utf8').trim(), isNew: false };
  const given = ctx.env.SIGILO_FRASE_RESPALDO ?? '';
  if (given !== '') return { phrase: given, isNew: false };
  return { phrase: generateReceiptPhrase().words.join(' '), isNew: true };
}

/** Respalda. Devuelve 0. */
export function backup(ctx: Context): number {
  const { screen } = ctx;
  const record = readInstallRecord(ctx);
  const paths = nodePaths(ctx);
  screen.line(`Respaldo del nodo ${record.nodeId}`);
  const entries: { ruta: string; modo: number; datos: string }[] = [];
  if (existsSync(paths.database)) {
    // Copia consistente con el nodo en marcha: SQLite escribe una base nueva y completa.
    const scratch = mkdtempSync(join(tmpdir(), 'sigilo-respaldo-'));
    try {
      const copy = join(scratch, 'sigilo.db');
      const db = new DatabaseSync(paths.database, { readOnly: true });
      try {
        db.exec(`VACUUM INTO '${copy.replace(/'/gu, "''")}'`);
      } finally {
        db.close();
      }
      const bytes = readFileSync(copy);
      entries.push({ ruta: 'datos/sigilo.db', modo: 0o600, datos: bytes.toString('base64') });
      screen.ok(
        `Copia consistente de la base (VACUUM INTO) · ${(bytes.length / 1048576).toFixed(1)} MB`,
      );
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
  for (const path of backupFiles(ctx)) {
    const full = join(ctx.base, path);
    entries.push({
      ruta: path,
      modo: statSync(full).mode & 0o777,
      datos: readFileSync(full).toString('base64'),
    });
  }
  screen.ok(`Llaves, configuración y pruebas cifradas · ${entries.length} archivos`);
  const { phrase, isNew } = phraseFor(ctx);
  const logN = Number(ctx.env.SIGILO_RESPALDO_SCRYPT_LOGN || DEFAULT_LOG_N);
  if (!Number.isInteger(logN) || logN < MIN_LOG_N || logN > 20) {
    throw new CliError(`SIGILO_RESPALDO_SCRYPT_LOGN debe estar entre ${MIN_LOG_N} y 20.`);
  }
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(phrase, salt, logN);
  const now = ctx.now().toISOString();
  const header = {
    kdf: {
      name: 'scrypt' as const,
      logN,
      r: 8 as const,
      p: 1 as const,
      salt: salt.toString('base64'),
    },
    iv: iv.toString('base64'),
    creado: now,
    nodeId: record.nodeId,
  };
  const headerText = JSON.stringify(header);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  // El encabezado (sin secretos) va autenticado: no se puede cambiar sin romper el respaldo.
  cipher.setAAD(Buffer.from(headerText, 'utf8'));
  const body = Buffer.concat([
    cipher.update(gzipSync(Buffer.from(JSON.stringify({ v: 1, archivos: entries }), 'utf8'))),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  key.fill(0);
  const stamp = now.slice(0, 16).replace(/[-:]/gu, '');
  const name = `sigilo-${record.slug}-${stamp}${flag(ctx, 'etiqueta') === undefined ? '' : `-${flag(ctx, 'etiqueta')}`}.respaldo`;
  ensureDir(paths.backups);
  const target = join(paths.backups, name);
  // Encabezado en texto (sin secretos) y cuerpo cifrado.
  writeText(target, Buffer.concat([Buffer.from(`${MAGIC}${headerText}\n`, 'utf8'), body]), 0o600);
  if (isNew) {
    screen.line('  Frase del respaldo (anótala en papel; sin ella no se puede abrir):');
    screen.line(`        ${phrase.split(' ').join(' · ')}`);
  }
  screen.ok(`salida/respaldos/${name} (cifrado)`);
  screen.line(
    `Llévalo fuera de este equipo. Puedes revisarlo con: ./sigilo respaldar --verificar salida/respaldos/${name}`,
  );
  return 0;
}

/** Abre un respaldo con la frase. Lanza `CliError` si la frase no es la correcta. */
export function openBackup(
  path: string,
  phrase: string,
): { nodeId: string; creado: string; files: { ruta: string; modo: number; datos: Buffer }[] } {
  const bytes = readFileSync(path);
  const magic = Buffer.from(MAGIC, 'utf8');
  if (!bytes.subarray(0, magic.length).equals(magic))
    throw new CliError('No es un respaldo de SIGILO.');
  const end = bytes.indexOf(0x0a, magic.length);
  const headerText = bytes.subarray(magic.length, end).toString('utf8');
  const header = HeaderSchema.parse(JSON.parse(headerText));
  const body = bytes.subarray(end + 1);
  const key = deriveKey(phrase, Buffer.from(header.kdf.salt, 'base64'), header.kdf.logN);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(header.iv, 'base64'));
  decipher.setAAD(Buffer.from(headerText, 'utf8'));
  decipher.setAuthTag(body.subarray(body.length - 16));
  let plain: Buffer;
  try {
    plain = Buffer.concat([decipher.update(body.subarray(0, body.length - 16)), decipher.final()]);
  } catch {
    throw new CliError('La frase no abre este respaldo (o el archivo está dañado).');
  } finally {
    key.fill(0);
  }
  const archive = ArchiveSchema.parse(JSON.parse(gunzipSync(plain).toString('utf8')));
  return {
    nodeId: header.nodeId,
    creado: header.creado,
    files: archive.archivos.map((item) => ({
      ruta: item.ruta,
      modo: item.modo,
      datos: Buffer.from(item.datos, 'base64'),
    })),
  };
}

function requiredPhrase(ctx: Context): string {
  const phrase = phraseFor(ctx);
  if (phrase.isNew) {
    throw new CliError('Falta la frase: usa --frase-de-archivo <archivo> o SIGILO_FRASE_RESPALDO.');
  }
  return phrase.phrase;
}

/** `sigilo respaldar --verificar <archivo>`. */
export function verifyBackup(ctx: Context, path: string): number {
  const opened = openBackup(path, requiredPhrase(ctx));
  ctx.screen.ok(
    `Respaldo de ${opened.nodeId} del ${opened.creado}: ${opened.files.length} archivos`,
  );
  for (const file of opened.files) ctx.screen.line(`    ${file.ruta}`);
  return 0;
}

/**
 * `sigilo restaurar <archivo>`: extrae a `salida/restauracion-<fecha>/` o, con `--sobrescribir`,
 * sobre la instalación (con el nodo detenido; el envoltorio lo detiene antes).
 */
export function restore(ctx: Context, path: string): number {
  const opened = openBackup(path, requiredPhrase(ctx));
  const target = hasFlag(ctx, 'sobrescribir')
    ? ctx.base
    : join(nodePaths(ctx).output, `restauracion-${todayOf(ctx)}`);
  const root = resolve(target);
  for (const file of opened.files) {
    const destination = resolve(root, file.ruta);
    // Seguridad: ninguna ruta del respaldo sale de la carpeta de destino.
    if (!destination.startsWith(`${root}${sep}`))
      throw new CliError('Ruta inválida en el respaldo.');
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    writeText(destination, file.datos, file.modo & 0o700);
  }
  ctx.screen.ok(
    `${opened.files.length} archivos restaurados en ${relative(ctx.base, root) || '.'}`,
  );
  return 0;
}
