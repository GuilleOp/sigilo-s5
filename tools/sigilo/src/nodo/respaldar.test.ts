// Pruebas del respaldo cifrado y la restauración, sobre una instalación sintética mínima: ida y
// vuelta byte a byte (con la copia consistente de la base), restaurar sobre la instalación, frase
// equivocada, encabezado alterado, archivo truncado o ajeno, y rutas que intentan salir de la
// carpeta de destino.
import { createCipheriv, randomBytes, scryptSync } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { runProgram } from '../programa.ts';

const NOW = new Date('2026-11-12T16:00:00Z');
const PHRASE = 'ancla bambu cometa ciruela mapa trueno nube rio';
const OTHER_PHRASE = 'otra frase que no es la del respaldo ficticio';

/** Instalación mínima: registro, llaves, base con una fila, una prueba y la llave de enlace. */
function install(): string {
  const base = mkdtempSync(join(tmpdir(), 'sigilo-respaldo-prueba-'));
  for (const dir of ['config', 'datos/evidence', 'llaves']) {
    mkdirSync(join(base, dir), { recursive: true, mode: 0o700 });
  }
  writeFileSync(
    join(base, 'config', 'instalacion.json'),
    JSON.stringify({
      v: 1,
      tipo: 'nodo',
      nodeId: 'node.oaxaca',
      slug: 'oaxaca',
      estado: { code: '20', name: 'Oaxaca' },
      institucion: 'Institución ficticia',
      nombreNodo: 'Nodo ficticio',
      dominio: 'denuncias.ejemplo.invalid',
      tls: 'proxy',
      buzonId: 'authority.buzon-oaxaca',
      instalado: '2026-11-01',
      version: '1.1.0',
    }),
  );
  writeFileSync(join(base, 'datos', 'keys.json'), '{"llave":"sintética"}', { mode: 0o600 });
  writeFileSync(join(base, 'datos', 'evidence', 'a'.repeat(32)), randomBytes(500), {
    mode: 0o600,
  });
  writeFileSync(join(base, 'llaves', 'enlace-key.json'), '{"enlace":"sintético"}', {
    mode: 0o600,
  });
  // Archivos que nunca entran: la base viva va por VACUUM INTO, el candado y los temporales no.
  writeFileSync(join(base, 'datos', 'server.lock'), 'pid');
  writeFileSync(join(base, 'datos', 'algo.tmp'), 'temporal');
  const db = new DatabaseSync(join(base, 'datos', 'sigilo.db'));
  db.exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('fila sintética');");
  db.close();
  return base;
}

async function run(base: string, argv: string[], env: Record<string, string> = {}) {
  let text = '';
  const code = await runProgram(argv, {
    base,
    env: { SIGILO_RESPALDO_SCRYPT_LOGN: '14', SIGILO_FRASE_RESPALDO: PHRASE, ...env },
    output: { write: (chunk) => void (text += chunk) },
    interactive: false,
    now: () => NOW,
    fetch: () => Promise.reject(new Error('sin red en las pruebas')),
  });
  return { code, text };
}

async function backupOf(base: string): Promise<string> {
  const result = await run(base, ['respaldar']);
  expect(result.code, result.text).toBe(0);
  const name = readdirSync(join(base, 'salida', 'respaldos')).find((file) =>
    file.endsWith('.respaldo'),
  );
  if (name === undefined) throw new Error('Sin respaldo.');
  return join(base, 'salida', 'respaldos', name);
}

