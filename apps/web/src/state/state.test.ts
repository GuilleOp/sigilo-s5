// Pruebas del estado en memoria, la validación por paso y las señales de riesgo.
import { describe, expect, it } from 'vitest';
import { assessRisk } from '@sigilo/huella';
import { createMemoryStore, resetAllStores } from './memory-store.ts';
import { emptyDraft } from './report-draft.ts';
import type { ReportDraft } from './report-draft.ts';
import { buildRiskActions, buildRiskSignals } from './report-risk.ts';
import {
  toComplaintFacts,
  validateEvidenceStep,
  validateFactsStep,
  validateModeStep,
} from './report-validation.ts';

function filledDraft(): ReportDraft {
  const draft = emptyDraft();
  draft.mode = 'anonymous';
  draft.facts = {
    stateCode: '22',
    municipalityCode: '',
    entityId: 'VE-OBRAS',
    offenseCode: 'LGRA-52',
    periodMonth: '03',
    periodYear: '2026',
    accused: 'Servidor Ficticio Dos',
    description: 'Adjudicación directa irregular de un contrato sintético de obra.',
  };
  return draft;
}

describe('memory-store', () => {
  it('notifica cambios y se borra con resetAllStores', () => {
    const store = createMemoryStore(() => ({ value: 0 }));
    let calls = 0;
    store.subscribe(() => (calls += 1));
    store.set(() => ({ value: 5 }));
    expect(store.get().value).toBe(5);
    resetAllStores();
    expect(store.get().value).toBe(0);
    expect(calls).toBe(2);
  });
});

describe('validación', () => {
  it('exige modo y nombre en modo sellado', () => {
    const draft = emptyDraft();
    expect(validateModeStep(draft)).toHaveProperty('mode');
    draft.mode = 'sealed';
    expect(validateModeStep(draft)).toHaveProperty('fullName');
    draft.identity.fullName = 'Persona Denunciante Uno';
    expect(validateModeStep(draft)).toEqual({});
  });

  it('valida los hechos y los convierte al contrato sin municipio vacío', () => {
    const draft = filledDraft();
    expect(validateFactsStep(draft, new Date('2026-10-07T12:00:00'))).toEqual({});
    expect(toComplaintFacts(draft)).not.toHaveProperty('municipalityCode');
    draft.facts.periodYear = '2027';
    expect(validateFactsStep(draft, new Date('2026-10-07T12:00:00'))).toHaveProperty('period');
    expect(validateFactsStep(emptyDraft())).toHaveProperty('description');
  });

  it('exige pruebas limpias', () => {
    const draft = filledDraft();
    draft.evidence.push({
      id: '1',
      fileName: 'foto.jpg',
      kind: 'image',
      original: new Blob(),
      status: 'needs-cleaning',
      clean: [],
    });
    expect(validateEvidenceStep(draft)).toHaveProperty('evidence');
  });
});

describe('riesgo', () => {
  it('sube con GPS sin limpiar y propone acciones', () => {
    const draft = filledDraft();
    draft.facts.municipalityCode = '014';
    draft.facts.description += ' Soy la única auxiliar contable.\u200b';
    draft.evidence.push({
      id: '1',
      fileName: 'foto.jpg',
      kind: 'image',
      original: new Blob(),
      metadata: { hasAnyMetadata: true, gps: { latitude: 0, longitude: 0 }, otherFields: [] },
      status: 'needs-cleaning',
      clean: [],
    });
    const signals = buildRiskSignals(draft, new Date('2026-10-04T22:00:00'));
    expect(assessRisk(signals).level).toBe('high');
    expect(buildRiskActions(signals).map((action) => action.kind)).toEqual([
      'go-evidence',
      'go-facts',
      'strip-invisible',
      'remove-municipality',
    ]);
  });
});
