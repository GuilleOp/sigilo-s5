// Pruebas unitarias de las reglas AUD-01 a AUD-08, del texto y del registro de bitácora.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Verification } from '@sigilo/contexto-pdn';
import { AUDITOR_CONFIG } from './config.ts';
import { suggestOffensesByRules } from './classify-rules.ts';
import { buildLedgerRecord, digestOf, subjectDigestOf } from './ledger-record.ts';
import {
  detectArchiveAgainstEvidence,
  isLackOfElementsArchive,
} from './rules/archive-against-evidence.ts';
import {
  detectArchiveConcentration,
  detectCorroboratedArchiveRate,
  isCorroborated,
} from './rules/authority-patterns.ts';
import {
  detectDeadlineSignals,
  detectEmptyActivity,
  detectPrePrescriptionActivity,
  prescriptionDueOn,
  reportAdmittedOn,
} from './rules/deadlines.ts';
import {
  actKindOf,
  detectDowngradedQualification,
  qualificationOf,
} from './rules/downgraded-qualification.ts';
import { compareWithAuthority, detectTemplateClosure } from './rules/template-closure.ts';
import { assertNeutralWording, hasForbiddenWording, SIGNAL_NOTE } from './signal.ts';
import {
  containsFragment,
  coveredFragments,
  jaccard,
  sentenceMentioning,
  shingles,
  tokenize,
} from './text.ts';
import type { AuditSignal, CaseRecord, ClosureAct } from './types.ts';

function act(overrides: Partial<ClosureAct> = {}): ClosureAct {
  return {
    id: 'act.1',
    authorityId: 'authority.a',
    fileNumber: 'EXP-0001',
    issuedOn: '2026-06-01',
    reason: 'insufficient_information',
    text: 'Se archiva por falta de elementos.',
    qualification: null,
    caseRef: 'case.1',
    ...overrides,
  };
}

function caseRecord(overrides: Partial<CaseRecord> = {}): CaseRecord {
  return {
    caseRef: 'case.1',
    authorityId: 'authority.a',
    offenseCode: 'LGRA-52',
    receivedOn: '2026-05-01',
    occurredPeriod: '2026-03',
    attachments: [],
    independentReporters: 1,
    verifications: [],
    accusedKey: null,
    supplierKeys: [],
    campaignGroupId: null,
    isReporterIdentifiable: false,
    activities: [],
    ...overrides,
  };
}

const confirmedTaxList: Verification = {
  check: 'tax-list-69b',
  outcome: 'confirmed',
  title: 'El proveedor aparece en la lista tipo 69-B',
  explanation: 'Empresa Ficticia aparece en la lista (Lista ficticia, datos a 2026).',
  evidence: [],
  citations: [
    {
      sourceId: 'l69b',
      label: 'Lista ficticia',
      dataAsOf: '2026-01',
      text: 'Lista ficticia, datos a enero de 2026',
    },
  ],
};

describe('texto', () => {
  it('normaliza expedientes, números, fechas, mayúsculas y acentos', () => {
    expect(
      tokenize('Expediente OIC-INV-0001 del 3 de Mayo: ARCHIVÓ').map((token) => token.norm),
    ).toEqual(['expediente', '#', 'del', '#', 'de', '#', 'archivo']);
  });

  it('Jaccard de shingles y fragmentos cubiertos sobre el texto original', () => {
    const left = shingles(tokenize('uno dos tres cuatro'), 2);
    const right = shingles(tokenize('uno dos tres cinco'), 2);
    expect(jaccard(left, right)).toBeCloseTo(2 / 4);
    expect(jaccard(new Set(), new Set())).toBe(0);
    const text = 'Uno dos tres. Cuatro';
    const result = coveredFragments(text, tokenize(text), 2, new Set(['uno dos']));
    expect(result.fragments.map((fragment) => fragment.text)).toEqual(['Uno dos']);
    expect(result.ratio).toBeCloseTo(0.5);
  });

  it('busca fragmentos sin distinguir acentos y devuelve la oración original', () => {
    expect(containsFragment('El área de compras', 'AREA  de')).toBe(true);
    expect(containsFragment('El área', '')).toBe(false);
    expect(sentenceMentioning('Primero. La cotización adjunta. Fin', ['cotizaci'])).toBe(
      'La cotización adjunta.',
    );
    expect(sentenceMentioning('Nada aquí', ['prueba'])).toBeNull();
  });
});

