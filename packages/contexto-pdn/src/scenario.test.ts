// Reproduce los resultados esperados de docs/demo-escenario.md con las fuentes sintéticas:
// conflicto de interés, contratos, lista tipo 69-B, sanciones y prioridad (Marta alta, atacante más baja).
import { describe, expect, it } from 'vitest';
import { addDays } from './citation.ts';
import { checkConflictOfInterest } from './conflict.ts';
import { extractContractClaims, verifyCitedContract } from './contract.ts';
import type { ContractVerification } from './contract.ts';
import { pickSource } from './coverage.ts';
import { buildContextSheet } from './priority.ts';
import { checkUnverifiableSanction, verifySanction } from './sanction.ts';
import type { SanctionClaim } from './sanction.ts';
import {
  createSyntheticSources,
  DFPS,
  IFFE,
  SCENARIO_DAY_ZERO,
  SYNTHETIC_STATE_OAXACA,
} from './synthetic-sources.ts';
import { checkContractSuppliers } from './tax-list.ts';
import type { PersonRef, SanctionsSource, Verification } from './types.ts';

const day = (offset: number): string => addDays(SCENARIO_DAY_ZERO, offset);

const MARTA_NARRATIVE =
  'En marzo de 2026 el Departamento de Compras del Instituto Federal Ficticio de Equipamiento adjudicó de forma directa el contrato IFFE-AD-2026-0042 (ocds-fict00-IFFE-AD-2026-0042) a Comercializadora Ficticia Ejemplo, S.A. de C.V., por 1,480,000 pesos, para comprar equipo de cómputo.';
const ATTACK_3_NARRATIVE =
  'El director de la Delegación Federal Ficticia de Programas Sociales adjudicó directamente el contrato ocds-fict00-DFPS-LP-2026-0007 a una empresa de su cuñado y cobra comisiones a los proveedores. Todos lo saben.';

const oicHead: PersonRef = {
  fullName: 'Servidora Ficticia Dos',
  institution: IFFE,
  stateCode: '00',
};
const purchasingHead: PersonRef = {
  fullName: 'Servidor Ficticio Uno',
  institution: IFFE,
  stateCode: '00',
};
const marta: PersonRef = { fullName: 'Marta Ejemplo', institution: IFFE, stateCode: '00' };

function everyText(value: unknown): string {
  return JSON.stringify(value);
}

function verifyContract(
  narrative: string,
  sources = createSyntheticSources(),
): ContractVerification {
  const [claim] = extractContractClaims(narrative);
  if (claim === undefined) throw new Error('sin contrato');
  return verifyCitedContract({
    source: sources.s6,
    matrix: sources.matrix,
    stateCode: '00',
    claim,
    date: '2026-03',
  });
}

function s3For(
  sources: ReturnType<typeof createSyntheticSources>,
  stateCode: string,
): SanctionsSource {
  const source = pickSource(sources.s3, stateCode);
  if (source === null) throw new Error('sin fuente');
  return source;
}

