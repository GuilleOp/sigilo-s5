// Pruebas del factor de anonimato en el semáforo de Huella Cero.
import { assessRisk } from '@sigilo/huella/risk';
import type { RiskSignals } from '@sigilo/huella/risk';
import { describe, expect, it } from 'vitest';
import { assessAnonymityGroup } from './assess.ts';
import { DEMO_FEDERAL_FRAGMENT, DEMO_STATE_FRAGMENT } from './demo-fragment.ts';
import { parseAnonymityFragment } from './fragment.ts';
import {
  anonymityRiskReason,
  WEIGHT_ANONYMITY_HIGH,
  WEIGHT_ANONYMITY_UNKNOWN,
  withAnonymityFactor,
} from './risk-factor.ts';

const base: RiskSignals = {
  mode: 'sealed',
  evidence: [],
  textFindings: [],
  invisibleCharacters: 0,
  locationPrecision: 'state',
};
const federal = {
  kind: 'fragment',
  fragment: parseAnonymityFragment(DEMO_FEDERAL_FRAGMENT),
  cutoffDate: '2026-10-07',
} as const;
const state = {
  kind: 'fragment',
  fragment: parseAnonymityFragment(DEMO_STATE_FRAGMENT),
  cutoffDate: '2026-10-07',
} as const;
const marta = assessAnonymityGroup(federal, {
  ente: 'Instituto Federal Ficticio de Equipamiento',
  area: 'Departamento de Compras',
});

describe('withAnonymityFactor', () => {
  it('un grupo amplio no suma ni cambia la evaluación', () => {
    const low = assessAnonymityGroup(state, {
      ente: 'Ayuntamiento de Villa Ejemplo',
      area: 'Dirección de Obras Públicas',
    });
    expect(anonymityRiskReason(low)).toBeNull();
    const risk = assessRisk(base);
    expect(withAnonymityFactor(risk, low)).toBe(risk);
  });

  it('un grupo pequeño solo llega a riesgo medio; con un dato identificable, a alto', () => {
    const clean = withAnonymityFactor(assessRisk(base), marta);
    expect(clean).toMatchObject({ level: 'medium', score: WEIGHT_ANONYMITY_HIGH });
    const withFinding = withAnonymityFactor(
      assessRisk({
        ...base,
        textFindings: [
          { kind: 'uniqueness', start: 0, end: 1, excerpt: 'x', severity: 'high', suggestion: 'x' },
        ],
      }),
      marta,
    );
    expect(withFinding.level).toBe('high');
    expect(withFinding.reasons[0]?.weight).toBe(WEIGHT_ANONYMITY_HIGH);
  });

  it('sin datos suma lo suficiente para no mostrar riesgo bajo', () => {
    const unknown = assessAnonymityGroup(
      { kind: 'no-data', stateCode: '22', stateName: 'Querétaro', cutoffDate: null },
      { ente: 'X' },
    );
    const result = withAnonymityFactor(assessRisk(base), unknown);
    expect(result).toMatchObject({ level: 'medium', score: WEIGHT_ANONYMITY_UNKNOWN });
    expect(result.reasons[0]?.text).toMatch(/Por precaución/u);
  });

  it('respeta el tope de 100', () => {
    const heavy = assessRisk({
      ...base,
      evidence: [
        { hadGps: true, hadDevice: true, sanitized: false },
        { hadGps: true, hadDevice: true, sanitized: false },
      ],
    });
    expect(withAnonymityFactor(heavy, marta).score).toBe(100);
  });
});
