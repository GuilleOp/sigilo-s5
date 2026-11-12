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
  it('un ente estatal real de Querétaro va a la contraloría estatal por orden y entidad', () => {
    const proposal = proposeCompetentAuthority(
      directory,
      { stateCode: '22', entityId: 'PDN-22-7176', offenseCode: 'LGRA-54' },
      FIXTURE_DAY,
    );
    expect(proposal.status).toBe('proposed');
    expect(proposal.proposed?.authority.id).toBe('authority.comptroller-queretaro');
    expect(proposal.proposed?.entityMatch).toBe('general');
    expect(proposal.reasons.join(' ')).toContain(
      '«Secretaría de la Contraloría» es un ente del orden estatal',
    );
  });

  it('un ente municipal real sin órgano municipal usa el respaldo estatal', () => {
    const proposal = proposeCompetentAuthority(
      directory,
      { stateCode: '22', entityId: 'PDN-22-7258', offenseCode: 'LGRA-52' },
      FIXTURE_DAY,
    );
    expect(proposal.isFallback).toBe(true);
    expect(proposal.proposed?.authority.id).toBe('authority.comptroller-queretaro');
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
