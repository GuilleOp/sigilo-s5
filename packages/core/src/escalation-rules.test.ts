// Pruebas de cada regla pública de escalamiento y de alerta con las fechas del escenario de la
// demostración (día 0 = lunes 9 de noviembre de 2026) y de los plazos que corren.
import { ESCALATION_RULES } from '@sigilo/contracts';
import { describe, expect, it } from 'vitest';
import { activeDeadlines, evaluateEscalationRules } from './escalation-rules.ts';
import type { ProcedureSnapshot } from './escalation-rules.ts';

/** Denuncia de Marta: falta grave, identidad sellada, hechos de marzo de 2026. */
function marta(overrides: Partial<ProcedureSnapshot> = {}): ProcedureSnapshot {
  return {
    receivedOn: '2026-11-09',
    mode: 'sealed',
    severity: 'serious',
    occurredPeriod: '2026-03',
    investigationStartedOn: null,
    qualifiedOn: null,
    closedOn: null,
    closureReason: null,
    archiveNotifiedOn: null,
    lastActivityOn: '2026-11-09',
    ...overrides,
  };
}

function keysOn(snapshot: ProcedureSnapshot, today: string): string[] {
  return evaluateEscalationRules(snapshot, today).map((rule) => rule.key);
}

describe('escalation.grave-stalled (LGRA, art. 64, fracc. II)', () => {
  it('se cumple el día 31 si no inició el procedimiento correspondiente, no antes', () => {
    expect(keysOn(marta(), '2026-12-09')).not.toContain('escalation.grave-stalled');
    const [rule] = evaluateEscalationRules(marta(), '2026-12-10');
    expect(rule).toEqual({
      key: 'escalation.grave-stalled',
      effect: 'escalate',
      anchorOn: '2026-11-09',
      dueOn: '2026-12-09',
    });
  });

  it('archivar sin investigar no la satisface; investigar a tiempo sí', () => {
    const archived = marta({ closedOn: '2026-12-09', closureReason: 'insufficient_information' });
    expect(keysOn(archived, '2026-12-10')).toContain('escalation.grave-stalled');
    expect(keysOn(marta({ investigationStartedOn: '2026-12-09' }), '2026-12-10')).not.toContain(
      'escalation.grave-stalled',
    );
    // Iniciar después del vencimiento no borra el incumplimiento.
    expect(keysOn(marta({ investigationStartedOn: '2026-12-11' }), '2026-12-12')).toContain(
      'escalation.grave-stalled',
    );
  });

  it('un cierre que declina la competencia la satisface; una falta no grave no aplica', () => {
    const channeled = marta({ closedOn: '2026-11-20', closureReason: 'channeled' });
    expect(keysOn(channeled, '2026-12-10')).not.toContain('escalation.grave-stalled');
    expect(keysOn(marta({ severity: 'non_serious' }), '2026-12-10')).not.toContain(
      'escalation.grave-stalled',
    );
    expect(keysOn(marta({ severity: 'crime' }), '2026-12-10')).toContain(
      'escalation.grave-stalled',
    );
  });
});

describe('escalation.archive-unnotified (LGRA, art. 100)', () => {
  const archived = marta({
    investigationStartedOn: '2026-11-10',
    closedOn: '2026-12-09',
    closureReason: 'insufficient_information',
  });

  it('cuenta 10 días hábiles desde el archivo y se cumple al día siguiente', () => {
    expect(keysOn(archived, '2026-12-23')).not.toContain('escalation.archive-unnotified');
    const triggered = evaluateEscalationRules(archived, '2026-12-24').find(
      (rule) => rule.key === 'escalation.archive-unnotified',
    );
    expect(triggered).toMatchObject({ anchorOn: '2026-12-09', dueOn: '2026-12-23' });
  });

  it('no se cumple con aviso por el buzón a tiempo, ni para denuncias anónimas', () => {
    const notified = { ...archived, archiveNotifiedOn: '2026-12-10' };
    expect(keysOn(notified, '2027-01-15')).not.toContain('escalation.archive-unnotified');
    expect(keysOn({ ...archived, mode: 'anonymous' }, '2027-01-15')).not.toContain(
      'escalation.archive-unnotified',
    );
    // Otros cierres no son archivo.
    const attended = { ...archived, closureReason: 'attended' as const };
    expect(keysOn(attended, '2027-01-15')).not.toContain('escalation.archive-unnotified');
  });
});

