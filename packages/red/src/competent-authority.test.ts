// Pruebas de la propuesta de autoridad competente con el escenario de docs/demo-escenario.md.
import { describe, expect, it } from 'vitest';
import { proposeCompetentAuthority } from './competent-authority.ts';
import { FIXTURE_DAY, createNetworkFixture } from './test-fixtures.ts';

const { directory } = createNetworkFixture().signed;

describe('propuesta de autoridad competente', () => {
  it('case.marta: ente federal desde Querétaro va al OIC del IFFE en el nodo Federal', () => {
    const proposal = proposeCompetentAuthority(
      directory,
      {
        stateCode: '22',
        entityId: 'VE-INSTITUTO',
        offenseCode: 'LGRA-59',
        entityLevel: 'federal',
        entityName: 'Instituto Federal Ficticio de Equipamiento',
      },
      FIXTURE_DAY,
    );
    expect(proposal.status).toBe('proposed');
    expect(proposal.proposed?.authority.id).toBe('authority.oic-iffe');
    expect(proposal.proposed?.node.id).toBe('node.federal');
    expect(proposal.proposed?.entityMatch).toBe('specific');
    expect(proposal.isFallback).toBe(false);
    const text = proposal.reasons.join(' ');
    expect(text).toContain('falta administrativa');
    expect(text).toContain('orden federal');
    expect(text).toContain('Unidad Ficticia de Supervisión');
    expect(text).toContain('solo ve a quién va dirigida');
  });

  it('case.marta con el ente en el catálogo federal: el OIC lo atiende de forma específica', () => {
    const proposal = proposeCompetentAuthority(
      directory,
      { stateCode: '22', entityId: 'VE-INSTITUTO', offenseCode: 'LGRA-59' },
      FIXTURE_DAY,
    );
    expect(proposal.proposed?.authority.id).toBe('authority.oic-iffe');
    expect(proposal.reasons.join(' ')).toContain('atiende de forma específica a ese ente');
  });

  it('case.queretaro-routing: ente estatal en Querétaro va a la contraloría del nodo Querétaro', () => {
    const proposal = proposeCompetentAuthority(
      directory,
      { stateCode: '22', entityId: 'VE-FINANZAS', offenseCode: 'LGRA-54' },
      FIXTURE_DAY,
    );
    expect(proposal.proposed?.authority.id).toBe('authority.comptroller-queretaro');
    expect(proposal.proposed?.node.id).toBe('node.queretaro');
    expect(proposal.proposed?.entityMatch).toBe('general');
    expect(proposal.reasons.join(' ')).toContain('Querétaro');
  });

  it('case.attack-*: la Delegación va a su OIC; un delito va a la fiscalía con el OIC de alternativa', () => {
    const administrative = proposeCompetentAuthority(
      directory,
      { stateCode: '09', entityId: 'VE-PROGRAMAS', offenseCode: 'LGRA-52' },
      FIXTURE_DAY,
    );
    expect(administrative.proposed?.authority.id).toBe('authority.oic-dfps');
    const criminal = proposeCompetentAuthority(
      directory,
      { stateCode: '09', entityId: 'VE-PROGRAMAS', offenseCode: 'CPF-222' },
      FIXTURE_DAY,
    );
    expect(criminal.proposed?.authority.id).toBe('authority.prosecutor-anticorruption');
    expect(criminal.alternatives.map((item) => item.authority.id)).toContain('authority.oic-dfps');
    expect(criminal.reasons.join(' ')).toContain('posible delito');
  });

  it('nunca propone a la supervisora y respeta la vigencia de las llaves', () => {
    const proposal = proposeCompetentAuthority(
      directory,
      { stateCode: '22', entityId: 'VE-ADUANA', offenseCode: 'LGRA-54' },
      FIXTURE_DAY,
    );
    // Solo la supervisora federal atiende a todo el orden federal: no se propone.
    expect(proposal.status).toBe('none');
    expect(proposal.proposed).toBeNull();
    const equivalent = proposeCompetentAuthority(
      directory,
      { stateCode: '22', entityId: 'VE-ADUANA', offenseCode: 'LGRA-52' },
      FIXTURE_DAY,
    );
    expect(equivalent.proposed?.authority.id).toBe('authority.prosecutor-anticorruption');
    expect(equivalent.proposed?.lawMatch).toBe('equivalent');
    const before = proposeCompetentAuthority(
      directory,
      { stateCode: '22', entityId: 'VE-FINANZAS', offenseCode: 'LGRA-54' },
      '2026-11-01',
    );
    expect(before.status).toBe('none');
  });

  it('ente municipal sin órgano municipal: respaldo en la contraloría estatal', () => {
    const proposal = proposeCompetentAuthority(
      directory,
      { stateCode: '22', entityId: 'VE-OBRAS', offenseCode: 'LGRA-52' },
      FIXTURE_DAY,
    );
    expect(proposal.isFallback).toBe(true);
    expect(proposal.proposed?.authority.id).toBe('authority.comptroller-queretaro');
    expect(proposal.reasons.join(' ')).toContain('órgano de control municipal');
  });

  it('entidad sin nodo propio: el Estado Ejemplo va a su contraloría en el nodo común', () => {
    const proposal = proposeCompetentAuthority(
      directory,
      { stateCode: 'state.ejemplo', entityId: 'VE-SALUD', offenseCode: 'LGRA-52' },
      FIXTURE_DAY,
    );
    expect(proposal.proposed?.authority.id).toBe('authority.comptroller-ejemplo');
    expect(proposal.proposed?.node.isCommonNode).toBe(true);
  });

  it('una conducta desconocida no propone nada', () => {
    const proposal = proposeCompetentAuthority(
      directory,
      { stateCode: '22', entityId: 'VE-FINANZAS', offenseCode: 'LGRA-999' },
      FIXTURE_DAY,
    );
    expect(proposal).toMatchObject({ status: 'none', proposed: null });
  });
});
