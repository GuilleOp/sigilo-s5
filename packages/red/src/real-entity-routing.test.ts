// Ruteo de entes REALES del directorio de la PDN con el directorio ficticio de la demostración: se
// rutean por orden de gobierno y entidad (nunca por ente específico) o van al buzón general. El
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

  it('un ente estatal real sin autoridad en el directorio va al buzón general', () => {
    const proposal = proposeCompetentAuthority(
      directory,
      { stateCode: '31', entityId: 'PDN-31-10135', offenseCode: 'LGRA-52' },
      FIXTURE_DAY,
    );
    expect(proposal.status).toBe('inbox');
    expect(proposal.proposed?.authority.id).toBe('authority.buzon-federal');
    expect(proposal.reasons.join(' ')).toContain('ente del orden estatal');
  });
});
