// Pruebas de la tabla de funciones en la web: la página pública «¿Quién atiende tu denuncia?», el
// panel «Quién sigue en el trámite» del detalle y el nodo que recibe una solicitud de alta.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ComplaintDetail } from '@sigilo/contracts';
import { functionTableFor } from '@sigilo/red';
import { createNetworkFixture } from '../../../../../packages/red/src/test-fixtures.ts';
import { nodeForJurisdiction } from '../../network/ventanilla-api.ts';
import { NextFunctionsPanel } from '../authority/NextFunctionsPanel.tsx';
import { QUERETARO_NAMES } from '@sigilo/red';
import {
  CoverageTable,
  DependencySearch,
  FunctionTableCard,
  ruleScope,
  statesWithoutNode,
  tableEntities,
  tableTitle,
} from './WhoHandlesPage.tsx';

const { directory } = createNetworkFixture().signed;

function table(stateCode: string | null) {
  const found = functionTableFor(directory, stateCode);
  if (found === undefined) throw new Error('sin tabla');
  return found;
}

function detail(
  facts: { stateCode: string; entityId: string },
  severity?: 'serious' | 'non_serious',
): ComplaintDetail {
  return {
    facts: { ...facts, offenseCode: 'LGRA-54' },
    ...(severity === undefined ? {} : { procedure: { qualification: { severity } } }),
  } as unknown as ComplaintDetail;
}

describe('página pública de las tablas de funciones', () => {
  it('muestra cada función con quién la cumple y a qué entes aplica', () => {
    const html = renderToStaticMarkup(
      <FunctionTableCard directory={directory} table={table('22')} />,
    );
    expect(tableTitle(table('22'))).toBe('Querétaro');
    expect(html).toContain('Autoridad receptora (recepción y turnado)');
    expect(html).toContain('Entes del orden estatal y municipal');
    expect(html).toContain(QUERETARO_NAMES.receptora);
    expect(html).toContain(QUERETARO_NAMES.contraloria);
    expect(html).toContain(QUERETARO_NAMES.sala);
    expect(html).toContain('Tribunal (faltas graves, de particulares y alzada)');
    expect(html).toContain('solo denuncias con nombre y firma');
    expect(html).toContain('Nodo estatal Querétaro');
    // B05: el CPC no está entre las funciones del trámite; va aparte y no ve casos.
    expect(html).not.toContain('Observador (CPC)');
    expect(html).toContain('Quién vigila el sistema (no ve tu caso):</strong>');
    expect(html).toContain('Comité de Participación Ciudadana Ficticio de Querétaro');
    // B01: la SESEA solo opera el nodo.
    expect(html).toContain(QUERETARO_NAMES.sesea);
    expect(html).toContain('Operación del nodo (altas de autoridades, sin ver denuncias)');
  });

  it('busca una dependencia y dice quién es su OIC; cuenta la cobertura de cada estado', () => {
    const tables = (directory.functionTables ?? []).map((item) => item.table);
    const queretaro = table('22');
    const entities = new Map([
      [
        '22',
        tableEntities(queretaro, [
          {
            id: 'PDN-22-7283',
            name: 'Secretaría del Ayuntamiento del Municipio de Querétaro',
            level: 'municipal' as const,
            stateCode: '22',
            municipalityCode: '014',
          },
          {
            id: 'PDN-22-7232',
            name: 'Fiscalía General del Estado',
            level: 'estatal' as const,
            stateCode: '22',
          },
        ]),
      ],
    ]);
    const coverage = renderToStaticMarkup(
      <CoverageTable directory={directory} tables={tables} entities={entities} />,
    );
    expect(coverage).toContain('Cobertura de OIC por estado');
    // 2 dependencias: una con OIC con llaves, una pendiente.
    expect(coverage).toContain('<td class="numeric">2</td>');
    expect(coverage).toContain('1 (50 %)');
    expect(coverage).toContain('Cargando los catálogos de entes');
    const search = renderToStaticMarkup(
      <DependencySearch directory={directory} tables={tables} entities={entities} />,
    );
    expect(search).toContain('Busca tu dependencia');
    expect(search).toContain('Federación (entes federales)');
  });

  it('nombra los entes de las reglas específicas y la gravedad', () => {
    const federal = table(null);
    expect(tableTitle(federal)).toBe('Entes federales (nodo federal)');
    const [first] = federal.functions.substantiation;
    if (first === undefined) throw new Error('sin regla');
    expect(ruleScope(first)).toBe('Instituto Federal Ficticio de Equipamiento');
    const [asf] = federal.functions.investigation;
    if (asf === undefined) throw new Error('sin regla');
    expect(ruleScope(asf)).toBe('Entes del orden federal (faltas graves)');
    const serious = federal.functions.resolution.find((rule) => rule.severity === 'serious');
    if (serious === undefined) throw new Error('sin regla');
    expect(ruleScope(serious)).toBe('Entes del orden federal (faltas graves)');
    const html = renderToStaticMarkup(<FunctionTableCard directory={directory} table={federal} />);
    expect(html).toContain('Unidad Ficticia de Supervisión de Órganos Internos de Control');
  });

  it('enlista las entidades sin nodo (todas menos Querétaro y Oaxaca en la demostración)', () => {
    const without = statesWithoutNode(directory);
    expect(without).toHaveLength(30);
    expect(without).not.toContain('Querétaro');
    expect(without).not.toContain('Oaxaca');
    expect(without).toContain('Puebla');
  });
});

