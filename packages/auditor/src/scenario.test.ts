// Escenario de la demostración: el auditor marca los 31 acuerdos con plantilla y la calificación
// de Marta como no grave (misma plantilla), no marca los 5 de control, y señala esa calificación
// como degradada (art. 64-I) y el plazo de 30 días para iniciar el procedimiento (art. 64-II).
import { describe, expect, it } from 'vitest';
import { AuditLedgerRecordSchema } from '@sigilo/contracts';
import { runAudit } from './audit.ts';
import { RULES_VERSION } from './config.ts';
import { detectTemplateClosures } from './rules/template-closure.ts';
import {
  controlClosures,
  dormantCase,
  martaCase,
  martaQualification,
  scenarioDay,
  templateArchives,
} from './eval/scenario.ts';
import { SIGNAL_NOTE } from './signal.ts';

const MARTA = 'qualification.marta';

describe('escenario: acuerdos con plantilla (AUD-01, signal.template-closure)', () => {
  const acts = [...templateArchives(), martaQualification(), ...controlClosures()];

  it('marca los 31 acuerdos importados y la calificación de Marta, y ninguno de control', () => {
    const flagged = new Set(detectTemplateClosures(acts).map((signal) => signal.subject.id));
    for (const act of templateArchives()) expect(flagged.has(act.id)).toBe(true);
    expect(flagged.has(MARTA)).toBe(true);
    for (const act of controlClosures()) expect(flagged.has(act.id)).toBe(false);
    expect(flagged.size).toBe(32);
  });

  it('la calificación de Marta coincide con los archivos de la variante 1, con fragmentos y proporción', () => {
    const signal = detectTemplateClosures(acts).find((item) => item.subject.id === MARTA);
    expect(signal?.metrics['matches']).toBe(11);
    expect(signal?.metrics['topSimilarityPermille']).toBeGreaterThanOrEqual(750);
    expect(signal?.metrics['repeatedPermille']).toBeGreaterThan(800);
    expect(signal?.evidence[0]?.actText).toContain(
      'toda vez que no se cuenta con elementos suficientes',
    );
    expect(signal?.note).toBe(SIGNAL_NOTE);
  });
});

describe('escenario: auditoría completa del día 31', () => {
  const report = runAudit({
    acts: [...templateArchives(), martaQualification(), ...controlClosures()],
    cases: [martaCase(), dormantCase()],
    today: scenarioDay(31),
  });
  const forMarta = report.findings.filter(
    (item) => item.signal.subject.id === MARTA || item.signal.subject.id === 'case.marta',
  );

  it('la calificación de Marta tiene AUD-01, AUD-03 y AUD-04; no AUD-02, porque no es un archivo', () => {
    const rules = forMarta.map((item) => item.signal.ruleId).sort();
    expect(rules).toEqual(['AUD-01', 'AUD-03', 'AUD-04']);
    const downgraded = forMarta.find((item) => item.signal.ruleId === 'AUD-03')?.signal;
    expect(downgraded?.basis.references).toEqual([{ law: 'LGRA', article: '64', fraction: 'I' }]);
    expect(downgraded?.basis.text).toMatch(/no afirma que eso haya ocurrido/u);
    expect(downgraded?.evidence[0]?.actText).toContain('calificación como no grave');
    expect(downgraded?.evidence[0]?.counterpart).toMatch(/LGRA, art\. 59/u);
    const deadline = forMarta.find((item) => item.signal.ruleId === 'AUD-04')?.signal;
    expect(deadline?.basis.references).toEqual([{ law: 'LGRA', article: '64', fraction: 'II' }]);
    expect(deadline?.explanation).toMatch(/procedimiento correspondiente/u);
    expect(deadline?.explanation).not.toMatch(/iniciado la investigación/u);
  });

  it('cada señal trae un registro de bitácora válido, sin texto', () => {
    for (const { record, signal } of report.findings) {
      expect(AuditLedgerRecordSchema.parse(record)).toEqual(record);
      expect(record.engine).toEqual({ kind: 'rules', rulesVersion: RULES_VERSION });
      expect(JSON.stringify(record)).not.toContain(signal.subject.id);
    }
  });

  it('nunca usa «falsa», «falso» ni «culpable»', () => {
    const own = report.findings.map(({ signal }) =>
      [signal.name, signal.explanation, signal.basis.text].join(' '),
    );
    expect(own.join(' ')).not.toMatch(/\bfals[oa]s?\b|culpable/iu);
  });

  it('case.queretaro-dormant: inactividad prolongada (sin caducidad) el día 151 y el 182', () => {
    const at = (day: number) =>
      runAudit({ acts: [], cases: [dormantCase()], today: scenarioDay(day) }).findings.map(
        (item) => item.signal,
      );
    expect(at(150)).toEqual([]);
    const [warning] = at(151);
    expect(warning?.key).toBe('signal.prolonged-inactivity');
    expect(warning?.metrics['isOverdue']).toBe(0);
    expect(warning?.basis.text).toMatch(/no aplica a la investigación/u);
    expect(at(182).map((signal) => signal.metrics['isOverdue'])).toEqual([1]);
  });
});