describe('conflicto de interés antes de turnar (rule.conflict-of-interest)', () => {
  it('case.marta: dos organizaciones en común, sin bloquear el turnado', () => {
    const sources = createSyntheticSources();
    const result = checkConflictOfInterest({
      matrix: sources.matrix,
      s1: sources.s1,
      s2: sources.s2,
      authorityHead: oicHead,
      accused: purchasingHead,
    });
    expect(result).toMatchObject({
      outcome: 'possible-conflict',
      blocksRouting: false,
      requiresExcuseOrJustification: true,
    });
    expect(result.alerts).toHaveLength(1);
    const alert = result.alerts[0];
    expect(alert?.kind).toBe('conflict.shared-interest');
    expect(alert?.evidence.map((item) => item.value)).toEqual([
      'Inmobiliaria Ficticia Ejemplo, S.A. de C.V.',
      'Asociación Ficticia de Egresados Ejemplo, A.C.',
    ]);
    // La evidencia nombra organizaciones, no porcentajes, y cita la fuente con fecha.
    expect(everyText(alert)).not.toMatch(/%|porcentaje/u);
    expect(alert?.explanation).toMatch(/S1 federal \(sintético\), datos a 9 de noviembre de 2026/u);
    expect(result.summary).toMatch(/LGRA, art\. 58/u);
  });

  it('control negativo: el resto del área no tiene intereses en común', () => {
    const sources = createSyntheticSources();
    const result = checkConflictOfInterest({
      matrix: sources.matrix,
      s1: sources.s1,
      s2: sources.s2,
      authorityHead: oicHead,
      accused: marta,
    });
    expect(result.outcome).toBe('none-found');
    expect(result.summary).toMatch(/no descarta/u);
  });

  it('cadena de mando de S2: el jefe de compras es superior inmediato de Marta', () => {
    const sources = createSyntheticSources();
    const result = checkConflictOfInterest({
      matrix: sources.matrix,
      s1: sources.s1,
      s2: sources.s2,
      authorityHead: purchasingHead,
      accused: marta,
    });
    const chain = result.alerts.find((alert) => alert.kind === 'conflict.chain-of-command');
    expect(chain?.explanation).toMatch(/superior inmediato/u);
    expect(chain?.evidence[0]?.value).toBe(
      'Servidor Ficticio Uno, Jefe del Departamento de Compras',
    );
    expect(result.blocksRouting).toBe(false);
  });

  it('una entidad sin S1 ni S2 da «sin cobertura», nunca «sin conflicto»', () => {
    const sources = createSyntheticSources();
    const result = checkConflictOfInterest({
      matrix: sources.matrix,
      s1: sources.s1,
      s2: sources.s2,
      authorityHead: {
        fullName: 'Persona Ficticia',
        institution: 'Contraloría Ficticia de Oaxaca',
        stateCode: SYNTHETIC_STATE_OAXACA,
      },
      accused: {
        fullName: 'Otra Persona Ficticia',
        institution: 'Ente Ficticio',
        stateCode: SYNTHETIC_STATE_OAXACA,
      },
    });
    expect(result.outcome).toBe('no_coverage');
    expect(result.gaps.map((gap) => gap.reason)).toEqual([
      'state-without-system',
      'state-without-system',
    ]);
  });
});

