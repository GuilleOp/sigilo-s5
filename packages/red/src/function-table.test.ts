// Pruebas de la tabla de funciones de cada nodo: firma del nodo, coherencia con el directorio y
// reglas por orden de gobierno, por ente y por gravedad.
import { describe, expect, it } from 'vitest';
import { FunctionTableSchema } from '@sigilo/contracts';
import type { AuthorityDirectory, FunctionTable } from '@sigilo/contracts';
import { FEDERAL_NAMES } from './demo-federal.ts';
import { QUERETARO_NAMES } from './demo-queretaro.ts';
import { directoryProblems } from './directory.ts';
import {
  assignmentsFor,
  entityAssignmentFor,
  functionTableDiff,
  functionTableDigest,
  functionTableFor,
  functionTableProblems,
  identifiedOnlyAuthorityIds,
  matchFunction,
  nextTableWithEntities,
  signFunctionTable,
  verifyFunctionTableSignature,
} from './function-table.ts';
import { createNetworkFixture } from './test-fixtures.ts';

const fixture = createNetworkFixture();
const { directory } = fixture.signed;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function tableOf(target: AuthorityDirectory, stateCode: string | null): FunctionTable {
  const table = functionTableFor(target, stateCode);
  if (table === undefined) throw new Error('sin tabla');
  return table;
}

/** Cambia la tabla de un nodo y la vuelve a firmar con su llave, como lo haría el nodo. */
function withTable(
  edit: (table: FunctionTable) => void,
  nodeId: 'node.queretaro' | 'node.federal' | 'node.oaxaca' = 'node.queretaro',
): AuthorityDirectory {
  const next = clone(directory);
  next.functionTables = (next.functionTables ?? []).map((signed) => {
    if (signed.table.nodeId !== nodeId) return signed;
    const table = clone(signed.table);
    edit(table);
    return signFunctionTable(table, fixture.keys.nodes[nodeId].signing.privateKey);
  });
  return next;
}

