// Pruebas de la carga por fragmento de los entes reales y de las opciones del campo de oficina.
import { describe, expect, it } from 'vitest';
import { findEntity, isEntityId } from '@sigilo/contracts';
import { combineFragments, loadEntityFragment } from './entity-catalog.ts';
import type { FragmentFetch } from './entity-catalog.ts';
import { entityOptionsFor } from './entity-options.ts';
import { collectStaticData } from '../../static-data.ts';

const FUENTE = {
  nombre: 'Directorio de prueba',
  url: 'https://ejemplo.invalid',
  descargado: '2026-11-11',
};
const FORMATO = ['id', 'nombre', 'ordenGobierno', 'municipio', 'nombrePdn?'];

/** Fragmentos con nombres de instituciones de ejemplo, como los publica /datos/entes/. */
const FRAGMENTS: Record<string, unknown> = {
  '/datos/entes/00.json': {
    version: 1,
    entidad: { clave: '00', nombre: 'Federación' },
    fuente: FUENTE,
    formato: FORMATO,
    entes: [['PDN-00-196', 'Instituto Mexicano del Seguro Social', 'F', null]],
  },
  '/datos/entes/22.json': {
    version: 1,
    entidad: { clave: '22', nombre: 'Querétaro' },
    fuente: FUENTE,
    formato: FORMATO,
    entes: [
      ['PDN-22-7176', 'Secretaría de la Contraloría', 'E', null],
      ['PDN-22-7283', 'Secretaría del Ayuntamiento del Municipio de Querétaro', 'M', '014'],
      ['PDN-22-7300', 'Ayuntamiento de San Juan del Río', 'M', '016', 'H AYUNTAMIENTO SJR'],
    ],
  },
  // Respuesta con la entidad equivocada: se rechaza.
  '/datos/entes/09.json': {
    version: 1,
    entidad: { clave: '22', nombre: 'Querétaro' },
    fuente: FUENTE,
    formato: FORMATO,
    entes: [],
  },
};

function fakeFetch(requested: string[]): FragmentFetch {
  return (url) => {
    requested.push(url);
    const body = FRAGMENTS[url];
    return Promise.resolve({ ok: body !== undefined, json: () => Promise.resolve(body) });
  };
}

describe('carga de entes por fragmento', () => {
  it('descarga solo el fragmento pedido, una vez, y registra sus entes', async () => {
    const requested: string[] = [];
    const fetchFragment = fakeFetch(requested);
    expect(isEntityId('PDN-22-7176')).toBe(false);
    const [first, again] = await Promise.all([
      loadEntityFragment('22', fetchFragment),
      loadEntityFragment('22', fetchFragment),
    ]);
    expect(first).toBe(again);
    expect(await loadEntityFragment('22', fetchFragment)).toBe(first);
    expect(requested).toEqual(['/datos/entes/22.json']);
    expect(findEntity('PDN-22-7176')).toMatchObject({ level: 'estatal', stateCode: '22' });
    expect(findEntity('PDN-22-7283')).toMatchObject({
      level: 'municipal',
      municipalityCode: '014',
    });
    // El federal no se descargó: sus entes aún no se conocen.
    expect(findEntity('PDN-00-196')).toBeUndefined();
  });

  it('rechaza un fragmento de otra entidad, una clave desconocida o una respuesta fallida', async () => {
    const requested: string[] = [];
    await expect(loadEntityFragment('09', fakeFetch(requested))).rejects.toThrow('otra entidad');
    await expect(loadEntityFragment('33', fakeFetch(requested))).rejects.toThrow();
    await expect(loadEntityFragment('31', fakeFetch(requested))).rejects.toThrow();
    // La clave inexistente no se pide; la fallida se puede reintentar.
    expect(requested).toEqual(['/datos/entes/09.json', '/datos/entes/31.json']);
  });

  it('combina el fragmento federal y el de la entidad', () => {
    const entity = { id: 'PDN-22-1', name: 'Ente', level: 'estatal' as const, stateCode: '22' };
    const federal = { id: 'PDN-00-1', name: 'Federal', level: 'federal' as const, stateCode: '00' };
    expect(combineFragments({}, '')).toEqual({ status: 'idle', entities: [] });
    expect(combineFragments({ '22': { status: 'loading' } }, '22').status).toBe('loading');
    expect(
      combineFragments(
        { '00': { status: 'ready', entities: [federal] }, '22': { status: 'failed' } },
        '22',
      ),
    ).toEqual({ status: 'failed', entities: [federal] });
    expect(
      combineFragments(
        {
          '00': { status: 'ready', entities: [federal] },
          '22': { status: 'ready', entities: [entity] },
        },
        '22',
      ),
    ).toEqual({ status: 'ready', entities: [federal, entity] });
  });
});