describe('contratos citados y lista tipo 69-B (signal.public-record-inconsistency)', () => {
  it('case.marta: el contrato existe y coincide (adjudicación directa por urgencia)', () => {
    const result = verifyContract(MARTA_NARRATIVE);
    expect(result.outcome).toBe('confirmed');
    expect(result.record?.method).toBe('direct');
    expect(result.explanation).toMatch(/S6 federal \(sintético\), datos a/u);
    expect(result.evidence.map((item) => item.label)).toContain('Justificación registrada');
  });

  it('case.attack-3: inconsistente con el S6 (licitación pública con 4 participantes)', () => {
    const result = verifyContract(ATTACK_3_NARRATIVE);
    expect(result.outcome).toBe('contradicted');
    expect(result.title).toBe('Inconsistente con registros públicos');
    expect(result.explanation).toMatch(
      /registra este contrato como licitación pública con 4 participantes/u,
    );
  });

  it('nunca etiqueta una denuncia como falsa', () => {
    const all = [verifyContract(MARTA_NARRATIVE), verifyContract(ATTACK_3_NARRATIVE)];
    expect(everyText(all)).not.toMatch(/fals[oa]/iu);
  });

  it('un procedimiento que no aparece es «sin cobertura», no «inconsistente»', () => {
    const sources = createSyntheticSources();
    const result = verifyCitedContract({
      source: sources.s6,
      matrix: sources.matrix,
      stateCode: '00',
      claim: { ocid: 'ocds-fict00-IFFE-AD-2026-9999', method: 'direct' },
    });
    expect(result).toMatchObject({
      outcome: 'no_coverage',
      reason: 'record-not-found',
      record: null,
    });
    if (result.outcome === 'no_coverage') expect(result.alternatives.length).toBeGreaterThan(0);
  });

  it('un contrato de una entidad sin S6 es «sin cobertura» por la matriz', () => {
    const sources = createSyntheticSources();
    const result = verifyCitedContract({
      source: sources.s6,
      matrix: sources.matrix,
      stateCode: '22',
      claim: { ocid: 'ocds-fict00-X-1' },
    });
    expect(result).toMatchObject({ outcome: 'no_coverage', reason: 'state-without-system' });
  });

  it('el comprador citado y no conectado se informa como «institución no conectada»', () => {
    const sources = createSyntheticSources();
    const result = verifyCitedContract({
      source: { ...sources.s6, scope: { stateCodes: ['00'], institutionKeys: [] } },
      matrix: sources.matrix,
      stateCode: '00',
      claim: { ocid: 'ocds-fict00-NADA-1', buyer: 'Oficina Federal Ficticia de Aduanas' },
    });
    expect(result).toMatchObject({ outcome: 'no_coverage', reason: 'institution-not-connected' });
  });

  it('el comprador o el proveedor distintos también son inconsistencias', () => {
    const sources = createSyntheticSources();
    const result = verifyCitedContract({
      source: sources.s6,
      matrix: sources.matrix,
      stateCode: '00',
      claim: {
        ocid: 'ocds-fict00-DFPS-LP-2026-0007',
        buyer: IFFE,
        supplier: 'Comercializadora Ficticia Ejemplo, S. A. de C. V.',
      },
    });
    expect(result.outcome).toBe('contradicted');
    if (result.outcome === 'contradicted')
      expect(result.differences.map((item) => item.field)).toEqual(['buyer', 'supplier']);
    const same = verifyCitedContract({
      source: sources.s6,
      matrix: sources.matrix,
      stateCode: '00',
      claim: {
        ocid: 'ocds-fict00-DFPS-LP-2026-0007',
        buyer: DFPS,
        supplier: 'SERVICIOS FICTICIOS EJEMPLO DOS SA DE CV',
        method: 'open',
      },
    });
    expect(same.outcome).toBe('confirmed');
  });

  it('el proveedor de Marta aparece en la lista tipo 69-B; el de la Delegación no', () => {
    const sources = createSyntheticSources();
    const martaRecord = verifyContract(MARTA_NARRATIVE, sources).record;
    const attackRecord = verifyContract(ATTACK_3_NARRATIVE, sources).record;
    if (martaRecord === null || attackRecord === null) throw new Error('sin registro');
    const [listed] = checkContractSuppliers(sources.taxList, martaRecord);
    expect(listed).toMatchObject({
      outcome: 'confirmed',
      title: 'El proveedor aparece en la lista tipo 69-B',
    });
    expect(listed?.explanation).toMatch(/«Definitivo»/u);
    const [notListed] = checkContractSuppliers(sources.taxList, attackRecord);
    expect(notListed).toMatchObject({ outcome: 'no_coverage', reason: 'record-not-found' });
  });
});