describe('AUD-01 cierre con plantilla', () => {
  const series = Array.from({ length: 12 }, (_, index) =>
    act({
      id: `act.${index}`,
      fileNumber: `EXP-${index}`,
      issuedOn: `2026-0${1 + (index % 9)}-10`,
      text: `Se determina el archivo del expediente EXP-${index} toda vez que no se cuenta con elementos suficientes para acreditar la infracción.`,
    }),
  );

  it('señala cuando hay al menos minMatches acuerdos parecidos de la misma autoridad', () => {
    const signal = detectTemplateClosure(series[0] ?? act(), series);
    expect(signal?.metrics['matches']).toBe(11);
    expect(signal?.subject).toEqual({ kind: 'closure', id: 'act.0', authorityId: 'authority.a' });
  });

  it('ignora acuerdos de otra autoridad, fuera de la ventana o de motivos excluidos', () => {
    const others = series.map((item) => ({ ...item, authorityId: 'authority.b' }));
    expect(detectTemplateClosure(series[0] ?? act(), [series[0] ?? act(), ...others])).toBeNull();
    const old = series.map((item, index) =>
      index === 0 ? item : { ...item, issuedOn: '2020-01-01' },
    );
    expect(compareWithAuthority(series[0] ?? act(), old).compared).toBe(0);
    const channeled = { ...(series[0] ?? act()), reason: 'channeled' as const };
    expect(detectTemplateClosure(channeled, series)).toBeNull();
  });

  it('respeta los umbrales configurados', () => {
    const strict = { ...AUDITOR_CONFIG.templateClosure, minMatches: 20 };
    expect(detectTemplateClosure(series[0] ?? act(), series, strict)).toBeNull();
  });
});

describe('AUD-02 archivo contra evidencia', () => {
  it('reconoce el archivo por falta de elementos por motivo o por texto', () => {
    expect(isLackOfElementsArchive(act())).toBe(true);
    expect(
      isLackOfElementsArchive(act({ reason: null, text: 'No existen elementos suficientes.' })),
    ).toBe(true);
    expect(isLackOfElementsArchive(act({ reason: 'joined' }))).toBe(false);
    expect(isLackOfElementsArchive(act({ reason: 'other', text: 'Se acumula.' }))).toBe(false);
  });

  it('un acuerdo de calificación nunca es un archivo, aunque diga «no se cuenta con elementos»', () => {
    const text =
      'Se determina la calificación como no grave, toda vez que no se cuenta con elementos suficientes.';
    expect(actKindOf(act({ reason: null, text }))).toBe('qualification');
    expect(isLackOfElementsArchive(act({ reason: null, text }))).toBe(false);
    expect(isLackOfElementsArchive(act({ kind: 'qualification' }))).toBe(false);
    const record = caseRecord({ attachments: [{ label: 'Factura' }] });
    expect(detectArchiveAgainstEvidence(act({ reason: null, text }), record)).toBeNull();
  });

  it('señala pruebas, corroboración y datos confirmados que el acuerdo no menciona', () => {
    const record = caseRecord({
      attachments: [{ label: 'Factura' }],
      independentReporters: 3,
      verifications: [confirmedTaxList],
    });
    const signal = detectArchiveAgainstEvidence(act(), record);
    expect(signal?.metrics).toEqual({ evidenceItems: 3, unaddressed: 3 });
    expect(signal?.evidence[2]?.counterpartSource).toBe('Lista ficticia, datos a enero de 2026');
  });

  it('no señala si el acuerdo se ocupa de todo o si no hay pruebas', () => {
    const record = caseRecord({ attachments: [{ label: 'Factura' }] });
    const motivated = act({
      text: 'Se analizó la prueba aportada (factura) y no acredita la entrega. Por falta de elementos se archiva.',
    });
    expect(detectArchiveAgainstEvidence(motivated, record)).toBeNull();
    expect(detectArchiveAgainstEvidence(act(), caseRecord())).toBeNull();
    const notCovered: Verification = {
      ...confirmedTaxList,
      outcome: 'no_coverage',
      reason: 'record-not-found',
      alternatives: [],
    };
    expect(
      detectArchiveAgainstEvidence(act(), caseRecord({ verifications: [notCovered] })),
    ).toBeNull();
  });
});