describe('opciones del campo de oficina', () => {
  const entities = [
    {
      id: 'PDN-00-196',
      name: 'Instituto Mexicano del Seguro Social',
      level: 'federal',
      stateCode: '00',
    },
    { id: 'PDN-22-7176', name: 'Secretaría de la Contraloría', level: 'estatal', stateCode: '22' },
    {
      id: 'PDN-22-7283',
      name: 'Secretaría del Ayuntamiento',
      level: 'municipal',
      stateCode: '22',
      municipalityCode: '014',
    },
    {
      id: 'PDN-22-7300',
      name: 'Ayuntamiento de San Juan del Río',
      level: 'municipal',
      stateCode: '22',
      municipalityCode: '016',
      sourceName: 'H AYUNTAMIENTO SJR',
    },
    // De otra entidad (descargado antes): no se ofrece.
    { id: 'PDN-09-1', name: 'Congreso de la Ciudad de México', level: 'estatal', stateCode: '09' },
  ] as const;

  it('con municipio elegido muestra primero sus entes, luego estatales y federales', () => {
    const { options, groups, searchText } = entityOptionsFor(entities, {
      stateCode: '22',
      stateName: 'Querétaro',
      municipalityCode: '016',
      municipalityName: 'San Juan del Río',
    });
    expect(groups.map((group) => group.label)).toEqual([
      'Municipio de San Juan del Río',
      'Estatales de Querétaro',
      'Federales',
      'Otros municipios de Querétaro',
      'De demostración (ficticias)',
      '¿No está en la lista?',
    ]);
    expect(options.slice(0, 4).map((option) => option.value)).toEqual([
      'PDN-22-7300',
      'PDN-22-7176',
      'PDN-00-196',
      'PDN-22-7283',
    ]);
    expect(options.map((option) => option.value)).not.toContain('PDN-09-1');
    // Los ficticios se conservan, marcados, y «Otro ente público» va al final.
    expect(options.find((option) => option.value === 'VE-OBRAS')?.label).toBe(
      'Secretaría de Obras de Villa Ejemplo (ficticia)',
    );
    expect(options.at(-1)?.value).toBe('VE-OTRO');
    // Se busca también por el nombre con que lo publica la PDN.
    const option = options.find((item) => item.value === 'PDN-22-7300');
    expect(option && searchText(option)).toContain('H AYUNTAMIENTO SJR');
  });

  it('sin municipio agrupa todos los municipales de la entidad; sin entes, solo los ficticios', () => {
    const place = {
      stateCode: '22',
      stateName: 'Querétaro',
      municipalityCode: '',
      municipalityName: undefined,
    };
    const { groups } = entityOptionsFor(entities, place);
    expect(groups.map((group) => group.key)).toEqual([
      'estatal',
      'federal',
      'municipal',
      'ficticia',
      'otro',
    ]);
    expect(groups.find((group) => group.key === 'municipal')?.label).toBe(
      'Municipales de Querétaro',
    );
    expect(entityOptionsFor([], place).groups.map((group) => group.key)).toEqual([
      'ficticia',
      'otro',
    ]);
  });
});

describe('publicación de los fragmentos', () => {
  it('publica un fragmento por entidad y el federal, todos válidos', () => {
    const files = collectStaticData(undefined);
    const paths = [...files.keys()].filter((path) => path.startsWith('/datos/entes/'));
    expect(paths).toHaveLength(33);
    const queretaro = JSON.parse(new TextDecoder().decode(files.get('/datos/entes/22.json'))) as {
      entes: unknown[];
    };
    expect(queretaro.entes.length).toBeGreaterThan(100);
  });
});
