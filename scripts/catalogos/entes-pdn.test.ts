// Pruebas de la generación del catálogo de entes de la PDN: tipo título con siglas, acentos,
// duplicados, municipio y descartes. Usa registros de ejemplo, sin descargar nada.
import { describe, expect, it } from 'vitest';
import { buildAccentDictionary, buildCatalog, displayName, nameKey } from './entes-pdn.ts';
import type { PdnEnte } from './entes-pdn.ts';
import { parseInegiResponse } from './municipios-inegi.ts';

const DICTIONARY = buildAccentDictionary(['Querétaro', 'Benito Juárez', 'San Juan del Río']);

function ente(id: number, nombre: string, overrides: Partial<PdnEnte> = {}): PdnEnte {
  return { id, nombre, ambitoGobierno: 'Estatal', entidad: '22', municipio: null, ...overrides };
}

describe('displayName', () => {
  it('convierte a tipo título con acentos y conserva las siglas', () => {
    expect(displayName('SECRETARIA DE LA CONTRALORIA', DICTIONARY)).toBe(
      'Secretaría de la Contraloría',
    );
    expect(displayName('AEROPUERTO INTERCONTINENTAL DE QUERETARO SA DE CV', DICTIONARY)).toBe(
      'Aeropuerto Intercontinental de Querétaro SA de CV',
    );
    expect(displayName('SISTEMA DIF MUNICIPAL DE BENITO JUAREZ', DICTIONARY)).toBe(
      'Sistema DIF Municipal de Benito Juárez',
    );
    expect(displayName('COMISION ESTATAL DE AGUAS (CEA)', DICTIONARY)).toBe(
      'Comisión Estatal de Aguas (CEA)',
    );
    expect(displayName('ORGANISMO OPERADOR DE AGUA - OOAPAS', DICTIONARY)).toBe(
      'Organismo Operador de Agua - OOAPAS',
    );
    expect(displayName('BANCO NACIONAL SNC', DICTIONARY)).toBe('Banco Nacional SNC');
    expect(displayName('ZONA ESCOLAR XXI', DICTIONARY)).toBe('Zona Escolar XXI');
    expect(displayName('H. AYUNTAMIENTO DE SAN JUAN DEL RIO', DICTIONARY)).toBe(
      'H. Ayuntamiento de San Juan del Río',
    );
    expect(displayName('EMPRESA S.A. DE C.V.', DICTIONARY)).toBe('Empresa S.A. de C.V.');
  });

  it('respeta los nombres que ya traen minúsculas', () => {
    expect(displayName('Ayuntamiento de  Córdoba ', DICTIONARY)).toBe('Ayuntamiento de Córdoba');
  });

  it('compara sin acentos ni signos', () => {
    expect(nameKey('Secretaría de la Contraloría.')).toBe(nameKey('SECRETARIA DE LA CONTRALORIA'));
  });
});

describe('buildCatalog', () => {
  it('une duplicados, conserva los ids de la PDN y usa el menor como id estable', () => {
    const { entidades, cifras } = buildCatalog([
      ente(7075, 'AEROPUERTO INTERCONTINENTAL DE QUERETARO SA DE CV'),
      ente(7074, 'AEROPUERTO INTERCONTINENTAL DE QUERETARO SA DE CV'),
      ente(10, 'Secretaría de la Contraloría'),
      ente(11, 'SECRETARIA DE LA CONTRALORIA'),
    ]);
    expect(cifras).toMatchObject({ registros: 4, entes: 2, duplicados: 2, descartados: 0 });
    expect(entidades['22']).toEqual([
      [
        'PDN-22-7074',
        'Aeropuerto Intercontinental de Querétaro SA de CV',
        'E',
        null,
        [7074, 7075],
        'AEROPUERTO INTERCONTINENTAL DE QUERETARO SA DE CV',
      ],
      // Del par se muestra el nombre mejor escrito (con acentos).
      ['PDN-22-10', 'Secretaría de la Contraloría', 'E', null, [10, 11]],
    ]);
  });

  it('valida el municipio contra el INEGI y el orden de gobierno contra la entidad', () => {
    const { entidades, cifras } = buildCatalog([
      ente(1, 'MUNICIPIO DE QUERETARO', { ambitoGobierno: 'Municipal', municipio: '22_014' }),
      ente(2, 'MUNICIPIO DE NINGUNO', { ambitoGobierno: 'Municipal', municipio: '22_999' }),
      ente(3, 'INSTITUTO FEDERAL', { ambitoGobierno: 'Federal', entidad: '00' }),
      ente(4, 'OFICINA FEDERAL MAL UBICADA', { ambitoGobierno: 'Federal' }),
      ente(5, 'CONTACTO correo@dominio.mx'),
      ente(6, 'LINEA 4421234567'),
      ente(7, 'SIN ORDEN', { ambitoGobierno: 'Otro' }),
    ]);
    expect(cifras).toMatchObject({ entes: 3, descartados: 4, municipioInvalido: 1 });
    expect(entidades['22']?.map((row) => [row[0], row[2], row[3]])).toEqual([
      ['PDN-22-2', 'M', null],
      ['PDN-22-1', 'M', '014'],
    ]);
    expect(entidades['00']?.[0]?.[0]).toBe('PDN-00-3');
  });

  it('excluye los nombres que tocan la lista local de términos', () => {
    const { entidades, cifras } = buildCatalog(
      [ente(1, 'FIDEICOMISO DEL TRAMO PALABRAVETADA'), ente(2, 'SECRETARIA DE SALUD')],
      ['palabravetada'],
    );
    expect(cifras).toMatchObject({ entes: 1, excluidosPorLista: 1 });
    expect(entidades['22']?.map((row) => row[0])).toEqual(['PDN-22-2']);
  });
});

describe('parseInegiResponse', () => {
  it('ordena por clave y rechaza registros de otra entidad o claves repetidas', () => {
    const rows = parseInegiResponse('22', {
      datos: [
        { cve_ent: '22', cve_mun: '002', nomgeo: 'Pinal de Amoles' },
        { cve_ent: '22', cve_mun: '001', nomgeo: ' Amealco  de Bonfil ' },
      ],
    });
    expect(rows).toEqual([
      ['001', 'Amealco de Bonfil'],
      ['002', 'Pinal de Amoles'],
    ]);
    expect(() =>
      parseInegiResponse('22', { datos: [{ cve_ent: '09', cve_mun: '001', nomgeo: 'X' }] }),
    ).toThrow();
    expect(() => parseInegiResponse('22', { datos: [] })).toThrow();
  });
});