describe('AUD-03 calificación degradada', () => {
  it('lee la calificación registrada o del texto', () => {
    expect(qualificationOf(act({ qualification: 'grave' }))).toBe('grave');
    expect(qualificationOf(act({ text: 'Se califica como falta administrativa no grave.' }))).toBe(
      'no-grave',
    );
    expect(qualificationOf(act({ text: 'Se califica como falta grave.' }))).toBe('grave');
    expect(qualificationOf(act({ text: 'Se determina la calificación como no grave.' }))).toBe(
      'no-grave',
    );
    expect(qualificationOf(act())).toBeNull();
  });

  it('señala una conducta grave del catálogo calificada como no grave, citando el art. 64-I', () => {
    const signal = detectDowngradedQualification(act({ qualification: 'no-grave' }), caseRecord());
    expect(signal?.basis.references).toEqual([{ law: 'LGRA', article: '64', fraction: 'I' }]);
    expect(signal?.basis.text).toMatch(/no afirma/u);
    expect(signal?.evidence[0]?.counterpart).toMatch(/LGRA, art\. 52/u);
  });

  it('se dispara sobre un acuerdo de calificación, no solo sobre cierres', () => {
    const qualification = act({
      reason: null,
      kind: 'qualification',
      text: 'Se determina la calificación como no grave del expediente EXP-1.',
    });
    const signal = detectDowngradedQualification(qualification, caseRecord());
    expect(signal?.explanation).toMatch(/en su acuerdo de calificación/u);
    expect(signal?.evidence[0]?.actText).toContain('calificación como no grave');
  });

  it('no señala faltas no graves del catálogo ni calificaciones graves', () => {
    expect(
      detectDowngradedQualification(
        act({ qualification: 'no-grave' }),
        caseRecord({ offenseCode: 'LGRA-49' }),
      ),
    ).toBeNull();
    expect(detectDowngradedQualification(act({ qualification: 'grave' }), caseRecord())).toBeNull();
  });
});