describe('escalation.conflict (LGRA, art. 58) y escalation.archive-signals', () => {
  const archived = marta({ closedOn: '2026-12-09', closureReason: 'insufficient_information' });

  it('escala el mismo día del archivo si hubo posible conflicto sin excusa ni justificación', () => {
    const withConflict = { ...archived, conflictAlertOn: '2026-11-09' };
    expect(keysOn(withConflict, '2026-12-09')).toContain('escalation.conflict');
    expect(
      keysOn({ ...withConflict, conflictExcusedOn: '2026-11-10' }, '2026-12-09'),
    ).not.toContain('escalation.conflict');
    // Regresión (H5): la justificación propia no apaga la regla y además se escala de inmediato.
    const justified = keysOn({ ...withConflict, conflictJustifiedOn: '2026-11-10' }, '2026-12-09');
    expect(justified).toContain('escalation.conflict');
    expect(justified).toContain('escalation.conflict-justified');
    expect(keysOn(archived, '2026-12-09')).not.toContain('escalation.conflict');
    // Sin cierre no hay acto resolutivo.
    expect(keysOn(marta({ conflictAlertOn: '2026-11-09' }), '2026-12-09')).not.toContain(
      'escalation.conflict',
    );
  });

  it('escala de inmediato un cierre que declina una posible falta grave (H2)', () => {
    for (const reason of ['inadmissible', 'channeled', 'joined'] as const) {
      const declined = marta({ closedOn: '2026-11-09', closureReason: reason });
      expect(keysOn(declined, '2026-11-09')).toContain('escalation.declined-serious');
      const nonSerious = marta({
        closedOn: '2026-11-09',
        closureReason: reason,
        severity: 'non_serious',
      });
      expect(keysOn(nonSerious, '2026-11-09')).not.toContain('escalation.declined-serious');
      expect(keysOn({ ...nonSerious, archiveSignalCount: 2 }, '2026-11-09')).toContain(
        'escalation.archive-signals',
      );
    }
    const attended = marta({ closedOn: '2026-11-09', closureReason: 'attended' });
    expect(keysOn(attended, '2026-11-09')).not.toContain('escalation.declined-serious');
  });

  it('escala el archivo con dos o más señales del auditor, no con una', () => {
    expect(keysOn({ ...archived, archiveSignalCount: 2 }, '2026-12-10')).toContain(
      'escalation.archive-signals',
    );
    expect(keysOn({ ...archived, archiveSignalCount: 1 }, '2026-12-10')).not.toContain(
      'escalation.archive-signals',
    );
  });
});

describe('alertas de prescripción (LGRA, art. 74)', () => {
  it('avisa a 12, 6 y 3 meses de los 7 años de una falta grave', () => {
    expect(keysOn(marta(), '2032-02-29')).not.toContain('alert.prescription-12m');
    expect(keysOn(marta(), '2032-03-01')).toContain('alert.prescription-12m');
    expect(keysOn(marta(), '2032-09-01')).toEqual(
      expect.arrayContaining(['alert.prescription-12m', 'alert.prescription-6m']),
    );
    expect(keysOn(marta(), '2032-12-01')).toContain('alert.prescription-3m');
  });

  it('usa 3 años si la falta no es grave y se detiene con la calificación o el cierre', () => {
    const minor = marta({ severity: 'non_serious' });
    expect(keysOn(minor, '2028-03-01')).toContain('alert.prescription-12m');
    const qualified = marta({ severity: 'non_serious', qualifiedOn: '2027-01-15' });
    expect(keysOn(qualified, '2028-03-01')).not.toContain('alert.prescription-12m');
    const closed = marta({ closedOn: '2027-01-15', closureReason: 'attended' });
    expect(keysOn(closed, '2032-03-01')).not.toContain('alert.prescription-12m');
  });
});

describe('alertas de inactividad (LGRA, art. 74)', () => {
  const dormant = marta({ severity: 'non_serious', investigationStartedOn: '2026-11-09' });

  it('avisa el día 151 y alerta el día 181 sin actuaciones', () => {
    expect(keysOn(dormant, '2027-04-08')).not.toContain('alert.inactivity-warning');
    expect(keysOn(dormant, '2027-04-09')).toContain('alert.inactivity-warning');
    expect(keysOn(dormant, '2027-05-08')).not.toContain('alert.inactivity-expiry');
    expect(keysOn(dormant, '2027-05-09')).toContain('alert.inactivity-expiry');
  });

  it('una actuación reciente corre el plazo y el cierre lo detiene', () => {
    expect(keysOn({ ...dormant, lastActivityOn: '2027-03-01' }, '2027-05-09')).not.toContain(
      'alert.inactivity-warning',
    );
    const closed = { ...dormant, closedOn: '2026-12-01', closureReason: 'attended' as const };
    expect(keysOn(closed, '2027-05-09')).not.toContain('alert.inactivity-expiry');
  });
});

describe('catálogo de reglas', () => {
  it('cada regla tiene nombre, explicación, fundamento y un efecto', () => {
    for (const rule of ESCALATION_RULES) {
      expect(rule.name.length).toBeGreaterThan(5);
      expect(rule.explanation.length).toBeGreaterThan(40);
      // Las alertas de inactividad durante la investigación son del prototipo: no citan la
      // caducidad, que solo aplica después de admitido el informe (LGRA, art. 74).
      const isPrototypeAlert =
        rule.key === 'alert.inactivity-warning' || rule.key === 'alert.inactivity-expiry';
      expect(rule.legalBasis.length > 0 || isPrototypeAlert).toBe(true);
      expect(['escalate', 'alert']).toContain(rule.effect);
    }
    expect(new Set(ESCALATION_RULES.map((rule) => rule.key)).size).toBe(ESCALATION_RULES.length);
  });

  it('acepta un catálogo propio para recalcular con otras reglas', () => {
    const only = ESCALATION_RULES.filter((rule) => rule.key === 'alert.inactivity-expiry');
    expect(evaluateEscalationRules(marta(), '2027-05-09', { rules: only })).toHaveLength(1);
  });
});