describe('verificación de sanciones contra S3 (check.s3-sanction)', () => {
  const claim = (overrides: Partial<SanctionClaim>): SanctionClaim => ({
    fileNumber: '',
    personName: '',
    sanction: '',
    institution: IFFE,
    stateCode: '00',
    declaredOn: day(0),
    ...overrides,
  });

  it('case.sanction-contradicted: el registro dice otra cosa', () => {
    const sources = createSyntheticSources();
    const result = verifySanction({
      source: s3For(sources, '00'),
      matrix: sources.matrix,
      claim: claim({
        fileNumber: 'OIC-IFFE-RES-0007',
        personName: 'Servidor Ficticio Seis',
        sanction: 'suspensión de 30 días',
        declaredOn: day(-60),
      }),
    });
    expect(result).toMatchObject({
      outcome: 'contradicted',
      title: 'El registro público de sanciones dice otra cosa',
    });
    expect(result.explanation).toMatch(/Amonestación privada/u);
  });

  it('case.sanction-not-found: «sin cobertura» y, pasado el plazo, «sanción no verificable»', () => {
    const sources = createSyntheticSources();
    const declared = claim({
      fileNumber: 'OIC-IFFE-RES-0009',
      personName: 'Servidor Ficticio Siete',
      sanction: 'amonestación pública',
      declaredOn: day(-50),
    });
    const result = verifySanction({
      source: s3For(sources, '00'),
      matrix: sources.matrix,
      claim: declared,
    });
    expect(result).toMatchObject({ outcome: 'no_coverage', reason: 'record-not-found' });
    expect(result.title).toMatch(/Que no aparezca no significa que la sanción no exista/u);
    const flag = checkUnverifiableSanction({
      claim: declared,
      verification: result,
      today: day(0),
    });
    expect(flag.isFlagged).toBe(true);
    expect(flag.explanation).toMatch(/^Sanción no verificable/u);
    expect(
      checkUnverifiableSanction({ claim: declared, verification: result, today: day(-40) })
        .isFlagged,
    ).toBe(false);
    expect(
      checkUnverifiableSanction({
        claim: declared,
        verification: result,
        today: day(-40),
        config: { publicationDeadlineDays: 5 },
      }).isFlagged,
    ).toBe(true);
    expect(
      checkUnverifiableSanction({ claim: null, verification: result, today: day(0) }).isFlagged,
    ).toBe(false);
  });

  it('case.sanction-uncovered: entidad sin S3; nunca se marca como no verificable', () => {
    const sources = createSyntheticSources();
    const declared = claim({
      fileNumber: 'CFE-RES-0003',
      personName: 'Persona Ficticia',
      sanction: 'inhabilitación de 1 año',
      institution: 'Contraloría Ficticia de Oaxaca',
      stateCode: SYNTHETIC_STATE_OAXACA,
      declaredOn: day(-45),
    });
    const result = verifySanction({
      source: s3For(sources, SYNTHETIC_STATE_OAXACA),
      matrix: sources.matrix,
      claim: declared,
    });
    expect(result).toMatchObject({ outcome: 'no_coverage', reason: 'state-without-system' });
    expect(
      checkUnverifiableSanction({ claim: declared, verification: result, today: day(0) }).isFlagged,
    ).toBe(false);
  });

  it('case.sanction-queretaro: confirmada en el S3 de Querétaro con su fecha de corte', () => {
    const sources = createSyntheticSources();
    const result = verifySanction({
      source: s3For(sources, '22'),
      matrix: sources.matrix,
      claim: claim({
        fileNumber: 'CEF-RES-0004',
        personName: 'Servidor Ficticio Ocho',
        sanction: 'Amonestación privada',
        institution: 'Secretaría de Finanzas Estatal Ficticia',
        stateCode: '22',
        declaredOn: day(-90),
      }),
    });
    expect(result).toMatchObject({
      outcome: 'confirmed',
      title: 'Confirmada en el registro público de sanciones',
    });
    expect(result.citations[0]?.text).toBe(
      'S3 de Querétaro (sintético), datos a 8 de noviembre de 2026',
    );
  });

  it('una institución no conectada a S3 es «sin cobertura» con su motivo', () => {
    const sources = createSyntheticSources();
    const result = verifySanction({
      source: s3For(sources, '00'),
      matrix: sources.matrix,
      claim: claim({
        fileNumber: 'X-1',
        personName: 'Persona',
        sanction: 'amonestación',
        institution: 'Oficina Federal Ficticia de Aduanas',
      }),
    });
    expect(result).toMatchObject({ outcome: 'no_coverage', reason: 'institution-not-connected' });
  });

  it('un expediente de otra entidad no se usa para verificar', () => {
    const sources = createSyntheticSources();
    const result = verifySanction({
      source: s3For(sources, '00'),
      matrix: sources.matrix,
      claim: claim({
        fileNumber: 'CEF-RES-0004',
        personName: 'Servidor Ficticio Ocho',
        sanction: 'amonestación privada',
      }),
    });
    expect(result).toMatchObject({ outcome: 'no_coverage', reason: 'record-not-found' });
  });

  it('case.marta: la inhabilitación aparece en S3 a partir del día 95', () => {
    const martaClaim = claim({
      fileNumber: 'TFF-SALA-0001',
      personName: 'Servidor Ficticio Uno',
      sanction: 'Inhabilitación de 1 año',
      declaredOn: day(95),
    });
    const before = createSyntheticSources({ today: day(94) });
    expect(
      verifySanction({ source: s3For(before, '00'), matrix: before.matrix, claim: martaClaim })
        .outcome,
    ).toBe('no_coverage');
    const after = createSyntheticSources({ today: day(95) });
    expect(
      verifySanction({ source: s3For(after, '00'), matrix: after.matrix, claim: martaClaim })
        .outcome,
    ).toBe('confirmed');
  });
});

