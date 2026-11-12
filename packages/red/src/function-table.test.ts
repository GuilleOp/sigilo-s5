// Pruebas de la tabla de funciones de cada nodo: firma del nodo, coherencia con el directorio y
// reglas por orden de gobierno, por ente y por gravedad.
import { describe, expect, it } from 'vitest';
import type { AuthorityDirectory, FunctionTable } from '@sigilo/contracts';
import { directoryProblems } from './directory.ts';
import {
  assignmentsFor,
  functionTableFor,
  functionTableProblems,
  matchFunction,
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
      matchFunction(federal, 'investigation', { entityId: 'VE-INSTITUTO', level: 'federal' }),
    ).toMatchObject({
      entityMatch: 'specific',
      rule: { holder: { authorityId: 'authority.oic-iffe' } },
    });
    expect(
      matchFunction(federal, 'investigation', { entityId: 'VE-ADUANA', level: 'federal' }),
    ).toBeNull();
    const queretaro = tableOf(directory, '22');
    expect(
      matchFunction(queretaro, 'resolution', {
        entityId: 'VE-FINANZAS',
        level: 'estatal',
        severity: 'serious',
      })?.rule.holder,
    ).toEqual({
      kind: 'institution',
      name: 'Tribunal de Justicia Administrativa Ficticio de Querétaro',
    });
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
});