describe('tabla de funciones', () => {
  it('cada nodo de la demostración declara y firma su tabla; el directorio es coherente', () => {
    expect(directoryProblems(directory)).toEqual([]);
    expect(directory.functionTables?.map((item) => item.table.stateCode)).toEqual([
      '22',
      null,
      '20',
    ]);
    for (const signed of directory.functionTables ?? []) {
      const node = directory.nodes.find((item) => item.id === signed.table.nodeId);
      expect(node && verifyFunctionTableSignature(signed, node)).toBe(true);
    }
  });

  it('la operación no puede cambiar la tabla de un estado sin la firma del nodo', () => {
    const tampered = clone(directory);
    const signed = tampered.functionTables?.[0];
    if (signed === undefined) throw new Error('sin tabla');
    signed.table.functions.investigation = [];
    expect(functionTableProblems(tampered).join(' ')).toContain('no tiene la firma de su nodo');
    // Tampoco sirve firmarla con la llave de otro nodo.
    const foreign = clone(directory);
    const table = tableOf(foreign, '22');
    foreign.functionTables = [
      signFunctionTable(table, fixture.keys.nodes['node.federal'].signing.privateKey),
      ...(foreign.functionTables ?? []).slice(1),
    ];
    expect(functionTableProblems(foreign).join(' ')).toContain('no tiene la firma de su nodo');
  });

  it('ningún estado vive en el nodo de otro: solo nombra autoridades de su nodo y su entidad', () => {
    const borrowed = withTable((table) => {
      table.functions.investigation = [
        {
          governmentLevels: ['estatal'],
          entityIds: [],
          holder: { kind: 'authority', authorityId: 'authority.comptroller-oaxaca' },
        },
      ];
    });
    const text = functionTableProblems(borrowed).join(' ');
    expect(text).toContain('que está en otro nodo');
    expect(text).toContain('que es de otra entidad');
  });

  it('una tabla estatal no cubre entes federales y la federal solo cubre federales', () => {
    const state = withTable((table) => {
      table.functions.intake[0]?.governmentLevels.push('federal');
    });
    expect(functionTableProblems(state).join(' ')).toContain('no puede cubrir entes federales');
    const federal = withTable((table) => {
      table.functions.prosecution[0]?.governmentLevels.push('estatal');
    }, 'node.federal');
    expect(functionTableProblems(federal).join(' ')).toContain('solo cubre entes federales');
  });

  it('el buzón y la investigación deben ser autoridades con el papel de la función', () => {
    const institution = withTable((table) => {
      table.functions.investigation = [
        {
          governmentLevels: ['estatal'],
          entityIds: [],
          holder: { kind: 'institution', name: 'X' },
        },
      ];
      table.functions.intake = [
        {
          governmentLevels: ['estatal'],
          entityIds: [],
          holder: { kind: 'authority', authorityId: 'authority.comptroller-queretaro' },
        },
      ];
    });
    const text = functionTableProblems(institution).join(' ');
    expect(text).toContain('debe nombrar a una autoridad del directorio');
    expect(text).toContain('no tiene el papel inbox');
  });

  it('una entidad o un nodo no pueden tener dos tablas', () => {
    const twice = clone(directory);
    const first = twice.functionTables?.[0];
    if (first === undefined) throw new Error('sin tabla');
    twice.functionTables = [...(twice.functionTables ?? []), first];
    const text = functionTableProblems(twice).join(' ');
    expect(text).toContain('tiene dos tablas de funciones');
    expect(text).toContain('Dos tablas de funciones cubren 22');
  });

  it('gana la regla del ente sobre la de su orden, y la de la gravedad sobre la general', () => {
    const federal = tableOf(directory, null);
    expect(
      matchFunction(federal, 'substantiation', { entityId: 'VE-INSTITUTO', level: 'federal' }),
    ).toMatchObject({
      entityMatch: 'specific',
      rule: { holder: { name: FEDERAL_NAMES.iffeResponsabilidades } },
    });
    expect(
      matchFunction(federal, 'substantiation', { entityId: 'VE-ADUANA', level: 'federal' }),
    ).toBeNull();
    const queretaro = tableOf(directory, '22');
    expect(
      matchFunction(queretaro, 'resolution', {
        entityId: 'VE-FINANZAS',
        level: 'estatal',
        severity: 'serious',
      })?.rule.holder,
    ).toEqual({ kind: 'institution', name: QUERETARO_NAMES.sala });
    // Sin calificación aún, una regla de gravedad no aplica.
    expect(
      matchFunction(queretaro, 'resolution', { entityId: 'VE-FINANZAS', level: 'estatal' }),
    ).toBeNull();
  });

  it('las funciones siguientes de un ente, con las dos gravedades si aún no se califica', () => {
    const rows = assignmentsFor(
      directory,
      tableOf(directory, null),
      ['substantiation', 'resolution', 'supervision'],
      { entityId: 'VE-INSTITUTO', level: 'federal' },
    );
    expect(rows.map((row) => row.function)).toEqual([
      'substantiation',
      'resolution',
      'supervision',
    ]);
    expect(rows[1]?.holders.map((holder) => [holder.severity, holder.name])).toEqual([
      ['non_serious', 'Órgano Interno de Control en el Instituto Federal Ficticio de Equipamiento'],
      ['serious', 'Tribunal Federal Ficticio de Justicia Administrativa'],
    ]);
    expect(rows[2]?.holders[0]?.name).toBe(
      'Unidad Ficticia de Supervisión de Órganos Internos de Control',
    );
    const oaxaca = assignmentsFor(directory, tableOf(directory, '20'), ['observer'], {
      entityId: 'VE-SALUD',
      level: 'estatal',
    });
    // Oaxaca no tiene CPC en el escenario sintético: la función queda sin titular.
    expect(oaxaca[0]?.holders).toEqual([]);
  });

  it('el tribunal tiene su función, con primera instancia y alzada', () => {
    const rows = assignmentsFor(directory, tableOf(directory, '22'), ['court'], {
      entityId: 'VE-FINANZAS',
      level: 'estatal',
    });
    expect(rows[0]?.holders.map((holder) => [holder.instance, holder.name])).toEqual([
      ['first', QUERETARO_NAMES.sala],
      ['appeal', QUERETARO_NAMES.cuartaSeccion],
    ]);
  });
});

