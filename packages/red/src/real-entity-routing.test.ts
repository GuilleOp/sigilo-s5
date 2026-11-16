// Ruteo de entes REALES del directorio de la PDN con el directorio ficticio de la demostración: se
// rutean por la tabla de funciones de su entidad, por orden de gobierno (nunca por un ente
// ficticio), van al buzón general o, si la entidad no tiene nodo, no se envían. El
// catálogo completo se registra como en el servidor; en la web, con el fragmento descargado.
import { describe, expect, it } from 'vitest';
import '@sigilo/contracts/entes';
import { proposeCompetentAuthority } from './competent-authority.ts';
import { FIXTURE_DAY, createNetworkFixture } from './test-fixtures.ts';

const { directory } = createNetworkFixture().signed;

describe('propuesta de autoridad para entes reales', () => {
  it('una dependencia del Ejecutivo de Querétaro va a la Contraloría por su competencia', () => {
    const proposal = proposeCompetentAuthority(
      directory,
      { stateCode: '22', entityId: 'PDN-22-7176', offenseCode: 'LGRA-54' },
      FIXTURE_DAY,
    );
    expect(proposal.status).toBe('proposed');
    expect(proposal.proposed?.authority.id).toBe('authority.comptroller-queretaro');
    expect(proposal.proposed?.entityMatch).toBe('specific');
    const text = proposal.reasons.join(' ');
    expect(text).toContain('«Secretaría de la Contraloría» es un ente del orden estatal');
    expect(text).toContain('no tiene órgano interno de control designado');
  });

  it('un ente del Municipio de Querétaro va a su OIC municipal, nunca a la Contraloría', () => {
    const proposal = proposeCompetentAuthority(
      directory,
      { stateCode: '22', entityId: 'PDN-22-7258', offenseCode: 'LGRA-52' },
      FIXTURE_DAY,
    );
    expect(proposal.status).toBe('proposed');
    expect(proposal.isFallback).toBe(false);
    expect(proposal.proposed?.authority.id).toBe('authority.oic-municipio-queretaro');
    expect(proposal.reasons.join(' ')).toContain('su órgano interno de control es');
  });

  it('un municipio sin OIC en la red va a la receptora con la nota de turnar a su OIC', () => {
    // Amealco de Bonfil: el estado aún no lo lista en su competencia por dependencia.
    const proposal = proposeCompetentAuthority(
      directory,
      { stateCode: '22', entityId: 'PDN-22-7267', offenseCode: 'LGRA-52' },
      FIXTURE_DAY,
    );
    expect(proposal.status).toBe('inbox');
    expect(proposal.proposed?.authority.id).toBe('authority.buzon-queretaro');
    expect(proposal.isFallback).toBe(true);
    expect(proposal.turnTo).toContain('el órgano interno de control del municipio de');
    expect(proposal.reasons.join(' ')).toContain('nunca a otra autoridad');
  });

  it('un OIC nombrado sin alta o pendiente: a la receptora, con a quién turnarla', () => {
    const named = proposeCompetentAuthority(
      directory,
      { stateCode: '22', entityId: 'PDN-22-7206', offenseCode: 'LGRA-52' },
      FIXTURE_DAY,
    );
    expect(named).toMatchObject({ status: 'inbox', isFallback: true });
    expect(named.turnTo).toBe(
      'Órgano Interno de Control de la Universidad Autónoma de Querétaro (ficticio)',
    );
    expect(named.reasons.join(' ')).toContain('todavía no tiene llaves en la red');
    const pending = proposeCompetentAuthority(
      directory,
      { stateCode: '22', entityId: 'PDN-22-7232', offenseCode: 'LGRA-52' },
      FIXTURE_DAY,
    );
    expect(pending).toMatchObject({ status: 'inbox', isFallback: true });
    expect(pending.proposed?.authority.id).toBe('authority.buzon-queretaro');
    expect(pending.reasons.join(' ')).toContain('está pendiente de designar');
    // Nunca la propone a la Contraloría ni a otra autoridad como alternativa.
    expect(pending.alternatives).toEqual([]);
  });

  it('un ente federal real nunca toma la competencia específica de un ente ficticio', () => {
    const proposal = proposeCompetentAuthority(
      directory,
      { stateCode: '22', entityId: 'PDN-00-196', offenseCode: 'CPF-222' },
      FIXTURE_DAY,
    );
    expect(proposal.proposed?.authority.id).toBe('authority.prosecutor-anticorruption');
    expect(proposal.proposed?.entityMatch).toBe('general');
    const ids = [proposal.proposed, ...proposal.alternatives].map((item) => item?.authority.id);
    expect(ids).not.toContain('authority.oic-iffe');
    expect(proposal.reasons.join(' ')).toContain('Instituto Mexicano del Seguro Social');
  });

  it('un ente estatal real de una entidad sin nodo no se envía: no hay nodo común', () => {
    const proposal = proposeCompetentAuthority(
      directory,
      { stateCode: '31', entityId: 'PDN-31-10135', offenseCode: 'LGRA-52' },
      FIXTURE_DAY,
    );
    expect(proposal).toMatchObject({ status: 'none', isStateWithoutNode: true });
    expect(proposal.reasons.join(' ')).toContain('ente del orden estatal');
    expect(proposal.reasons.join(' ')).toContain('Yucatán todavía no tiene nodo en la red');
  });
});