describe('ficha de contexto y prioridad explicable', () => {
  function martaSheet(): ReturnType<typeof buildContextSheet> {
    const sources = createSyntheticSources({ today: day(3) });
    const contract = verifyContract(MARTA_NARRATIVE, sources);
    if (contract.record === null) throw new Error('sin registro');
    return buildContextSheet({
      offenseCode: 'LGRA-59',
      independentReporters: 2,
      contract: { verification: contract, source: sources.s6 },
      taxList: checkContractSuppliers(sources.taxList, contract.record),
      conflict: checkConflictOfInterest({
        matrix: sources.matrix,
        s1: sources.s1,
        s2: sources.s2,
        authorityHead: oicHead,
        accused: purchasingHead,
      }),
    });
  }

  function attackSheet(narrative: string | null): ReturnType<typeof buildContextSheet> {
    const sources = createSyntheticSources({ today: day(2) });
    const contract = narrative === null ? undefined : verifyContract(narrative, sources);
    return buildContextSheet({
      offenseCode: 'LGRA-52',
      independentReporters: 1,
      isPossibleCampaign: true,
      ...(contract === undefined
        ? {}
        : { contract: { verification: contract, source: sources.s6 } }),
      ...(contract?.record
        ? { taxList: checkContractSuppliers(sources.taxList, contract.record) }
        : {}),
    });
  }

  it('case.marta: prioridad alta con cada factor, su peso y su fuente', () => {
    const sheet = martaSheet();
    expect(sheet.priority.level).toBe('high');
    expect(Number.isInteger(sheet.priority.score)).toBe(true);
    expect(sheet.priority.factors.map((factor) => [factor.id, factor.points])).toEqual([
      ['offense-grave', 30],
      ['contract-direct-award', 15],
      ['contract-large-amount', 10],
      ['supplier-tax-list-69b', 20],
      ['independent-corroboration', 10],
      ['conflict-of-interest', 0],
    ]);
    expect(sheet.priority.score).toBe(85);
    const direct = sheet.priority.factors.find((factor) => factor.id === 'contract-direct-award');
    expect(direct?.citation?.text).toMatch(/^S6 federal \(sintético\), datos a /u);
    expect(sheet.facts.every((fact) => fact.citation.text.includes('datos a'))).toBe(true);
    expect(
      sheet.notices.some(
        (notice) => notice.includes('intereses') || notice.includes('organizaciones'),
      ),
    ).toBe(true);
  });

  it('las denuncias del atacante tienen prioridad más baja que la de Marta', () => {
    const marta = martaSheet().priority.score;
    const attacks = [attackSheet(null), attackSheet(null), attackSheet(ATTACK_3_NARRATIVE)];
    for (const sheet of attacks) {
      expect(sheet.priority.score).toBeLessThan(marta);
      expect(sheet.priority.level).not.toBe('high');
    }
    const third = attacks[2];
    expect(third?.priority.factors.map((factor) => factor.id)).toEqual([
      'offense-grave',
      'public-record-inconsistency',
      'possible-campaign',
    ]);
    expect(third?.notices.join(' ')).toMatch(/licitación pública con 4 participantes/u);
    expect(everyText(attacks)).not.toMatch(/fals[oa]/iu);
  });

  it('la corroboración tiene tope y una sola persona no suma', () => {
    const base = { offenseCode: 'LGRA-49' };
    expect(buildContextSheet({ ...base, independentReporters: 1 }).priority).toMatchObject({
      score: 0,
      level: 'low',
    });
    expect(buildContextSheet({ ...base, independentReporters: 10 }).priority.score).toBe(30);
  });
});

describe('textos para la autoridad', () => {
  it('toda verificación cita la fuente con su fecha en español', () => {
    const sources = createSyntheticSources();
    const results: Verification[] = [
      verifyContract(MARTA_NARRATIVE, sources),
      verifyContract(ATTACK_3_NARRATIVE, sources),
    ];
    for (const result of results) {
      expect(result.citations.length).toBeGreaterThan(0);
      expect(result.explanation).toMatch(/datos a \d{1,2} de [a-z]+ de \d{4}/u);
    }
  });
});
