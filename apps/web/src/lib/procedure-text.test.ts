// Pruebas de los textos del trámite: «turnada», calificación como no grave con la ventana de
// inconformidad de 5 días hábiles, archivo con escalamiento, folio nuevo del turnado entre nodos y
// lo que falta de un plazo.
import { describe, expect, it } from 'vitest';
import type { ProcedureView, QualificationView } from '@sigilo/contracts';
import { describeRemaining } from './deadline-text.ts';
import {
  appealWindow,
  NON_SERIOUS_HEADLINE,
  nextStep,
  procedureHeadline,
  ROUTED_HEADLINE,
  transferredFolio,
} from './procedure-text.ts';

function procedure(patch: Partial<ProcedureView> = {}): ProcedureView {
  return {
    managementState: 'routed',
    managementStateName: 'Turnada',
    explanation: 'Turnar significa enviar tu denuncia a la institución que puede investigarla.',
    steps: [],
    deadlines: [],
    rules: [],
    ...patch,
  };
}

const AGREEMENT =
  'Con fundamento en el artículo 100 de la Ley General de Responsabilidades Administrativas, se califica.';

const NON_SERIOUS: QualificationView = {
  on: '2026-12-09',
  legalOn: '2026-12-09',
  severity: 'non_serious',
  severityName: 'Falta no grave',
  explanation: 'La autoridad considera que la falta no es grave.',
  legalBasis: 'LGRA, art. 100: calificación de la falta (sintético).',
  agreement: AGREEMENT,
  appealDueOn: '2026-12-17',
};

describe('textos del trámite', () => {
  it('explica «turnada» con el texto del escenario', () => {
    expect(procedureHeadline(procedure()).text).toBe(ROUTED_HEADLINE);
  });

  it('calificación de no grave: texto del escenario y plazo de 5 días hábiles', () => {
    const view = procedure({ managementState: 'accepted', qualification: NON_SERIOUS });
    expect(procedureHeadline(view).text).toBe(NON_SERIOUS_HEADLINE);
    const window = appealWindow(view, '2026-12-14');
    expect(window?.dueOn).toBe('2026-12-17');
    expect(window?.remaining).toBe(3);
    expect(window?.status).toBe('running');
    expect(appealWindow(view, '2026-12-18')?.status).toBe('overdue');
  });

  it('sin calificación de no grave, o ya inconformada, no hay ventana', () => {
    expect(appealWindow(procedure(), '2026-12-10')).toBeNull();
    const filed = procedure({
      qualification: {
        ...NON_SERIOUS,
        appeal: { filedOn: '2026-12-14', legalOn: '2026-12-14', reasons: 'Motivos sintéticos.' },
      },
    });
    expect(appealWindow(filed, '2026-12-14')).toBeNull();
  });

  it('archivo escalado', () => {
    const view = procedure({
      managementState: 'closed',
      managementStateName: 'Cerrada',
      closure: {
        on: '2026-12-09',
        legalOn: '2026-12-09',
        reason: 'insufficient_information',
        reasonName: 'Información insuficiente',
        reasonExplanation: 'No hubo elementos suficientes.',
        legalBasis: 'LGRA, art. 100: conclusión y archivo del expediente.',
        agreement: AGREEMENT,
      },
      rules: [
        {
          on: '2026-12-10',
          ruleKey: 'escalation.conflict',
          name: 'Conflicto sin excusa',
          explanation: 'Se escala.',
          effect: 'escalate',
          dueOn: '2026-12-09',
        },
      ],
    });
    const text = procedureHeadline(view).text;
    expect(text).toContain('Tu denuncia fue archivada por falta de elementos.');
    expect(text).toContain('pasó automáticamente a la autoridad supervisora');
  });

  it('encuentra el folio nuevo del turnado entre nodos', () => {
    const view = procedure({
      steps: [
        {
          on: '2026-11-12',
          legalOn: '2026-11-12',
          action: 'transferred',
          managementState: 'routed',
          title: 'Turnada',
          explanation: '',
          note: 'Tu denuncia continúa en Querétaro con el folio K7Q2-M9XP-4RTD. Usa las mismas 8 palabras.',
        },
      ],
    });
    expect(transferredFolio(view)).toBe('K7Q2-M9XP-4RTD');
    expect(transferredFolio(procedure())).toBeNull();
  });

  it('describe lo que falta con su unidad', () => {
    expect(describeRemaining(3, 'business_days')).toBe('Faltan 3 días hábiles');
    expect(describeRemaining(1, 'natural_days')).toBe('Falta 1 día natural');
    expect(describeRemaining(0, 'natural_days')).toBe('Vence hoy');
    expect(describeRemaining(-2, 'business_days')).toBe('Venció hace 2 días hábiles');
  });

  it('lo que sigue: quién tiene la denuncia y el plazo en curso más próximo', () => {
    const view = procedure({
      managementState: 'accepted',
      managementStateName: 'Aceptada',
      explanation: 'La institución revisó tu denuncia.',
      steps: [
        {
          on: '2026-11-05',
          legalOn: '2026-11-05',
          action: 'accepted',
          managementState: 'accepted',
          title: 'Aceptada por Órgano Interno de Control Ficticio',
          explanation: 'La institución revisó tu denuncia.',
        },
      ],
      deadlines: [
        {
          key: 'prescription_serious',
          name: 'Prescripción de faltas graves',
          explanation: '',
          startsOn: '2026-01-01',
          dueOn: '2033-01-01',
          status: 'running',
          remaining: 2249,
          remainingUnit: 'natural_days',
          legalBasis: [],
        },
        {
          key: 'serious_offense_start',
          name: 'Iniciar ante una posible falta grave',
          explanation: '',
          startsOn: '2026-11-05',
          dueOn: '2026-12-05',
          status: 'running',
          remaining: 30,
          remainingUnit: 'natural_days',
          legalBasis: [],
        },
      ],
    });
    expect(procedureHeadline(view).isStateExplanation).toBe(true);
    const next = nextStep(view);
    expect(next?.who).toBe('Órgano Interno de Control Ficticio');
    expect(next?.deadline?.key).toBe('serious_offense_start');
    expect(procedureHeadline(procedure()).isStateExplanation).toBeUndefined();
    expect(nextStep(procedure({ managementState: 'closed' }))).toBeNull();
  });
});