describe('plazos que corren', () => {
  it('una falta grave recién recibida corre el inicio y la prescripción de 7 años', () => {
    expect(activeDeadlines(marta(), { isAccepted: false })).toEqual([
      { key: 'serious_offense_start', startsOn: '2026-11-09' },
      { key: 'prescription_serious', startsOn: '2026-03-01' },
    ]);
  });

  it('el archivo de una persona identificable corre la notificación y quita los demás', () => {
    const archived = marta({
      investigationStartedOn: '2026-11-10',
      closedOn: '2026-12-09',
      closureReason: 'insufficient_information',
    });
    expect(activeDeadlines(archived, { isAccepted: true })).toEqual([
      { key: 'archive_notification', startsOn: '2026-12-09' },
    ]);
    expect(
      activeDeadlines({ ...archived, archiveNotifiedOn: '2026-12-10' }, { isAccepted: true }),
    ).toEqual([]);
  });

  it('en investigación no corre la caducidad; solo después de admitido el informe', () => {
    const investigating = marta({
      severity: 'non_serious',
      investigationStartedOn: '2026-11-10',
      lastActivityOn: '2026-11-20',
      legalStage: 'investigation',
    });
    expect(activeDeadlines(investigating, { isAccepted: true })).toEqual([
      { key: 'prescription_non_serious', startsOn: '2026-03-01' },
    ]);
    const admitted = marta({
      severity: 'non_serious',
      investigationStartedOn: '2026-11-10',
      qualifiedOn: '2026-12-01',
      lastActivityOn: '2027-01-15',
      legalStage: 'evidence_hearing',
    });
    expect(activeDeadlines(admitted, { isAccepted: true })).toEqual([
      { key: 'inactivity_expiry', startsOn: '2027-01-15' },
    ]);
  });

  it('la inconformidad corre desde la notificación de la calificación de no grave', () => {
    const qualified = marta({
      mode: 'sealed',
      investigationStartedOn: '2026-11-10',
      qualifiedOn: '2026-12-09',
      qualificationSeverity: 'non_serious',
      qualificationOn: '2026-12-09',
      qualificationNotifiedOn: '2026-12-10',
      legalStage: 'qualification',
    });
    expect(activeDeadlines(qualified, { isAccepted: true })).toEqual([
      { key: 'appeal_filing', startsOn: '2026-12-10' },
    ]);
    const appealed = marta({ ...qualified, appealFiledOn: '2026-12-14' });
    expect(activeDeadlines(appealed, { isAccepted: true })).toEqual([
      { key: 'appeal_resolution', startsOn: '2026-12-14' },
    ]);
  });
});

describe('calificación degradada y alertas de inactividad', () => {
  const downgraded = (overrides: Partial<ProcedureSnapshot> = {}) =>
    marta({
      investigationStartedOn: '2026-11-10',
      qualifiedOn: '2026-12-09',
      qualificationSeverity: 'non_serious',
      qualificationOn: '2026-12-09',
      legalStage: 'qualification',
      ...overrides,
    });

  it('escala la calificación de no grave de una falta grave con dos o más señales', () => {
    const keys = (snapshot: ProcedureSnapshot) =>
      evaluateEscalationRules(snapshot, '2026-12-10').map((rule) => rule.key);
    expect(keys(downgraded({ downgradeSignalCount: 2 }))).toContain('escalation.downgrade-signals');
    expect(keys(downgraded({ downgradeSignalCount: 1 }))).not.toContain(
      'escalation.downgrade-signals',
    );
    expect(
      keys(downgraded({ downgradeSignalCount: 3, qualificationSeverity: 'serious' })),
    ).not.toContain('escalation.downgrade-signals');
  });

  it('el conflicto sin excusa se escala desde la calificación, el primer acto resolutivo', () => {
    const rules = evaluateEscalationRules(
      downgraded({ conflictAlertOn: '2026-11-09' }),
      '2026-12-09',
    );
    expect(rules.find((rule) => rule.key === 'escalation.conflict')?.anchorOn).toBe('2026-12-09');
  });

  it('la inactividad en investigación es alerta; la caducidad solo después de la admisión', () => {
    const idle = (legalStage: NonNullable<ProcedureSnapshot['legalStage']>) =>
      evaluateEscalationRules(
        marta({ lastActivityOn: '2026-11-09', investigationStartedOn: '2026-11-09', legalStage }),
        '2027-05-10',
      ).map((rule) => rule.key);
    expect(idle('investigation')).toEqual(
      expect.arrayContaining(['alert.inactivity-warning', 'alert.inactivity-expiry']),
    );
    expect(idle('investigation')).not.toContain('alert.expiry-reached');
    expect(idle('evidence_hearing')).toEqual(
      expect.arrayContaining(['alert.expiry-warning', 'alert.expiry-reached']),
    );
    expect(idle('evidence_hearing')).not.toContain('alert.inactivity-expiry');
  });
});
