// Coherencia de estandar/verificaciones.json: forma según su JSON Schema e identificadores, títulos
// y modos iguales a los de los perfiles de privacidad y de seguridad.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const STANDARD_DIR = resolve(import.meta.dirname, '..', 'estandar');

/** Identificadores que el brief fija para el validador; no pueden faltar ni renombrarse. */
const REQUIRED_IDS = [
  ...Array.from({ length: 15 }, (_, index) => `PRV-${String(index + 1).padStart(2, '0')}`),
  'API-01',
  'API-02',
];

const CheckSchema = z.object({
  id: z.string(),
  perfil: z.enum(['privacidad', 'seguridad']),
  titulo: z.string(),
  modos: z.array(z.enum(['pasivo', 'conformidad'])),
  severidad: z.enum(['obligatoria', 'recomendada']),
});
const ChecksFileSchema = z.object({ verificaciones: z.array(CheckSchema) });

/** Sección de un perfil: identificador, título sin comillas invertidas y cuerpo. */
interface ProfileSection {
  id: string;
  title: string;
  body: string;
}

function readText(name: string): string {
  return readFileSync(join(STANDARD_DIR, name), 'utf8');
}

function readJson(name: string): unknown {
  return JSON.parse(readText(name));
}

/** Secciones `### XXX-nn Título` de un perfil, en orden. */
function profileSections(name: string): ProfileSection[] {
  const text = readText(name);
  const heading = /^### ((?:PRV|API|SEC)-\d{2}) (.+)$/gm;
  const matches = [...text.matchAll(heading)];
  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    return {
      id: match[1] ?? '',
      title: (match[2] ?? '').replaceAll('`', '').trim(),
      body: text.slice(start, end),
    };
  });
}

/** Modos declarados en la línea `**Modo.**` de una sección del perfil de privacidad. */
function declaredModes(body: string): string[] {
  const line = /\*\*Modo\.\*\* (.+)/.exec(body)?.[1]?.toLowerCase() ?? '';
  return ['pasivo', 'conformidad'].filter((mode) => line.includes(mode));
}

const schema = z.fromJSONSchema(
  readJson('verificaciones.schema.json') as z.core.JSONSchema.JSONSchema,
);
const raw = readJson('verificaciones.json');
const checks = ChecksFileSchema.parse(raw).verificaciones;
const privacySections = profileSections('perfil-privacidad.md');
const securitySections = profileSections('perfil-seguridad.md');

describe('estandar/verificaciones.json', () => {
  it('cumple su JSON Schema', () => {
    expect(schema.safeParse(raw).success).toBe(true);
  });

  it('el esquema rechaza propiedades desconocidas, identificadores y modos inválidos', () => {
    const base = ChecksFileSchema.parse(structuredClone(raw));
    const first = base.verificaciones[0];
    expect(first).toBeDefined();
    const variants: unknown[] = [
      { ...base, verificaciones: [{ ...first, extra: true }] },
      { ...base, verificaciones: [{ ...first, id: 'PRV-1' }] },
      { ...base, verificaciones: [{ ...first, modos: ['activo'] }] },
      { ...base, verificaciones: [{ ...first, severidad: 'opcional' }] },
    ];
    for (const variant of variants) expect(schema.safeParse(variant).success).toBe(false);
  });

  it('no repite identificadores', () => {
    const ids = checks.map((check) => check.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('incluye los identificadores compartidos con el validador', () => {
    const ids = new Set(checks.map((check) => check.id));
    for (const id of REQUIRED_IDS) expect(ids).toContain(id);
  });

  it('tiene exactamente las verificaciones del perfil de privacidad, con su título y modos', () => {
    const privacyChecks = checks.filter((check) => check.perfil === 'privacidad');
    expect(privacyChecks.map((check) => check.id).sort()).toEqual(
      privacySections.map((section) => section.id).sort(),
    );
    for (const section of privacySections) {
      const check = privacyChecks.find((candidate) => candidate.id === section.id);
      expect(check?.titulo, section.id).toBe(section.title);
      expect([...(check?.modos ?? [])].sort(), section.id).toEqual(
        declaredModes(section.body).sort(),
      );
    }
  });

  it('solo incluye verificaciones de seguridad automatizables (automáticas o pendientes de automatizar)', () => {
    const securityChecks = checks.filter((check) => check.perfil === 'seguridad');
    expect(securityChecks.length).toBeGreaterThan(0);
    for (const check of securityChecks) {
      expect(check.id.startsWith('SEC-'), check.id).toBe(true);
      const section = securitySections.find((candidate) => candidate.id === check.id);
      expect(section, check.id).toBeDefined();
      expect(section?.body, check.id).toMatch(
        /\*\*Verificación\.\*\* (?:Auto|Manual \(pendiente de automatizar\))/,
      );
    }
  });

  it('los perfiles no repiten identificadores', () => {
    for (const sections of [privacySections, securitySections]) {
      const ids = sections.map((section) => section.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
