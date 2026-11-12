// Pruebas de la tabla de funciones en la web: la página pública «¿Quién atiende tu denuncia?», el
// panel «Quién sigue en el trámite» del detalle y el nodo que recibe una solicitud de alta.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ComplaintDetail } from '@sigilo/contracts';
import { functionTableFor } from '@sigilo/red';
import { createNetworkFixture } from '../../../../../packages/red/src/test-fixtures.ts';
import { nodeForJurisdiction } from '../../network/ventanilla-api.ts';
import { NextFunctionsPanel } from '../authority/NextFunctionsPanel.tsx';
import { FunctionTableCard, ruleScope, statesWithoutNode, tableTitle } from './WhoHandlesPage.tsx';

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
    expect(html).toContain('Buzón general (recepción y turnado)');
    expect(html).toContain('Entes del orden estatal y municipal');
    expect(html).toContain('Contraloría Estatal Ficticia de Querétaro');
    expect(html).toContain('Tribunal de Justicia Administrativa Ficticio de Querétaro');
    expect(html).toContain('Comité de Participación Ciudadana Ficticio de Querétaro');
    expect(html).toContain('Nodo estatal Querétaro');
  });

  it('nombra los entes de las reglas específicas y la gravedad', () => {
    const federal = table(null);
    expect(tableTitle(federal)).toBe('Entes federales (nodo federal)');
    const [first] = federal.functions.investigation;
    if (first === undefined) throw new Error('sin regla');
    expect(ruleScope(first)).toBe('Instituto Federal Ficticio de Equipamiento');
    const serious = federal.functions.resolution.find((rule) => rule.severity === 'serious');
    if (serious === undefined) throw new Error('sin regla');
    expect(ruleScope(serious)).toBe('Entes del orden federal (faltas graves)');
    const html = renderToStaticMarkup(<FunctionTableCard directory={directory} table={federal} />);
    expect(html).toContain('Unidad Ficticia de Supervisión de Órganos Internos de Control');
  });

  it('enlista las entidades sin nodo (todas menos Querétaro en la demostración)', () => {
    const without = statesWithoutNode(directory);
    expect(without).toHaveLength(31);
    expect(without).not.toContain('Querétaro');
    expect(without).toContain('Oaxaca');
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
        detail={detail({ stateCode: 'state.ejemplo', entityId: 'VE-SALUD' }, 'serious')}
        directory={directory}
      />,
    );
    expect(html).toContain('de Estado Ejemplo');
    expect(html).toContain('Tribunal de Justicia Administrativa Ficticio del Estado Ejemplo');
    expect(html).not.toContain('Contraloría Ficticia del Estado Ejemplo (resolutora)');
    // Sin CPC en el Estado Ejemplo: la tabla no asigna observador.
    expect(html).toContain('La tabla no la asigna para este ente.');
  });

  it('una entidad sin tabla lo dice', () => {
    const html = renderToStaticMarkup(
      <NextFunctionsPanel
        detail={detail({ stateCode: '20', entityId: 'VE-SALUD' })}
        directory={directory}
      />,
    );
    expect(html).toContain('no tiene la tabla de funciones del nodo de Oaxaca');
  });
});

describe('solicitud de alta en la ventanilla', () => {
  it('va al nodo de la entidad según su tabla, o a ninguno si no tiene nodo', () => {
    expect(nodeForJurisdiction(directory, '22')?.id).toBe('node.queretaro');
    expect(nodeForJurisdiction(directory, 'state.ejemplo')?.id).toBe('node.ejemplo');
    expect(nodeForJurisdiction(directory, null)?.id).toBe('node.federal');
    expect(nodeForJurisdiction(directory, '20')).toBeNull();
  });
});