describe('AUD-04, AUD-05 y AUD-08 plazos', () => {
  it('falta grave sin iniciar el procedimiento: por vencer y vencido; iniciado a tiempo, nada', () => {
    const record = caseRecord({ receivedOn: '2026-05-01' });
    expect(detectDeadlineSignals(record, '2026-05-10')).toHaveLength(0);
    expect(detectDeadlineSignals(record, '2026-05-28')[0]?.metrics['isOverdue']).toBe(0);
    const overdue = detectDeadlineSignals(record, '2026-06-05')[0];
    expect(overdue?.metrics['isOverdue']).toBe(1);
    expect(overdue?.explanation).toMatch(/iniciado el procedimiento correspondiente/u);
    const started = caseRecord({
      activities: [{ on: '2026-05-20', kind: 'investigation_started', hasContent: true }],
    });
    expect(detectDeadlineSignals(started, '2026-06-05')).toHaveLength(0);
    const late = caseRecord({
      activities: [{ on: '2026-06-10', kind: 'investigation_started', hasContent: true }],
    });
    expect(detectDeadlineSignals(late, '2026-06-20')[0]?.metrics['daysLate']).toBe(10);
  });

  it('archivo sin notificar a quien es identificable', () => {
    const record = caseRecord({
      offenseCode: 'LGRA-49',
      isReporterIdentifiable: true,
      activities: [{ on: '2026-06-01', kind: 'closure', hasContent: true }],
    });
    const signals = detectDeadlineSignals(record, '2026-06-30');
    expect(signals.map((signal) => signal.evidence[0]?.label)).toEqual(['Notificar el archivo']);
    const notified = {
      ...record,
      activities: [
        ...record.activities,
        { on: '2026-06-05', kind: 'archive_notified' as const, hasContent: true },
      ],
    };
    expect(detectDeadlineSignals(notified, '2026-06-30')).toHaveLength(0);
  });

  it('investigación detenida: inactividad prolongada, sin citar la caducidad', () => {
    const record = caseRecord({
      offenseCode: 'LGRA-49',
      activities: [{ on: '2026-05-01', kind: 'accepted', hasContent: true }],
    });
    expect(detectDeadlineSignals(record, '2026-10-01')).toHaveLength(0);
    const [warning] = detectDeadlineSignals(record, '2026-10-05');
    expect(warning?.key).toBe('signal.prolonged-inactivity');
    expect(warning?.metrics['isOverdue']).toBe(0);
    const [overdue] = detectDeadlineSignals(record, '2026-11-15');
    expect(overdue?.metrics['isOverdue']).toBe(1);
    expect(overdue?.name).toBe('Inactividad prolongada en la investigación');
    expect(`${overdue?.name} ${overdue?.explanation}`).not.toMatch(/caduc/u);
    expect(overdue?.basis.text).toMatch(/no aplica a la investigación/u);
  });

  it('procedimiento ya admitido el informe: caducidad de la instancia (art. 74)', () => {
    const record = caseRecord({
      offenseCode: 'LGRA-49',
      activities: [
        { on: '2026-01-10', kind: 'accepted', hasContent: true },
        { on: '2026-02-02', kind: 'report_admitted', hasContent: true },
      ],
    });
    expect(reportAdmittedOn(record)).toBe('2026-02-02');
    const [signal] = detectDeadlineSignals(record, '2026-09-01');
    expect(signal?.key).toBe('signal.deadline');
    expect(signal?.evidence[0]?.label).toBe('Caducidad por inactividad');
    expect(signal?.explanation).toMatch(/a solicitud del presunto infractor/u);
    expect(signal?.metrics['isOverdue']).toBe(1);
  });

  it('actuación vacía tras 4 meses sin contenido', () => {
    const record = caseRecord({
      activities: [
        { on: '2026-05-02', kind: 'accepted', hasContent: true },
        { on: '2026-06-01', kind: 'note', hasContent: false },
        { on: '2026-09-15', kind: 'note', hasContent: false },
      ],
    });
    const signals = detectEmptyActivity(record);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.metrics['idleDays']).toBe(136);
    expect(signals[0]?.metrics['isProcedure']).toBe(0);
    expect(signals[0]?.explanation).not.toMatch(/caducidad/u);
    const admitted = caseRecord({
      activities: [
        { on: '2026-05-02', kind: 'report_admitted', hasContent: true },
        { on: '2026-09-15', kind: 'note', hasContent: false },
      ],
    });
    const [procedure] = detectEmptyActivity(admitted);
    expect(procedure?.metrics['isProcedure']).toBe(1);
    expect(procedure?.basis.text).toMatch(/a solicitud del presunto infractor/u);
  });

  it('movimiento justo antes de prescribir tras meses sin actuaciones', () => {
    const record = caseRecord({
      offenseCode: 'LGRA-49',
      occurredPeriod: '2024-01',
      receivedOn: '2024-02-01',
    });
    expect(prescriptionDueOn(record)).toEqual({
      key: 'prescription_non_serious',
      dueOn: '2027-01-01',
    });
    const moved = {
      ...record,
      activities: [{ on: '2026-12-01', kind: 'qualification' as const, hasContent: true }],
    };
    expect(detectPrePrescriptionActivity(moved)?.metrics).toEqual({
      daysBefore: 31,
      idleDays: 1034,
    });
    const steady = {
      ...record,
      activities: [
        { on: '2026-10-15', kind: 'note' as const, hasContent: true },
        { on: '2026-12-01', kind: 'qualification' as const, hasContent: true },
      ],
    };
    expect(detectPrePrescriptionActivity(steady)).toBeNull();
  });
});

