// Pruebas de las piezas de seguridad de las cuentas: digestos de contraseña, registro de
// autoridades y cuentas, sesiones con vencimiento y rechazo de caracteres invisibles (PRV-23).
import { describe, expect, it } from 'vitest';
import { createAuthorityRegistry, emptyAuthorityRegistry } from './authority-registry.ts';
import { hasInvisibleCharacters } from './invisible-text.ts';
import { hashPassword, parsePasswordHash, verifyPassword } from './passwords.ts';
import { createSessionStore } from './sessions.ts';

const PASSWORD = 'contraseña-sintética-de-prueba';

describe('digestos de contraseña', () => {
  it('verifica la contraseña correcta y rechaza otra o un digesto mal formado', async () => {
    const hash = hashPassword(PASSWORD, 10);
    expect(hash).toMatch(/^scrypt\$10\$8\$1\$/u);
    expect(hash).not.toContain(PASSWORD);
    await expect(verifyPassword(PASSWORD, hash)).resolves.toBe(true);
    await expect(verifyPassword(`${PASSWORD}x`, hash)).resolves.toBe(false);
    await expect(verifyPassword(PASSWORD, 'scrypt$10$8$1$corta$corta')).resolves.toBe(false);
    expect(parsePasswordHash('md5$abc')).toBeNull();
  });

  it('usa una sal distinta cada vez y normaliza la contraseña', async () => {
    expect(hashPassword(PASSWORD, 10)).not.toBe(hashPassword(PASSWORD, 10));
    const composed = 'contraseña-sintética';
    const hash = hashPassword(composed, 10);
    await expect(verifyPassword(composed.normalize('NFD'), hash)).resolves.toBe(true);
  });
});

function accountsFile(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    inboxAuthorityId: 'authority.buzon',
    authorities: [
      { authorityId: 'authority.buzon', name: 'Buzón', supervisorId: 'authority.supervisora' },
      { authorityId: 'authority.oic', name: 'OIC', supervisorId: 'authority.supervisora' },
      { authorityId: 'authority.supervisora', name: 'Supervisora' },
    ],
    accounts: [
      {
        accountId: 'acct-00000000000000aa',
        username: 'recepcion.uno',
        authorityId: 'authority.buzon',
        function: 'intake',
        passwordHash: hashPassword(PASSWORD, 10),
      },
    ],
    ...overrides,
  };
}

describe('registro de autoridades y cuentas', () => {
  it('encuentra cuentas por usuario y por seudónimo, y la supervisión', () => {
    const registry = createAuthorityRegistry(accountsFile(), { minScryptLogN: 10 });
    expect(registry.findByUsername('recepcion.uno')?.accountId).toBe('acct-00000000000000aa');
    expect(registry.findAccount('acct-00000000000000aa')?.functions).toEqual(['intake']);
    expect(registry.findByUsername('nadie')).toBeNull();
    expect(registry.supervisorOf('authority.oic')).toBe('authority.supervisora');
    expect(registry.supervisorAuthorityId).toBe('authority.supervisora');
    expect(registry.supervisedBy('authority.supervisora').sort()).toEqual([
      'authority.buzon',
      'authority.oic',
    ]);
    expect(registry.authority('authority.buzon')?.isInbox).toBe(true);
  });

  it('rechaza archivos incoherentes sin citar usuarios ni digestos', () => {
    const base = accountsFile();
    const cases: Record<string, unknown>[] = [
      { inboxAuthorityId: 'authority.no-existe' },
      { accounts: [...base.accounts, { ...base.accounts[0] }] },
      { accounts: [{ ...base.accounts[0], authorityId: 'authority.no-existe' }] },
      {
        authorities: [
          ...base.authorities,
          { authorityId: 'authority.otra', name: 'Otra', supervisorId: 'authority.oic' },
        ],
      },
      { accounts: [{ ...base.accounts[0], extra: 'campo' }] },
    ];
    for (const overrides of cases) {
      expect(() =>
        createAuthorityRegistry(accountsFile(overrides), { minScryptLogN: 10 }),
      ).toThrow();
    }
    // Un costo de scrypt menor que el mínimo se rechaza fuera de las pruebas.
    expect(() => createAuthorityRegistry(accountsFile())).toThrow('2^14');
    try {
      createAuthorityRegistry(accountsFile({ inboxAuthorityId: 'authority.no-existe' }));
    } catch (error) {
      expect(String(error)).not.toContain('recepcion.uno');
    }
  });

  it('sin archivo de cuentas el panel queda cerrado', () => {
    expect(emptyAuthorityRegistry().findByUsername('recepcion.uno')).toBeNull();
  });
});

describe('sesiones', () => {
  it('vencen por inactividad y por duración, y se cierran en el servidor', () => {
    let now = new Date('2026-11-05T10:00:00Z');
    const store = createSessionStore(() => now, { idleMs: 15 * 60_000, absoluteMs: 60 * 60_000 });
    const token = store.issue('acct-00000000000000aa');
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(store.resolve(token).status).toBe('active');
    // La actividad renueva la inactividad, pero no la duración total.
    for (let minute = 10; minute <= 50; minute += 10) {
      now = new Date(Date.parse('2026-11-05T10:00:00Z') + minute * 60_000);
      expect(store.resolve(token).status).toBe('active');
    }
    now = new Date('2026-11-05T11:00:00Z');
    expect(store.resolve(token)).toEqual({ status: 'expired', accountId: 'acct-00000000000000aa' });
    expect(store.resolve(token).status).toBe('missing');

    const idle = store.issue('acct-00000000000000aa');
    now = new Date(now.getTime() + 15 * 60_000);
    expect(store.resolve(idle).status).toBe('expired');

    const closed = store.issue('acct-00000000000000aa');
    expect(store.revoke(closed)).toBe('acct-00000000000000aa');
    expect(store.resolve(closed).status).toBe('missing');
    expect(store.resolve('').status).toBe('missing');
  });
});

describe('caracteres invisibles en los hechos (PRV-23)', () => {
  it('detecta marcas invisibles y deja pasar el texto limpio', () => {
    const marks = [
      '\u200B',
      '\u200D',
      '\u202E',
      '\u00AD',
      '\u2060',
      '\uFE0F',
      '\u00A0',
      '\u2009',
      '\u3164',
      '\u2800',
      '\u0007',
      '\r',
      '\u2028',
      '\uE000',
      '\u{E0041}',
    ];
    for (const mark of marks) {
      expect(
        hasInvisibleCharacters(`contrato${mark}ficticio`),
        mark.codePointAt(0)?.toString(16),
      ).toBe(true);
    }
    const clean =
      'El 9 de marzo, en la Secretaría «Ficticia», pidieron $1,500.\n\tNo había recibo: ¿por qué? ñ ü á 🙂';
    expect(hasInvisibleCharacters(clean)).toBe(false);
  });
});
