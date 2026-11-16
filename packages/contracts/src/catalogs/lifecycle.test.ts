// Pruebas del catálogo del ciclo de vida legal: toda etapa se alcanza, cada transición respeta la
// separación de funciones, los recursos y los motivos legales cubren sus esquemas, y la vía penal
// corre aparte.
import { describe, expect, it } from 'vitest';
import {
  AdministrativeStageSchema,
  CriminalStageSchema,
  LegalClosureReasonSchema,
  RemedyKindSchema,
} from '../procedure.ts';
import { AuthorityFunctionSchema, COURT_STAGES, functionForStage } from '../authority-access.ts';
import {
  ADMINISTRATIVE_TRANSITIONS,
  CRIMINAL_REFERRAL_BASES,
  CRIMINAL_TRANSITIONS,
  FEDERAL_FUNDS_RULE,
  findLegalClosureReason,
  findTransition,
  isLegalClosureAllowedAt,
  LEGAL_CLOSURE_REASONS,
  REMEDY_KINDS,
} from './lifecycle.ts';
import { isCriminalRoute } from './criminal-opening.ts';
import { formatLegalReference } from './procedure.ts';

function reachable<T extends string>(transitions: readonly { from: T | null; to: T }[]): Set<T> {
  const seen = new Set<T>();
  const queue: (T | null)[] = [null];
  while (queue.length > 0) {
    const from = queue.shift() ?? null;
    for (const transition of transitions.filter((item) => item.from === from)) {
      if (seen.has(transition.to)) continue;
      seen.add(transition.to);
      queue.push(transition.to);
    }
  }
  return seen;
}

