// Pruebas de la clasificación de URLs y de la política ética de peticiones.
import { describe, expect, it } from 'vitest';
import { classifyUrl, isLocalHost, registrableDomain } from './party.ts';
import {
  createRequestBudget,
  createRequestPolicy,
  isPrivateAddress,
  isPrivatePath,
} from './policy.ts';

const TARGET = new URL('https://dev-denuncias.ejemplo.org/');

describe('registrableDomain', () => {
  it('toma las dos últimas etiquetas o tres con sufijos de varios niveles', () => {
    expect(registrableDomain('dev-denuncias.ejemplo.org')).toBe('ejemplo.org');
    expect(registrableDomain('www.sitio.gob.mx')).toBe('sitio.gob.mx');
    expect(registrableDomain('127.0.0.1')).toBe('127.0.0.1');
    expect(registrableDomain('localhost')).toBe('localhost');
  });
});

describe('classifyUrl', () => {
  it('distingue propio, mismo sitio, tercero e incrustado', () => {
    expect(classifyUrl('https://dev-denuncias.ejemplo.org/a.js', TARGET)).toBe('propio');
    expect(classifyUrl('/relativa', TARGET)).toBe('propio');
    expect(classifyUrl('https://www.ejemplo.org/', TARGET)).toBe('mismo_sitio');
    expect(classifyUrl('https://api.mapbox.com/x', TARGET)).toBe('tercero');
    expect(classifyUrl('data:image/png;base64,AAAA', TARGET)).toBe('incrustado');
    expect(classifyUrl('blob:https://dev-denuncias.ejemplo.org/1', TARGET)).toBe('incrustado');
  });

  it('trata otro puerto del mismo host como mismo sitio, no como tercero', () => {
    const local = new URL('http://127.0.0.1:8787/');
    expect(classifyUrl('http://127.0.0.1:9000/x', local)).toBe('mismo_sitio');
    expect(classifyUrl('http://otro.example:8787/x', local)).toBe('tercero');
  });

  it('reconoce hosts locales', () => {
    expect(isLocalHost('127.0.0.1')).toBe(true);
    expect(isLocalHost('localhost')).toBe(true);
    expect(isLocalHost('ejemplo.org')).toBe(false);
  });
});

describe('createRequestPolicy', () => {
  const target = new URL('https://dev-denuncias.ejemplo.org/');
  const base = { url: 'https://dev-denuncias.ejemplo.org/x', resourceType: 'script' };
  const policyWith = (maxRequests: number, targetPages: string[] = []) =>
    createRequestPolicy({
      budget: createRequestBudget(maxRequests),
      target,
      targetPages,
      allowNonGet: false,
      allowThirdParty: false,
    });

  it('bloquea métodos distintos de GET, terceros y rutas privadas en modo pasivo', () => {
    const policy = policyWith(10);
    expect(policy.decide({ ...base, method: 'GET', party: 'propio' }).isAllowed).toBe(true);
    expect(policy.decide({ ...base, method: 'POST', party: 'propio' }).isAllowed).toBe(false);
    expect(policy.decide({ ...base, method: 'GET', party: 'tercero' }).isAllowed).toBe(false);
    expect(
      policy.decide({
        url: 'https://dev-denuncias.ejemplo.org/api/auth/session',
        resourceType: 'fetch',
        method: 'GET',
        party: 'propio',
      }).isAllowed,
    ).toBe(false);
    expect(policy.budget.count()).toBe(1);
  });

  it('bloquea navegaciones a rutas privadas salvo las páginas pedidas', () => {
    const policy = policyWith(10, ['https://dev-denuncias.ejemplo.org/admin/inicio']);
    const navigation = {
      method: 'GET',
      resourceType: 'document',
      party: 'propio' as const,
      isNavigation: true,
    };
    expect(
      policy.decide({ ...navigation, url: 'https://dev-denuncias.ejemplo.org/admin/panel' }),
    ).toEqual({ isAllowed: false, reason: 'ruta de autenticación o privada' });
    expect(
      policy.decide({ ...navigation, url: 'https://dev-denuncias.ejemplo.org/admin/inicio' })
        .isAllowed,
    ).toBe(true);
  });

  it('bloquea IP privadas si el sitio es público y las permite si el sitio es local', () => {
    const policy = policyWith(10);
    for (const host of ['10.0.0.5', '192.168.1.1', '169.254.169.254', '127.0.0.1', 'localhost']) {
      expect(
        policy.decide({ ...base, url: `http://${host}/x`, method: 'GET', party: 'mismo_sitio' }),
      ).toEqual({ isAllowed: false, reason: 'IP privada, local o de enlace local' });
    }
    const local = createRequestPolicy({
      budget: createRequestBudget(10),
      target: new URL('http://127.0.0.1:8787/'),
      allowNonGet: false,
      allowThirdParty: false,
    });
    expect(
      local.decide({ ...base, url: 'http://127.0.0.1:8787/x', method: 'GET', party: 'propio' })
        .isAllowed,
    ).toBe(true);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('[fe80::1]')).toBe(true);
  });

  it('no bloquea archivos estáticos cuya ruta contiene palabras como auth', () => {
    expect(isPrivatePath('https://x.org/_next/static/chunks/app/(auth)/page.js')).toBe(false);
    expect(isPrivatePath('https://x.org/api/login')).toBe(true);
  });

  it('comparte un solo tope entre todas las peticiones', () => {
    const budget = createRequestBudget(2);
    const policy = createRequestPolicy({
      budget,
      target,
      allowNonGet: false,
      allowThirdParty: false,
    });
    expect(budget.take()).toBe(true);
    expect(policy.decide({ ...base, method: 'GET', party: 'propio' }).isAllowed).toBe(true);
    const third = policy.decide({ ...base, method: 'GET', party: 'propio' });
    expect(third).toEqual({ isAllowed: false, reason: 'se alcanzó el tope de peticiones' });
    expect(budget.isLimitReached()).toBe(true);
  });
});