/** Respaldo con el mismo formato y la misma frase, pero con los archivos que se quieran. */
function craftBackup(path: string, files: { ruta: string; datos: string }[]): void {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const headerText = JSON.stringify({
    kdf: { name: 'scrypt', logN: 14, r: 8, p: 1, salt: salt.toString('base64') },
    iv: iv.toString('base64'),
    creado: NOW.toISOString(),
    nodeId: 'node.oaxaca',
  });
  const key = scryptSync(PHRASE, salt, 32, { N: 2 ** 14, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(headerText, 'utf8'));
  const archive = {
    v: 1,
    archivos: files.map((file) => ({
      ruta: file.ruta,
      modo: 0o600,
      datos: Buffer.from(file.datos).toString('base64'),
    })),
  };
  const body = Buffer.concat([
    cipher.update(gzipSync(Buffer.from(JSON.stringify(archive)))),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  writeFileSync(path, Buffer.concat([Buffer.from(`SIGILO-RESPALDO-1\n${headerText}\n`), body]));
}

describe('respaldo y restauración', () => {
  it('ida y vuelta: restaura los mismos bytes, con permisos privados y la base consistente', async () => {
    const base = install();
    const file = await backupOf(base);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    // El respaldo no contiene nada en claro.
    expect(readFileSync(file).includes(Buffer.from('sintética'))).toBe(false);
    const restored = await run(base, ['restaurar', file]);
    expect(restored.code, restored.text).toBe(0);
    const target = join(base, 'salida', 'restauracion-2026-11-12');
    for (const path of [
      'config/instalacion.json',
      'datos/keys.json',
      `datos/evidence/${'a'.repeat(32)}`,
      'llaves/enlace-key.json',
    ]) {
      expect(readFileSync(join(target, path)), path).toEqual(readFileSync(join(base, path)));
      expect(statSync(join(target, path)).mode & 0o077, path).toBe(0);
    }
    for (const skipped of ['datos/server.lock', 'datos/algo.tmp']) {
      expect(existsSync(join(target, skipped)), skipped).toBe(false);
    }
    const db = new DatabaseSync(join(target, 'datos', 'sigilo.db'), { readOnly: true });
    expect(db.prepare('SELECT v FROM t').get()).toEqual({ v: 'fila sintética' });
    db.close();
  });

  it('con --sobrescribir devuelve la instalación al estado del respaldo', async () => {
    const base = install();
    const file = await backupOf(base);
    writeFileSync(join(base, 'datos', 'keys.json'), '{"llave":"cambiada"}');
    const restored = await run(base, ['restaurar', file, '--sobrescribir']);
    expect(restored.code, restored.text).toBe(0);
    expect(readFileSync(join(base, 'datos', 'keys.json'), 'utf8')).toBe('{"llave":"sintética"}');
  });

  it('sin frase, con una corta o con otra frase no abre ni escribe nada', async () => {
    const base = install();
    const file = await backupOf(base);
    const target = join(base, 'salida', 'restauracion-2026-11-12');
    const missing = await run(base, ['restaurar', file], { SIGILO_FRASE_RESPALDO: '' });
    expect(missing.code).toBe(1);
    expect(missing.text).toContain('Falta la frase');
    const short = await run(base, ['restaurar', file], {
      SIGILO_FRASE_RESPALDO: 'tres palabras nada',
    });
    expect(short.code).toBe(1);
    expect(short.text).toContain('muy corta');
    const wrong = await run(base, ['restaurar', file], { SIGILO_FRASE_RESPALDO: OTHER_PHRASE });
    expect(wrong.code).toBe(1);
    expect(wrong.text).toContain('La frase no abre este respaldo');
    expect(existsSync(target)).toBe(false);
  });

  it('un encabezado alterado (fecha o nodo) rompe el respaldo aunque la frase sea la correcta', async () => {
    const base = install();
    const file = await backupOf(base);
    const original = readFileSync(file);
    const altered = Buffer.from(
      original.toString('latin1').replace('"nodeId":"node.oaxaca"', '"nodeId":"node.ajenos"'),
      'latin1',
    );
    expect(altered.equals(original)).toBe(false);
    writeFileSync(file, altered);
    const result = await run(base, ['respaldar', '--verificar', file]);
    expect(result.code).toBe(1);
    expect(result.text).toContain('La frase no abre este respaldo');
  });

  it('un archivo truncado, sin encabezado o ajeno se rechaza con un mensaje claro', async () => {
    const base = install();
    const file = await backupOf(base);
    const bytes = readFileSync(file);
    const firstLine = bytes.indexOf(0x0a) + 1;
    const cases: [string, Buffer][] = [
      ['ajeno', Buffer.from('no soy un respaldo')],
      ['solo el prefijo', bytes.subarray(0, firstLine)],
      ['encabezado a medias', bytes.subarray(0, firstLine + 20)],
      ['encabezado sin cuerpo', bytes.subarray(0, bytes.indexOf(0x0a, firstLine) + 1)],
      ['cuerpo truncado', bytes.subarray(0, bytes.length - 40)],
      ['cuerpo con bytes de más', Buffer.concat([bytes, Buffer.from([0])])],
    ];
    for (const [label, content] of cases) {
      writeFileSync(file, content);
      const result = await run(base, ['respaldar', '--verificar', file]);
      expect(result.code, label).toBe(1);
      expect(result.text, label).not.toContain('Error inesperado');
    }
  });

  it('ninguna ruta del respaldo sale de la carpeta de destino, y no se escribe nada', async () => {
    const base = install();
    const file = join(base, 'salida', 'malicioso.respaldo');
    mkdirSync(join(base, 'salida'), { recursive: true });
    for (const ruta of ['../fuera.txt', '/tmp/sigilo-absoluta.txt', 'datos/../../fuera.txt', '']) {
      craftBackup(file, [
        { ruta: 'datos/keys.json', datos: '{"llave":"del respaldo malicioso"}' },
        { ruta, datos: 'fuera' },
      ]);
      const result = await run(base, ['restaurar', file, '--sobrescribir']);
      expect(result.code, ruta).toBe(1);
      expect(result.text, ruta).toContain('Ruta inválida');
      // Ni siquiera el archivo válido que venía antes: la restauración es todo o nada.
      expect(readFileSync(join(base, 'datos', 'keys.json'), 'utf8'), ruta).toBe(
        '{"llave":"sintética"}',
      );
    }
    expect(existsSync(join(base, 'fuera.txt'))).toBe(false);
    expect(existsSync(join(base, '..', 'fuera.txt'))).toBe(false);
  });
});