describe('máquina de estados administrativa', () => {
  it('todas las etapas se alcanzan desde la aceptación', () => {
    expect([...reachable(ADMINISTRATIVE_TRANSITIONS)].sort()).toEqual(
      [...AdministrativeStageSchema.options].sort(),
    );
  });

  it('no hay transiciones repetidas', () => {
    const keys = ADMINISTRATIVE_TRANSITIONS.map((item) => `${item.from}->${item.to}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('la investigadora llega hasta el IPRA; el Tribunal solo actúa desde sus etapas', () => {
    for (const transition of ADMINISTRATIVE_TRANSITIONS) {
      if (transition.fn === 'court') {
        const from = transition.from;
        expect(from === 'case_file_sent' || (from !== null && COURT_STAGES.has(from))).toBe(true);
      }
      if (transition.fn === 'investigation') {
        expect(['investigation', 'qualification', 'report_filed']).toContain(transition.to);
      }
    }
    expect(functionForStage('court_received')).toBe('court');
    expect(functionForStage('initial_hearing')).toBe('substantiation');
    expect(AuthorityFunctionSchema.options).toContain('court');
  });

  it('después de la audiencia inicial hay dos ramas, según la calificación', () => {
    expect(findTransition('initial_hearing', 'evidence_hearing')?.severities).toEqual([
      'non_serious',
    ]);
    expect(findTransition('initial_hearing', 'case_file_sent')?.severities).toEqual(['serious']);
    // El Tribunal puede devolver a la rama no grave (LGRA, art. 209 fr. II).
    expect(findTransition('court_received', 'evidence_hearing')).toMatchObject({
      fn: 'court',
      action: 'returned_by_court',
    });
    // No hay saltos: del informe no se pasa directo a la resolución.
    expect(findTransition('report_filed', 'resolution')).toBeUndefined();
  });

  it('la abstención exige fundamento y acuerdo (LGRA, art. 101)', () => {
    expect(findTransition('report_filed', 'abstention')).toMatchObject({
      fn: 'substantiation',
      action: 'abstention_declared',
      requires: ['legalBasis', 'agreement'],
    });
  });
});

describe('vía penal', () => {
  it('todas las etapas penales se alcanzan y corren aparte', () => {
    const fromReferral = reachable([
      { from: null, to: 'criminal_complaint_filed' as const },
      ...CRIMINAL_TRANSITIONS,
    ]);
    expect([...fromReferral].sort()).toEqual([...CriminalStageSchema.options].sort());
  });

  it('la vista al Ministerio Público cita el artículo de quien la da', () => {
    expect(
      CRIMINAL_REFERRAL_BASES.map((basis) => basis.legalBasis.map(formatLegalReference).join()),
    ).toEqual(['LGRA, art. 10, fracc. III', 'LGRA, art. 98', 'CNPP, art. 222']);
  });

  it('las aperturas en la vía penal solo exigen sus fundamentos si va solo por la vía penal', () => {
    expect(isCriminalRoute({ legalStage: null, criminalStage: 'criminal_investigation' })).toBe(
      true,
    );
    expect(isCriminalRoute({ legalStage: 'trial' })).toBe(true);
    expect(
      isCriminalRoute({ legalStage: 'investigation', criminalStage: 'criminal_investigation' }),
    ).toBe(false);
    expect(isCriminalRoute({ legalStage: 'investigation' })).toBe(false);
  });
});

describe('recursos y motivos legales de cierre', () => {
  it('cada recurso tiene plazo, quién lo resuelve y efecto', () => {
    expect(REMEDY_KINDS.map((kind) => kind.key)).toEqual(RemedyKindSchema.options);
    for (const kind of REMEDY_KINDS) {
      expect(kind.stages.length).toBeGreaterThan(0);
      expect(kind.effect.length).toBeGreaterThan(20);
      expect(kind.legalBasis.length).toBeGreaterThan(0);
    }
    expect(REMEDY_KINDS.find((kind) => kind.key === 'inconformity')?.blocks).toEqual([
      'report_admitted',
    ]);
    expect(REMEDY_KINDS.find((kind) => kind.key === 'appeal')?.filedBy).toContain('reporter');
  });

  it('la firmeza espera los plazos de los recursos y el informe no presentado, el de corrección', () => {
    expect(findTransition('resolution', 'final')?.afterDeadlines).toEqual(['revocation_filing']);
    expect(findTransition('court_resolution', 'final')?.afterDeadlines).toEqual([
      'court_appeal_filing',
      'review_filing',
    ]);
    expect(findTransition('report_prevented', 'investigation')?.afterDeadlines).toEqual([
      'report_correction',
    ]);
  });

  it('cada motivo legal tiene su fundamento, su estatus y su etapa', () => {
    expect(LEGAL_CLOSURE_REASONS.map((reason) => reason.key)).toEqual(
      LegalClosureReasonSchema.options,
    );
    const at = (key: string, stage: Parameters<typeof isLegalClosureAllowedAt>[1]) => {
      const reason = findLegalClosureReason(key);
      return reason === undefined ? false : isLegalClosureAllowedAt(reason, stage);
    };
    expect(at('archived', 'investigation')).toBe(true);
    expect(at('archived', 'report_admitted')).toBe(false);
    expect(at('expired', 'investigation')).toBe(false);
    expect(at('expired', 'summoned')).toBe(true);
    expect(at('prescribed', null)).toBe(true);
    // La sanción firme se cierra con sanción desde la firmeza; el nodo exige la inscripción en el S3.
    expect(at('sanctioned', 'resolution')).toBe(false);
    expect(at('sanctioned', 'final')).toBe(true);
    expect(at('sanctioned', 'executed')).toBe(true);
    expect(findLegalClosureReason('incompetence')?.requiresDestination).toBe(true);
  });
});

describe('recursos federales', () => {
  it('nombra a la ASF, la SABG y la FGR con su fundamento, en ambos sentidos', () => {
    expect(FEDERAL_FUNDS_RULE.authorities.map((item) => item.key)).toEqual(['asf', 'sabg', 'fgr']);
    expect(
      FEDERAL_FUNDS_RULE.authorities.flatMap((item) => item.legalBasis.map(formatLegalReference)),
    ).toEqual(['LFRCF, art. 47', 'LFRCF, art. 66 Bis', 'LCF, art. 49', 'CPF, art. 212']);
    expect(FEDERAL_FUNDS_RULE.towardState).toContain('nodo del estado');
  });
});