describe('quién sigue en el trámite', () => {
  it('sin calificación, muestra la resolución de falta grave y de no grave', () => {
    const html = renderToStaticMarkup(
      <NextFunctionsPanel
        detail={detail({ stateCode: '22', entityId: 'VE-INSTITUTO' })}
        directory={directory}
      />,
    );
    expect(html).toContain('Según la tabla de funciones que firmó el nodo federal');
    expect(html).toContain(
      'Si es falta no grave: Órgano Interno de Control en el Instituto Federal Ficticio de Equipamiento',
    );
    expect(html).toContain(
      'Si es falta grave: Tribunal Federal Ficticio de Justicia Administrativa',
    );
    expect(html).toContain('Unidad Ficticia de Supervisión de Órganos Internos de Control');
  });

  it('con la calificación, solo la resolutora de esa gravedad', () => {
    const html = renderToStaticMarkup(
      <NextFunctionsPanel
        detail={detail({ stateCode: '20', entityId: 'VE-SALUD' }, 'serious')}
        directory={directory}
      />,
    );
    expect(html).toContain('de Oaxaca');
    expect(html).toContain('Tribunal de Justicia Administrativa Ficticio de Oaxaca');
    expect(html).not.toContain('Contraloría Ficticia de Oaxaca (resolutora)');
    // Sin CPC en Oaxaca: la tabla no asigna observador.
    expect(html).toContain('La tabla no la asigna para este ente.');
  });

  it('una entidad sin tabla lo dice', () => {
    const html = renderToStaticMarkup(
      <NextFunctionsPanel
        detail={detail({ stateCode: '21', entityId: 'VE-SALUD' })}
        directory={directory}
      />,
    );
    expect(html).toContain('no tiene la tabla de funciones del nodo de Puebla');
  });
});

describe('solicitud de alta en la ventanilla', () => {
  it('va al nodo de la entidad según su tabla, o a ninguno si no tiene nodo', () => {
    expect(nodeForJurisdiction(directory, '22')?.id).toBe('node.queretaro');
    expect(nodeForJurisdiction(directory, '20')?.id).toBe('node.oaxaca');
    expect(nodeForJurisdiction(directory, null)?.id).toBe('node.federal');
    expect(nodeForJurisdiction(directory, '21')).toBeNull();
  });
});