describe('formato 2 de la tabla de funciones', () => {
  it('se acepta el formato 1 tal cual (mismo digesto) y el 2 con la competencia por dependencia', () => {
    const oaxaca = tableOf(directory, '20');
    expect(oaxaca.format).toBe(1);
    expect(oaxaca.functions.court).toBeUndefined();
    // El formato 1 se firma y se verifica igual que antes: parsearlo no le agrega campos.
    expect(FunctionTableSchema.parse(oaxaca)).toEqual(oaxaca);
    expect(functionTableDigest(FunctionTableSchema.parse(oaxaca))).toBe(
      functionTableDigest(oaxaca),
    );
    expect(tableOf(directory, null).format).toBe(2);
    const queretaro = tableOf(directory, '22');
    expect(queretaro.format).toBe(2);
    expect(queretaro.entities?.length).toBeGreaterThan(90);
    expect(entityAssignmentFor(queretaro, 'PDN-22-7283')).toMatchObject({
      status: 'assigned',
      holder: { kind: 'authority', authorityId: 'authority.oic-municipio-queretaro' },
    });
    expect(entityAssignmentFor(queretaro, 'PDN-22-7232')).toEqual({
      entityId: 'PDN-22-7232',
      status: 'pending',
    });
  });

  it('el formato 1 no puede usar campos del 2; un ente aparece una sola vez', () => {
    const oaxaca = tableOf(directory, '20');
    expect(
      FunctionTableSchema.safeParse({ ...oaxaca, functions: { ...oaxaca.functions, court: [] } })
        .success,
    ).toBe(false);
    expect(FunctionTableSchema.safeParse({ ...oaxaca, entities: [] }).success).toBe(false);
    expect(FunctionTableSchema.safeParse({ ...oaxaca, settings: {} }).success).toBe(false);
    const queretaro = tableOf(directory, '22');
    const first = queretaro.entities?.[0];
    if (first === undefined) throw new Error('sin entes');
    expect(FunctionTableSchema.safeParse({ ...queretaro, entities: [first, first] }).success).toBe(
      false,
    );
    // «Sin OIC designado» exige fundamento; «pendiente» no nombra a nadie.
    expect(
      FunctionTableSchema.safeParse({
        ...queretaro,
        entities: [
          {
            entityId: 'PDN-22-7109',
            status: 'without_oic',
            holder: { kind: 'institution', name: 'X' },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      FunctionTableSchema.safeParse({
        ...queretaro,
        entities: [
          {
            entityId: 'PDN-22-7109',
            status: 'pending',
            holder: { kind: 'institution', name: 'X' },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('ninguna regla general manda a los municipios a una autoridad estatal (CPEUM 109 fr. III)', () => {
    const illegal = withTable((table) => {
      table.functions.investigation = [
        {
          governmentLevels: ['estatal', 'municipal'],
          entityIds: [],
          holder: { kind: 'authority', authorityId: 'authority.comptroller-queretaro' },
        },
      ];
    });
    expect(functionTableProblems(illegal).join(' ')).toContain('cada municipio tiene su órgano');
  });

  it('un OIC del directorio debe ser investigador de su nodo y el ente, de su entidad', () => {
    const wrong = withTable((table) => {
      table.entities = [
        {
          entityId: 'PDN-20-1',
          status: 'assigned',
          holder: { kind: 'authority', authorityId: 'authority.buzon-queretaro' },
        },
        {
          entityId: 'PDN-22-7109',
          status: 'assigned',
          holder: { kind: 'authority', authorityId: 'authority.comptroller-oaxaca' },
        },
      ];
    });
    const text = functionTableProblems(wrong).join(' ');
    expect(text).toContain('nombra un ente de otra entidad');
    expect(text).toContain('no tiene el papel investigating');
    expect(text).toContain('que está en otro nodo');
  });

  it('quien opera el nodo no recibe ni turna, salvo que la ley del estado lo declare', () => {
    const operatorIntake = withTable((table) => {
      table.functions.operation = [
        {
          governmentLevels: ['estatal'],
          entityIds: [],
          holder: { kind: 'authority', authorityId: 'authority.buzon-queretaro' },
        },
      ];
    });
    expect(functionTableProblems(operatorIntake).join(' ')).toContain('settings.operatorReceives');
    const declared = withTable((table) => {
      table.functions.operation = [
        {
          governmentLevels: ['estatal'],
          entityIds: [],
          holder: { kind: 'authority', authorityId: 'authority.buzon-queretaro' },
        },
      ];
      table.settings = { operatorReceives: { legalBasis: 'Ley estatal ficticia, art. 1' } };
    });
    expect(functionTableProblems(declared).join(' ')).not.toContain('settings.operatorReceives');
  });

  it('la misma área no investiga y substancia (LGRA, art. 115)', () => {
    const same = withTable((table) => {
      table.functions.substantiation = [
        {
          governmentLevels: ['estatal'],
          entityIds: [],
          holder: { kind: 'authority', authorityId: 'authority.comptroller-queretaro' },
        },
      ];
    });
    expect(functionTableProblems(same).join(' ')).toContain('LGRA, art. 115');
  });

  it('la regla de la ESFE solo aplica a una denuncia identificada', () => {
    const queretaro = tableOf(directory, '22');
    expect(identifiedOnlyAuthorityIds(queretaro)).toEqual(new Set(['authority.esfe-queretaro']));
    const subject = { entityId: 'VE-FINANZAS', level: 'estatal', severity: 'serious' } as const;
    expect(matchFunction(queretaro, 'investigation', subject)?.rule.holder).toEqual({
      kind: 'authority',
      authorityId: 'authority.comptroller-queretaro',
    });
    expect(
      matchFunction(queretaro, 'investigation', { ...subject, reporterIdentified: true })?.rule
        .holder,
    ).toEqual({ kind: 'authority', authorityId: 'authority.esfe-queretaro' });
  });

  it('la versión siguiente sube al formato 2, ordena los entes y deja ver los cambios', () => {
    const oaxaca = tableOf(directory, '20');
    const next = nextTableWithEntities(
      oaxaca,
      [
        { entityId: 'PDN-20-9', status: 'pending' },
        {
          entityId: 'PDN-20-1',
          status: 'assigned',
          holder: { kind: 'institution', name: 'OIC Ficticio de Prueba' },
        },
      ],
      '2026-11-20',
    );
    expect(next).toMatchObject({ format: 2, version: oaxaca.version + 1, issuedOn: '2026-11-20' });
    expect(next.entities?.map((item) => item.entityId)).toEqual(['PDN-20-1', 'PDN-20-9']);
    expect(next.functions.investigation).toEqual(oaxaca.functions.investigation);
    const changes = functionTableDiff(oaxaca, next, directory);
    expect(changes.map((item) => item.text)).toEqual([
      'La tabla pasa del formato 1 al 2.',
      'PDN-20-1: OIC OIC Ficticio de Prueba.',
      'PDN-20-9: pendiente.',
    ]);
    const again = nextTableWithEntities(
      next,
      [{ entityId: 'PDN-20-1', status: 'pending' }],
      '2026-11-21',
    );
    expect(functionTableDiff(next, again).map((item) => [item.kind, item.entityId])).toEqual([
      ['changed', 'PDN-20-1'],
      ['removed', 'PDN-20-9'],
    ]);
  });
});
