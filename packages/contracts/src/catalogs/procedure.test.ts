// Pruebas del catálogo del trámite: cobertura de las claves, transiciones, plazos y días inhábiles.
import { describe, expect, it } from 'vitest';
import { ComplaintStatusSchema } from '../complaint.ts';
import {
  AdministrativeStageSchema,
  ClosureReasonSchema,
  CriminalStageSchema,
  DeadlineKeySchema,
  LegalStageSchema,
  ManagementStateSchema,
  ProcedureActorSchema,
} from '../procedure.ts';
import {
  ADMINISTRATIVE_STAGES,
  CLOSURE_REASONS,
  COMPLAINT_STATUSES,
  CRIMINAL_STAGES,
  DEADLINE_RULES,
  LEGAL_STAGES,
  MANAGEMENT_STATES,
  PROCEDURE_ACTORS,
  findClosureReason,
  findComplaintStatus,
  findDeadlineRule,
  findLegalStage,
  findManagementState,
  findProcedureActor,
  describeLegalReference,
  formatLegalReference,
  isManagementTransition,
} from './procedure.ts';
import { OFFICIAL_REST_DAYS, OFFICIAL_REST_DAYS_COVERAGE } from './rest-days.ts';

const keysOf = (items: readonly { key: string }[]): string[] => items.map((item) => item.key);

describe('cobertura de claves', () => {
  it('cada clave de los esquemas tiene una sola entrada, en el mismo orden', () => {
    expect(keysOf(MANAGEMENT_STATES)).toEqual(ManagementStateSchema.options);
    expect(keysOf(CLOSURE_REASONS)).toEqual(ClosureReasonSchema.options);
    expect(keysOf(ADMINISTRATIVE_STAGES)).toEqual(AdministrativeStageSchema.options);
    expect(keysOf(CRIMINAL_STAGES)).toEqual(CriminalStageSchema.options);
    expect(keysOf(LEGAL_STAGES)).toEqual(LegalStageSchema.options);
    expect(keysOf(PROCEDURE_ACTORS)).toEqual(ProcedureActorSchema.options);
    expect(keysOf(DEADLINE_RULES)).toEqual(DeadlineKeySchema.options);
    expect(keysOf(COMPLAINT_STATUSES)).toEqual(ComplaintStatusSchema.options);
  });

  it('modela los seis motivos de cierre y las etapas de ambas vías', () => {
    expect(CLOSURE_REASONS.map((reason) => reason.name)).toEqual([
      'Atendido',
      'Canalizado',
      'Improcedente',
      'Información insuficiente',
      'Acumulado',
      'Otro',
    ]);
    expect(ADMINISTRATIVE_STAGES).toHaveLength(8);
    expect(CRIMINAL_STAGES.map((stage) => stage.name)).toEqual([
      'Investigación',
      'Etapa intermedia',
      'Juicio',
      'Sentencia',
    ]);
    expect(ADMINISTRATIVE_STAGES.every((stage) => stage.track === 'administrative')).toBe(true);
    expect(CRIMINAL_STAGES.every((stage) => stage.track === 'criminal')).toBe(true);
  });

  it('todas las entradas tienen nombre y explicación en español, y referencias válidas', () => {
    const described = [
      ...PROCEDURE_ACTORS,
      ...MANAGEMENT_STATES,
      ...CLOSURE_REASONS,
      ...LEGAL_STAGES,
      ...DEADLINE_RULES,
      ...COMPLAINT_STATUSES,
    ];
    for (const item of described) {
      expect(item.name.length).toBeGreaterThan(2);
      expect(item.explanation.length).toBeGreaterThan(20);
      expect(item.explanation.endsWith('.')).toBe(true);
    }
    for (const item of [...MANAGEMENT_STATES, ...LEGAL_STAGES]) {
      expect(item.actors.length).toBeGreaterThan(0);
      for (const actor of item.actors) expect(findProcedureActor(actor)).toBeDefined();
      for (const deadline of item.deadlines) expect(findDeadlineRule(deadline)).toBeDefined();
    }
    for (const status of COMPLAINT_STATUSES) {
      expect(findManagementState(status.managementState)).toBeDefined();
      if (status.legalStage !== undefined) {
        expect(findLegalStage(status.legalStage)).toBeDefined();
      }
    }
  });

  it('explica qué significa «turnada» sin prometer que ya se investiga', () => {
    const routed = findManagementState('routed');
    expect(routed?.name).toBe('Turnada');
    expect(routed?.explanation).toMatch(/^Turnar significa enviar tu denuncia/);
    expect(routed?.explanation).toContain('no quiere decir que ya se investiga');
  });
});

describe('transiciones del flujo de gestión', () => {
  it('sigue el flujo del buzón general: turnar, aceptar, reasignar, devolver y cerrar', () => {
    expect(isManagementTransition('received_in_inbox', 'routed')).toBe(true);
    expect(isManagementTransition('routed', 'accepted')).toBe(true);
    expect(isManagementTransition('routed', 'reassigned')).toBe(true);
    expect(isManagementTransition('routed', 'returned_to_inbox')).toBe(true);
    expect(isManagementTransition('returned_to_inbox', 'routed')).toBe(true);
    expect(isManagementTransition('accepted', 'closed')).toBe(true);
    // Reapertura con nuevos indicios (LGRA art. 100).
    expect(isManagementTransition('closed', 'accepted')).toBe(true);
  });

  it('rechaza saltos que el flujo no admite y claves desconocidas', () => {
    expect(isManagementTransition('received_in_inbox', 'accepted')).toBe(false);
    expect(isManagementTransition('accepted', 'routed')).toBe(false);
    expect(isManagementTransition('closed', 'closed')).toBe(false);
    expect(isManagementTransition('desconocido', 'routed')).toBe(false);
    expect(isManagementTransition('routed', 'desconocido')).toBe(false);
  });

  it('todo estado se alcanza desde la recepción y apunta solo a estados existentes', () => {
    const reached = new Set<string>(['received_in_inbox']);
    const pending = ['received_in_inbox'];
    while (pending.length > 0) {
      const current = findManagementState(pending.pop() ?? '');
      for (const next of current?.next ?? []) {
        expect(findManagementState(next)).toBeDefined();
        if (!reached.has(next)) {
          reached.add(next);
          pending.push(next);
        }
      }
    }
    expect([...reached].sort()).toEqual([...ManagementStateSchema.options].sort());
  });
});