describe('AUD-06 y AUD-07 patrones por autoridad', () => {
  const corroborated = (index: number, extra: Partial<CaseRecord> = {}): CaseRecord =>
    caseRecord({
      caseRef: `case.${index}`,
      receivedOn: '2026-03-01',
      independentReporters: 2,
      ...extra,
    });
  const archive = (index: number): ClosureAct =>
    act({ id: `act.${index}`, caseRef: `case.${index}` });

  it('tasa de archivo en casos corroborados con mínimo de casos', () => {
    const cases = [1, 2, 3, 4, 5].map((index) => corroborated(index));
    const acts = [1, 2, 3].map(archive);
    expect(isCorroborated(cases[0] ?? caseRecord())).toBe(true);
    expect(
      detectCorroboratedArchiveRate('authority.a', cases, acts, '2026-07-01')?.metrics,
    ).toEqual({
      corroboratedCases: 5,
      archived: 3,
      ratePermille: 600,
    });
    expect(
      detectCorroboratedArchiveRate('authority.a', cases.slice(0, 4), acts, '2026-07-01'),
    ).toBeNull();
  });

  it('concentración en un denunciado; una campaña cuenta como una denuncia', () => {
    const cases = [1, 2, 3].map((index) => corroborated(index, { accusedKey: 'abc' }));
    const acts = [1, 2, 3].map(archive);
    expect(detectArchiveConcentration('authority.a', cases, acts, '2026-07-01')).toHaveLength(1);
    const campaign = cases.map((record) => ({ ...record, campaignGroupId: 'group.1' }));
    expect(detectArchiveConcentration('authority.a', campaign, acts, '2026-07-01')).toHaveLength(0);
  });
});

describe('lenguaje y bitácora', () => {
  it('rechaza señales con palabras prohibidas en sus propios textos', () => {
    const signal = detectDowngradedQualification(
      act({ qualification: 'no-grave' }),
      caseRecord(),
    ) as AuditSignal;
    expect(() => assertNeutralWording(signal)).not.toThrow();
    expect(() =>
      assertNeutralWording({ ...signal, explanation: 'La denuncia es falsa.' }),
    ).toThrow();
    expect(hasForbiddenWording('persona culpable')).toBe(true);
    expect(signal.note).toBe(SIGNAL_NOTE);
  });

  it('el registro lleva digestos deterministas y nunca el texto', () => {
    expect(digestOf({ b: 1.5, a: 'x' })).toBe(digestOf({ a: 'x', b: 1.5 }));
    expect(subjectDigestOf('case.1')).toMatch(/^[0-9a-f]{64}$/u);
    const record = buildLedgerRecord({
      ruleId: 'AUD-03',
      signalKey: 'signal.downgraded-qualification',
      engine: { kind: 'rules', rulesVersion: '1.0.0' },
      subject: { kind: 'closure', id: 'act.1' },
      input: { text: 'secreto' },
      output: {},
      result: 'flagged',
      at: '2026-06-01',
    });
    expect(JSON.stringify(record)).not.toContain('secreto');
  });

  it('config/umbrales.json publica exactamente la configuración del código', () => {
    const published: unknown = JSON.parse(
      readFileSync(new URL('../config/umbrales.json', import.meta.url), 'utf8'),
    );
    expect(published).toEqual(AUDITOR_CONFIG);
  });
});

describe('clasificación orientativa por reglas', () => {
  it('sugiere claves del catálogo con el fragmento que las apoya', () => {
    const [first] = suggestOffensesByRules(
      'El jefe pidió dinero a cambio de firmar. Lo demás bien.',
    );
    expect(first?.offenseCode).toBe('LGRA-52');
    expect(first?.supportingFragment).toBe('El jefe pidió dinero a cambio de firmar.');
    expect(suggestOffensesByRules('No pasó nada relevante.')).toEqual([]);
  });
});
