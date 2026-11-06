// Pruebas cruzadas de la normalización: TypeScript debe dar las mismas cadenas que datos/proceso.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { areaKey, institutionKey, institutionNameKey, textKey } from './normalize.ts';

const PROCESS_DIR = fileURLToPath(new URL('../../../datos/proceso', import.meta.url));

// Entradas sintéticas que ejercitan cada paso: acentos, abreviaturas, sufijos de sistema y de
// entidad, prefijos municipales, códigos de plaza, ligaduras y cadenas vacías.
const INSTITUTION_CASES: readonly (readonly [string, string])[] = [
  ['Secretaría de Obras de Villa Ejemplo', '17'],
  ['H. Ayuntamiento de Villa Ejemplo', '21'],
  ['Honorable Ayuntamiento Constitucional de Villa Ejemplo', '22'],
  ['Presidencia Municipal de Villa Ejemplo - ecatepec', '15'],
  ['Municipio Libre de Aguascalientes', '01'],
  ['Secretaría de Finanzas del Gobierno del Estado de Puebla', '21'],
  ['Instituto Estatal Ficticio del Estado Libre y Soberano de Querétaro Arteaga', '22'],
  ['Sria. de Salud Ficticia, Gro.', '12'],
  ['Inst. Nal. Ficticio de Servs. S1', '00'],
  ['Dir. Gral. de Admon. Ficticia*', '00'],
  ['Comisión Ficticia de Agua de Quintana Roo', '23'],
  ['Instituto Federal Ficticio de Equipamiento', '00'],
  ['Delegación Federal Ficticia de Programas Sociales', '00'],
  ['Ayuntamiento', '17'],
  ['Puebla', '21'],
  ['  Oficina ﬁcticia   del  Estado de México  ', '15'],
  ['Secretaría de Educación Estatal Ficticia — Ver.', '30'],
  ['', '09'],
  // Bordes que trim() y strip() tratan distinto: U+FEFF, U+001C a U+001F y U+0085.
  ['﻿Dirección Ficticia de Compras', '00'],
  ['Dirección Ficticia de Compras﻿', '21'],
  ['Villa Ejemplo - ecatepec\u0085', '15'],
  ['Villa Ejemplo - ecatepec﻿', '15'],
  ['Villa Ejemplo\u001C-\u001Cecatepec', '15'],
  ['\u001D\u001E\u001FVilla Ejemplo - ecatepec\u0085', '15'],
  ['Villa Ejemplo　-　ecatepec', '15'],
  ['Villa Ejemplo\t-\tecatepec ', '15'],
];

const AREA_CASES: readonly string[] = [
  'Departamento de Compras',
  '070 Atención Ciudadana',
  'Depto. de Recursos Materiales y Servs. Grales.',
  'Coord. Jur. - s1',
  'Órgano Interno de Control',
  '12A 3B Dirección de Tecnologías',
  'Unid. de Transparencia (Ficticia)',
  '',
  '﻿Departamento de Compras - s1',
  'Departamento de Compras - s1\u0085',
  'Departamento de Compras\u001F-\u001Fs1',
];

interface PythonVectors {
  institutions: string[];
  areas: string[];
  texts: string[];
}

function runPython(): PythonVectors | null {
  const script = [
    'import json, sys',
    `sys.path.insert(0, ${JSON.stringify(PROCESS_DIR)})`,
    'from pdn.normalize import institution_key, area_key, text_key',
    'data = json.load(sys.stdin)',
    'print(json.dumps({',
    "  'institutions': [institution_key(raw, state) for raw, state in data['institutions']],",
    "  'areas': [area_key(raw) for raw in data['areas']],",
    "  'texts': [text_key(raw) for raw in data['areas']],",
    '}))',
  ].join('\n');
  try {
    const output = execFileSync('python3', ['-c', script], {
      input: JSON.stringify({ institutions: INSTITUTION_CASES, areas: AREA_CASES }),
      encoding: 'utf8',
    });
    return JSON.parse(output) as PythonVectors;
  } catch {
    return null;
  }
}

describe('normalización cruzada con datos/proceso (Python)', () => {
  const vectors = runPython();

  it('Python está disponible (npm run check ya lo exige con data:test)', () => {
    expect(vectors).not.toBeNull();
  });

  it('institutionKey coincide con institution_key en cada caso', () => {
    const fromTs = INSTITUTION_CASES.map(([raw, state]) => institutionKey(raw, state));
    expect(fromTs).toEqual(vectors?.institutions);
  });

  it('areaKey y textKey coinciden con area_key y text_key', () => {
    expect(AREA_CASES.map(areaKey)).toEqual(vectors?.areas);
    expect(AREA_CASES.map(textKey)).toEqual(vectors?.texts);
  });
});

describe('normalización: vectores fijos', () => {
  it('quita acentos, signos y palabras vacías', () => {
    expect(textKey('Órgano Interno de Control')).toBe('ORGANO INTERNO CONTROL');
  });

  it('unifica el gobierno municipal y quita «H.»', () => {
    expect(institutionNameKey('H. Ayuntamiento de Villa Ejemplo', '21')).toBe(
      'MUNICIPIO VILLA EJEMPLO',
    );
  });

  it('quita el nombre de la propia entidad, pero no en el municipio homónimo de la capital', () => {
    expect(
      institutionNameKey('Secretaría de Finanzas del Gobierno del Estado de Puebla', '21'),
    ).toBe('SECRETARIA FINANZAS');
    expect(institutionNameKey('Municipio Libre de Aguascalientes', '01')).toBe(
      'MUNICIPIO AGUASCALIENTES',
    );
  });

  it('la clave siempre lleva la entidad', () => {
    expect(institutionKey('Secretaría de Turismo', '14')).not.toBe(
      institutionKey('Secretaría de Turismo', '21'),
    );
  });

  it('quita códigos de plaza y expande abreviaturas en el área', () => {
    expect(areaKey('070 Depto. de Compras')).toBe('DEPARTAMENTO COMPRAS');
  });
});
