// Pruebas del material del segundo factor: la llave del nodo (0600), el cifrado en reposo del
// secreto TOTP ligado a su cuenta y los códigos de recuperación de un solo uso.
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database.ts';
import { createMfaRepository } from '../db/mfa-repository.ts';
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  loadOrCreateMfaKey,
  matchRecoveryCode,
  MFA_KEY_FILE,
  normalizeRecoveryCode,
} from './mfa-secrets.ts';
import { generateTotpSecret, toBase32 } from './totp.ts';

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sigilo-mfa-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('llave del segundo factor', () => {
  it('se crea 0600 la primera vez y después se reutiliza', () => {
    const dir = tempDir();
    const first = loadOrCreateMfaKey(dir);
    expect(first).toHaveLength(32);
    expect(statSync(join(dir, MFA_KEY_FILE)).mode & 0o777).toBe(0o600);
    expect(loadOrCreateMfaKey(dir)).toEqual(first);
  });

  it('se rechaza si el grupo u otros pueden leerla, o si es corta', () => {
    const dir = tempDir();
    loadOrCreateMfaKey(dir);
    chmodSync(join(dir, MFA_KEY_FILE), 0o640);
    expect(() => loadOrCreateMfaKey(dir)).toThrow(/0600/u);
    writeFileSync(join(dir, MFA_KEY_FILE), 'AAAA\n', { mode: 0o600 });
    chmodSync(join(dir, MFA_KEY_FILE), 0o600);
    expect(() => loadOrCreateMfaKey(dir)).toThrow(/32 bytes/u);
  });
});

describe('secreto TOTP cifrado en reposo', () => {
  it('ida y vuelta con la misma llave y la misma cuenta', () => {
    const key = loadOrCreateMfaKey(tempDir());
    const secret = generateTotpSecret();
    const sealed = encryptTotpSecret(key, 'acct-0000000000000001', secret);
    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
    expect(decryptTotpSecret(key, 'acct-0000000000000001', sealed)).toEqual(secret);
    // Dos cifrados del mismo secreto no se parecen (IV aleatorio).
    expect(encryptTotpSecret(key, 'acct-0000000000000001', secret)).not.toBe(sealed);
  });

  it('no descifra con otra llave, en otra cuenta ni alterado', () => {
    const key = loadOrCreateMfaKey(tempDir());
    const other = loadOrCreateMfaKey(tempDir());
    const sealed = encryptTotpSecret(key, 'acct-0000000000000001', generateTotpSecret());
    expect(() => decryptTotpSecret(other, 'acct-0000000000000001', sealed)).toThrow();
    expect(() => decryptTotpSecret(key, 'acct-0000000000000002', sealed)).toThrow();
    const tampered = `${sealed.slice(0, -2)}${sealed.endsWith('A') ? 'B' : 'A'}${sealed.slice(-1)}`;
    expect(() => decryptTotpSecret(key, 'acct-0000000000000001', tampered)).toThrow();
    expect(() => decryptTotpSecret(key, 'acct-0000000000000001', 'v2.a.b')).toThrow(/formato/u);
  });

  it('la base guarda solo el cifrado: ni el secreto en bytes ni en Base32', () => {
    const dir = tempDir();
    const key = loadOrCreateMfaKey(dir);
    const path = join(dir, 'sigilo.db');
    const db = openDatabase(path);
    const secret = generateTotpSecret();
    const { set } = generateRecoveryCodes(10);
    createMfaRepository(db).insert({
      accountId: 'acct-0000000000000001',
      secretSealed: encryptTotpSecret(key, 'acct-0000000000000001', secret),
      lastStep: 0,
      recovery: set,
      enrolledAt: '2026-11-12T10:00Z',
    });
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    const stored = createMfaRepository(db).find('acct-0000000000000001');
    db.close();
    const bytes = readFileSync(path);
    expect(bytes.includes(Buffer.from(toBase32(secret)))).toBe(false);
    expect(bytes.includes(Buffer.from(secret))).toBe(false);
    expect(stored).not.toBeNull();
    expect(decryptTotpSecret(key, 'acct-0000000000000001', stored?.secretSealed ?? '')).toEqual(
      secret,
    );
  });
});

describe('códigos de recuperación', () => {
  it('son 10, distintos, con forma XXXXX-XXXXX, y se guardan solo como digestos', async () => {
    const { codes, set } = generateRecoveryCodes(10);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/u);
    expect(set.hashes).toHaveLength(10);
    expect(JSON.stringify(set)).not.toContain(codes[0]?.replace('-', '') ?? 'x');
    expect(await matchRecoveryCode(set, codes[3] ?? '')).toBe(3);
  });

  it('acepta minúsculas, espacios y sin guion, y rechaza los que no son de la cuenta', async () => {
    const { codes, set } = generateRecoveryCodes(10);
    const code = codes[0] ?? '';
    expect(normalizeRecoveryCode(` ${code.toLowerCase()} `)).toBe(code.replace('-', ''));
    expect(await matchRecoveryCode(set, code.replace('-', ' ').toLowerCase())).toBe(0);
    const other = generateRecoveryCodes(10).codes[0] ?? '';
    expect(await matchRecoveryCode(set, other)).toBeNull();
    expect(await matchRecoveryCode(set, '123456')).toBeNull();
    expect(normalizeRecoveryCode('ABCDE-0000')).toBeNull();
  });

  it('un código usado ya no coincide', async () => {
    const { codes, set } = generateRecoveryCodes(10);
    set.hashes[2] = null;
    expect(await matchRecoveryCode(set, codes[2] ?? '')).toBeNull();
    expect(await matchRecoveryCode(set, codes[1] ?? '')).toBe(1);
  });
});
