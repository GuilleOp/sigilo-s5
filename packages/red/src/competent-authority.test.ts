// Pruebas de la propuesta de autoridad competente con el escenario de docs/demo-escenario.md.
import { describe, expect, it } from 'vitest';
import type { AuthorityDirectory } from '@sigilo/contracts';
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
    expect(proposal.reasons.join(' ')).toContain(
      'Según la tabla de funciones que firmó el nodo federal',
    );
    expect(proposal.reasons.join(' ')).toContain('de ese ente de forma específica');
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
    // La tabla federal no nombra un OIC para la Aduana: no se propone la supervisora; va al buzón.
    expect(proposal.status).toBe('inbox');
    expect(proposal.proposed?.authority.id).toBe('authority.buzon-federal');
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
    // Antes de la vigencia tampoco hay buzón válido: no se envía nada.
    expect(before.status).toBe('none');
    expect(before.proposed).toBeNull();
    expect(before.reasons.join(' ')).toContain('No se envía nada');
  });

  it('si la tabla no nombra quién investiga al ente, va al buzón general de la entidad', () => {
    const proposal = proposeCompetentAuthority(
      directory,
      { stateCode: '22', entityId: 'Ente sin catálogo', offenseCode: 'LGRA-54' },
      FIXTURE_DAY,
    );
    expect(proposal.status).toBe('inbox');
    expect(proposal.proposed?.authority.id).toBe('authority.buzon-queretaro');
    expect(proposal.proposed?.node.id).toBe('node.queretaro');
    expect(proposal.proposed?.lawMatch).toBeNull();
    expect(proposal.alternatives).toEqual([]);
    expect(proposal.reasons.join(' ')).toContain(
      'La tabla de funciones de Querétaro no nombra quién investiga a ese ente. La enviamos al buzón general ficticio del nodo Querétaro, donde una persona la turna a quien corresponda.',
    );
    expect(proposal.reasons.join(' ')).not.toContain('No se envía nada');
  });

  it('un ente federal sin OIC en la tabla federal va al buzón federal desde cualquier entidad', () => {
    const proposal = proposeCompetentAuthority(
      directory,
      { stateCode: '09', entityId: 'VE-ADUANA', offenseCode: 'LGRA-54' },
      FIXTURE_DAY,
    );
    expect(proposal.status).toBe('inbox');
    expect(proposal.proposed?.authority.id).toBe('authority.buzon-federal');
    expect(proposal.proposed?.node.id).toBe('node.federal');
    expect(proposal.isStateWithoutNode).toBe(false);
    // El buzón del nodo Federal tiene supervisora: la segunda copia llega a ella.
    expect(proposal.reasons.join(' ')).toContain('Unidad Ficticia de Supervisión');
  });

  it('una entidad sin nodo no recibe denuncias estatales: no se envía nada y se dice por qué', () => {
    const proposal = proposeCompetentAuthority(
      directory,
      { stateCode: '09', entityId: 'VE-SALUD', offenseCode: 'LGRA-54' },
      FIXTURE_DAY,
    );
    expect(proposal).toMatchObject({ status: 'none', proposed: null, isStateWithoutNode: true });
    const text = proposal.reasons.join(' ');
    expect(text).toContain('Ciudad de México todavía no tiene nodo en la red');
    expect(text).toContain('No se envía nada');
    // Nunca cae en el buzón de otro estado ni en el federal: no hay nodo común.
    const unclassified = proposeCompetentAuthority(
      directory,
      { stateCode: '09', entityId: 'VE-OBRAS', offenseCode: 'SIN-CLASIFICAR' },
      FIXTURE_DAY,
    );
    expect(unclassified).toMatchObject({ status: 'none', isStateWithoutNode: true });
  });

  it('sin tablas de funciones usa la competencia y nunca el buzón de otra entidad', () => {
    const withoutTables: AuthorityDirectory = { ...directory, functionTables: [] };
    const queretaro = proposeCompetentAuthority(
      withoutTables,
      { stateCode: '22', entityId: 'VE-FINANZAS', offenseCode: 'LGRA-54' },
      FIXTURE_DAY,
    );
    expect(queretaro.proposed?.authority.id).toBe('authority.comptroller-queretaro');
    const elsewhere = proposeCompetentAuthority(
      withoutTables,
      { stateCode: '09', entityId: 'VE-SALUD', offenseCode: 'LGRA-54' },
      FIXTURE_DAY,
    );
    expect(elsewhere.status).toBe('none');
    expect(elsewhere.isStateWithoutNode).toBe(false);
  });

  it('el buzón general nunca se propone por competencia', () => {
    const proposal = proposeCompetentAuthority(
      directory,
      { stateCode: '22', entityId: 'VE-FINANZAS', offenseCode: 'LGRA-54' },
      FIXTURE_DAY,
    );
    const ids = [proposal.proposed, ...proposal.alternatives].map((item) => item?.authority.id);
    expect(ids).not.toContain('authority.buzon-queretaro');
    expect(ids).not.toContain('authority.buzon-federal');
  });

  it('sin ningún buzón vigente en el directorio no se envía nada', () => {
    const withoutInbox: AuthorityDirectory = {
      ...directory,
      authorities: directory.authorities.filter((item) => item.role !== 'inbox'),
    };
    const proposal = proposeCompetentAuthority(
      withoutInbox,
      { stateCode: '22', entityId: 'VE-ADUANA', offenseCode: 'LGRA-54' },
      FIXTURE_DAY,
    );
    expect(proposal).toMatchObject({ status: 'none', proposed: null, alternatives: [] });
    expect(proposal.reasons.join(' ')).toContain('No se envía nada');
  });

  it('ente municipal sin órgano municipal: respaldo en la contraloría estatal', () => {
    const proposal = proposeCompetentAuthority(
      directory,
      { stateCode: '22', entityId: 'VE-OBRAS', offenseCode: 'LGRA-52' },
      FIXTURE_DAY,
    );
    expect(proposal.isFallback).toBe(true);
    expect(proposal.proposed?.authority.id).toBe('authority.comptroller-queretaro');
    expect(proposal.reasons.join(' ')).toContain('órgano de control propio');
  });

  it('Oaxaca tiene su propio nodo: va a su contraloría según su tabla', () => {
    const proposal = proposeCompetentAuthority(
      directory,
      { stateCode: '20', entityId: 'VE-SALUD', offenseCode: 'LGRA-52' },
      FIXTURE_DAY,
    );
    expect(proposal.proposed?.authority.id).toBe('authority.comptroller-oaxaca');
    expect(proposal.proposed?.node.id).toBe('node.oaxaca');
    expect(proposal.reasons.join(' ')).toContain('Según la tabla de funciones que firmó Oaxaca');
  });

  it('«Ninguna se parece» va al buzón general, que la clasifica y la turna', () => {
    const proposal = proposeCompetentAuthority(
      directory,
      { stateCode: '22', entityId: 'VE-OBRAS', offenseCode: 'SIN-CLASIFICAR' },
      FIXTURE_DAY,
    );
    expect(proposal.status).toBe('inbox');
    expect(proposal.proposed?.authority.role).toBe('inbox');
    expect(proposal.reasons.join(' ')).toContain('No elegiste una conducta');
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
