// Pruebas del catálogo: lo que automatiza el validador y lo que declara no automatizar debe
// coincidir exactamente con `estandar/verificaciones.json`.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  CHECKS,
  getCheck,
  IMPLEMENTED_CHECK_IDS,
  loadCatalog,
  NOT_AUTOMATED_CHECK_IDS,
  result,
} from './catalog.ts';

const directory = mkdtempSync(join(tmpdir(), 'sigilo-catalogo-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function writeCatalog(name: string, content: unknown): string {
  const path = join(directory, name);
  writeFileSync(path, JSON.stringify(content));
  return path;
}

describe('catálogo cargado de estandar/verificaciones.json', () => {
  const standardIds = CHECKS.map((check) => check.id);

  it('cada verificación implementada existe en el estándar', () => {
    const missing = IMPLEMENTED_CHECK_IDS.filter((id) => !standardIds.includes(id));
    expect(missing).toEqual([]);
  });

  it('cada verificación del estándar está implementada o declarada como no automatizada', () => {
    const declared = new Set<string>([...IMPLEMENTED_CHECK_IDS, ...NOT_AUTOMATED_CHECK_IDS]);
    expect(standardIds.filter((id) => !declared.has(id))).toEqual([]);
    expect(NOT_AUTOMATED_CHECK_IDS.filter((id) => !standardIds.includes(id))).toEqual([]);
    const overlap = NOT_AUTOMATED_CHECK_IDS.filter((id) =>
      IMPLEMENTED_CHECK_IDS.some((implemented) => implemented === id),
    );
    expect(overlap).toEqual([]);
  });

  it('toma título, severidad y referencias del estándar', () => {
    const check = result('PRV-01', { status: 'cumple', summary: 'ok' });
    const definition = getCheck('PRV-01');
    expect(check.title).toBe(definition.title);
    expect(check.severity).toBe(definition.severity);
    expect(check.references).toEqual(definition.references);
    expect(() => getCheck('PRV-99')).toThrow('desconocida');
  });
});

describe('loadCatalog', () => {
  const entry = {
    id: 'PRV-01',
    perfil: 'privacidad',
    titulo: 'Cero terceros',
    modos: ['pasivo'],
    severidad: 'obligatoria',
    referencias: ['LGRA art. 91'],
    descripcion: 'Descripción de prueba suficientemente larga.',
  };

  it('lee una lista válida', () => {
    const checks = loadCatalog(
      writeCatalog('ok.json', { version: '1.0.0', verificaciones: [entry] }),
    );
    expect(checks).toEqual([
      {
        id: 'PRV-01',
        profile: 'privacidad',
        title: 'Cero terceros',
        modes: ['pasivo'],
        severity: 'obligatoria',
        references: ['LGRA art. 91'],
        description: 'Descripción de prueba suficientemente larga.',
      },
    ]);
  });

  it('rechaza ids repetidos, campos inválidos y documentos sin lista', () => {
    const repeated = writeCatalog('rep.json', { verificaciones: [entry, entry] });
    expect(() => loadCatalog(repeated)).toThrow('repite');
    const badMode = writeCatalog('modo.json', {
      verificaciones: [{ ...entry, modos: ['agresivo'] }],
    });
    expect(() => loadCatalog(badMode)).toThrow('modos');
    const badSeverity = writeCatalog('sev.json', {
      verificaciones: [{ ...entry, severidad: 'opcional' }],
    });
    expect(() => loadCatalog(badSeverity)).toThrow('severidad');
    expect(() => loadCatalog(writeCatalog('vacio.json', {}))).toThrow('verificaciones');
  });
});