describe('plazos legales', () => {
  it('fija las cantidades, unidades y fundamentos de la LGRA', () => {
    const summary = DEADLINE_RULES.map((rule) => [
      rule.key,
      rule.amount,
      rule.maxAmount,
      rule.unit,
      rule.legalBasis.map(formatLegalReference).join('; '),
    ]);
    expect(summary).toEqual([
      ['serious_offense_start', 30, undefined, 'natural_days', 'LGRA, art. 64, fracc. II'],
      ['archive_notification', 10, undefined, 'business_days', 'LGRA, art. 100'],
      ['information_request', 5, 15, 'business_days', 'LGRA, art. 96'],
      ['appeal_filing', 5, undefined, 'business_days', 'LGRA, art. 103'],
      ['appeal_resolution', 30, undefined, 'business_days', 'LGRA, art. 107'],
      ['prescription_non_serious', 3, undefined, 'years', 'LGRA, art. 74'],
      ['prescription_serious', 7, undefined, 'years', 'LGRA, art. 74'],
      ['inactivity_expiry', 6, undefined, 'months', 'LGRA, art. 74'],
    ]);
  });

  it('cita el fundamento con el nombre completo de la ley', () => {
    expect(describeLegalReference({ law: 'LGRA', article: '64', fraction: 'II' })).toBe(
      'Ley General de Responsabilidades Administrativas, art. 64, fracc. II',
    );
    expect(describeLegalReference({ law: 'BPDN', article: '58' })).toBe(
      'Bases para el Funcionamiento de la Plataforma Digital Nacional, art. 58',
    );
  });

  it('cada plazo dice desde cuándo corre, qué pasa si vence y su aviso previo', () => {
    for (const rule of DEADLINE_RULES) {
      expect(rule.startsFrom).toMatch(/^(Desde|Día) /);
      expect(rule.consequence.length).toBeGreaterThan(10);
      expect(rule.warning.amount).toBeGreaterThan(0);
      if (rule.maxAmount !== undefined) expect(rule.maxAmount).toBeGreaterThan(rule.amount);
    }
  });
});

describe('búsquedas', () => {
  it('encuentra por clave y devuelve undefined si no existe', () => {
    expect(findClosureReason('joined')?.name).toBe('Acumulado');
    expect(findLegalStage('report_filed')?.name).toBe(
      'Envío del Informe de Presunta Responsabilidad Administrativa',
    );
    expect(findComplaintStatus('investigating')?.legalStage).toBe('investigation');
    expect(findProcedureActor('inbox_operator')?.name).toBe('Operadora del buzón general');
    for (const find of [
      findClosureReason,
      findLegalStage,
      findComplaintStatus,
      findProcedureActor,
      findManagementState,
      findDeadlineRule,
    ]) {
      expect(find('no-existe')).toBeUndefined();
    }
  });
});

describe('días de descanso obligatorio', () => {
  /** Enésimo lunes del mes, calculado aparte para contrastar la lista escrita a mano. */
  function nthMonday(year: number, month: number, n: number): string {
    const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const day = 1 + ((8 - first) % 7) + (n - 1) * 7;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  it('lista siete días por año, únicos, ordenados y dentro de la cobertura', () => {
    const days = OFFICIAL_REST_DAYS.map((item) => item.day);
    expect(days).toHaveLength(28);
    expect(new Set(days).size).toBe(28);
    expect([...days].sort()).toEqual(days);
    expect(days[0]).toBe(OFFICIAL_REST_DAYS_COVERAGE.from);
    expect(days.every((day) => day <= OFFICIAL_REST_DAYS_COVERAGE.through)).toBe(true);
  });

  it('avisa con un año de anticipación que el calendario está por terminar', () => {
    // Recordatorio deliberado con el reloj real: un año antes del fin de la cobertura (hoy, el
    // 2028-12-31) esta prueba falla para que se agreguen los días del año siguiente a tiempo.
    const through = new Date(`${OFFICIAL_REST_DAYS_COVERAGE.through}T00:00:00Z`);
    const warnFrom = new Date(through);
    warnFrom.setUTCFullYear(through.getUTCFullYear() - 1);
    expect(
      Date.now() < warnFrom.getTime(),
      `El calendario de días inhábiles termina el ${OFFICIAL_REST_DAYS_COVERAGE.through}: agrega el año siguiente en rest-days.ts.`,
    ).toBe(true);
  });

  it('los lunes móviles coinciden con la regla de la Ley Federal del Trabajo', () => {
    for (const year of [2025, 2026, 2027, 2028]) {
      const days = new Set(OFFICIAL_REST_DAYS.map((item) => item.day));
      expect(days.has(nthMonday(year, 2, 1))).toBe(true);
      expect(days.has(nthMonday(year, 3, 3))).toBe(true);
      expect(days.has(nthMonday(year, 11, 3))).toBe(true);
    }
  });
});
