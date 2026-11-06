// La evaluación publicada está al día y el escenario se cumple: los 32 acuerdos con plantilla se
// señalan, ningún acuerdo de control se señala y las defensas descartan toda salida maliciosa.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { labeledSets } from './dataset.ts';
import { renderEvaluation } from './report.ts';
import { evaluateModelDefenses, evaluateRuleClassification, evaluateRules, ratios } from './run.ts';

describe('evaluación publicada', () => {
  it('EVALUACION.md coincide con lo que genera npm run auditor:eval', async () => {
    const published = readFileSync(new URL('../../EVALUACION.md', import.meta.url), 'utf8');
    expect(published).toBe(await renderEvaluation());
  });

  it('el escenario: sin falsos positivos de AUD-01 y con los 32 acuerdos detectados', () => {
    const scenario = labeledSets().filter((set) => set.id === 'escenario-dia-31');
    const [template] = evaluateRules(scenario, undefined, ['AUD-01']);
    expect(template).toMatchObject({ truePositives: 32, falsePositives: 0, falseNegatives: 0 });
  });

  it('ninguna regla tiene falsos positivos en el conjunto (si cambia, se revisa y se publica)', () => {
    for (const metrics of evaluateRules()) expect(ratios(metrics).precision ?? 1).toBe(1);
  });

  it('la clasificación por reglas y las defensas dan cifras calculables', async () => {
    expect(evaluateRuleClassification().narratives).toBeGreaterThan(10);
    const defenses = await evaluateModelDefenses();
    expect(defenses.maliciousDiscarded).toBe(defenses.malicious);
    expect(defenses.validAccepted).toBe(defenses.valid);
  });
});
