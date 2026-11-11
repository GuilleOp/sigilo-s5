// Reglas públicas y declarativas de escalamiento y de alerta (ADR 0007). Cualquiera puede
// recalcularlas con los mismos datos del trámite y `evaluateEscalationRules` de @sigilo/core.
import type {
  ClosureReason,
  DeadlineTerm,
  EscalationRuleKey,
  LegalStage,
  RuleEffect,
} from '../procedure.ts';
import type { ComplaintMode } from '../complaint.ts';
import type { OffenseSeverity } from '../procedure.ts';
import { TURN_SEMAPHORE } from './procedure.ts';
import type { LegalReference } from './procedure.ts';

/** Versión de las reglas; cambia con cualquier ajuste y queda en cada evento `rule.triggered`. */
export const ESCALATION_RULES_VERSION = '1.3.0';

/**
 * Hecho del trámite desde el que corre el plazo de una regla:
 * - `received`: día legal de recepción de la denuncia.
 * - `archived`: día legal del cierre por información insuficiente (archivo, LGRA art. 100).
 * - `resolutive`: día legal del primer acto resolutivo (la calificación de la falta o el cierre).
 * - `downgraded`: día legal en que se calificó como no grave una conducta que el catálogo asocia
 *   a una falta grave, a una falta de particulares o a un delito.
 * - `declined`: día legal de un cierre que declina la denuncia (canalizada, improcedente o
 *   acumulada).
 * - `archived_or_declined`: día legal del archivo o de un cierre que declina.
 * - `conflict_justified`: día legal en que la autoridad con posible conflicto se justificó.
 * - `transfer_pending`: día del turnado a otro nodo que sigue sin comprobante válido del destino.
 * - `turn_pending`: día legal en que la denuncia quedó esperando turno (buzón general) o
 *   aceptación (turnada o reasignada); deja de existir al aceptarse o cerrarse.
 * - `last_activity`: día legal de la última actuación de la autoridad.
 * - `prescription`: fecha de prescripción calculada desde el mes de los hechos; el plazo de la
 *   regla se cuenta **antes** de ella (por ejemplo, 12 meses antes).
 */
export type RuleAnchor =
  | 'received'
  | 'archived'
  | 'closed'
  | 'resolutive'
  | 'downgraded'
  | 'declined'
  | 'archived_or_declined'
  | 'conflict_justified'
  | 'transfer_pending'
  | 'turn_pending'
  | 'last_activity'
  | 'prescription';

/**
 * Condición adicional para que la regla aplique: `conflict_alert` (hubo un posible conflicto de
 * interés en la autoridad que resolvió), `archive_signals` (el archivo tiene dos o más señales
 * AUD-01 o AUD-02 del auditor) o `downgrade_signals` (la calificación tiene dos o más señales
 * AUD-01, AUD-03 o AUD-04).
 */
export type RuleRequirement = 'conflict_alert' | 'archive_signals' | 'downgrade_signals';

/**
 * Hecho que deja sin efecto una regla si ocurre a más tardar el día del vencimiento:
 * `investigation_started` (la etapa de investigación), `qualified` (la calificación, que
 * interrumpe la prescripción), `archive_notified` (aviso por el buzón después del archivo) o
 * `closed` (cierre; con `reasons`, solo esos motivos).
 */
export type RuleSatisfier =
  | { fact: 'investigation_started' }
  | { fact: 'qualified' }
  | { fact: 'archive_notified' }
  | { fact: 'conflict_excused' }
  | { fact: 'closed'; reasons?: readonly ClosureReason[] };

/** Regla pública de escalamiento o de alerta. */
export interface EscalationRule {
  key: EscalationRuleKey;
  name: string;
  /** Qué vigila y qué pasa, en lenguaje sencillo; lo ve la persona denunciante. */
  explanation: string;
  effect: RuleEffect;
  anchor: RuleAnchor;
  term: DeadlineTerm;
  /**
   * `overdue`: se cumple el día siguiente al vencimiento (el plazo ya pasó). `reached`: se cumple
   * el mismo día (un aviso anticipado).
   */
  firesWhen: 'overdue' | 'reached';
  /** Solo para estas gravedades o modos; ausente, para todas. */
  severities?: readonly OffenseSeverity[];
  modes?: readonly ComplaintMode[];
  satisfiedBy: readonly RuleSatisfier[];
  requires?: RuleRequirement;
  /** Solo en estas etapas legales (la vigente); ausente, en cualquiera o sin etapa. */
  stages?: readonly LegalStage[];
  /** Nunca en estas etapas legales (la vigente). */
  exceptStages?: readonly LegalStage[];
  /**
   * Solo en alertas: la supervisora de la autoridad también la ve en sus escalamientos, sin sobre
   * de escalamiento (la denuncia sigue con la autoridad que la tiene).
   */
  notifiesSupervisor?: boolean;
  legalBasis: readonly LegalReference[];
}

/** Gravedades a las que aplica el plazo de 30 días naturales (LGRA, art. 64, fracc. II). */
const SERIOUS_SEVERITIES: readonly OffenseSeverity[] = ['serious', 'private_party', 'crime'];

/** Cierres que resuelven que la denuncia no le toca a la autoridad o no es una falta. */
const DECLINING_CLOSURES: readonly ClosureReason[] = ['channeled', 'inadmissible', 'joined'];

const PRESCRIPTION_BASIS: readonly LegalReference[] = [{ law: 'LGRA', article: '74' }];

/**
 * Etapas posteriores a la admisión del Informe de Presunta Responsabilidad Administrativa: solo en
 * ellas cabe la caducidad de la instancia por inactividad (LGRA, art. 74).
 */
export const POST_ADMISSION_STAGES: readonly LegalStage[] = [
  'case_file_sent',
  'evidence_hearing',
  'closing_arguments',
  'instruction_closed',
];

function prescriptionAlert(key: EscalationRuleKey, months: number): EscalationRule {
  return {
    key,
    name: `Alerta de prescripción a ${months} meses`,
    explanation: `Faltan ${months} meses para que prescriba la facultad de sancionar los hechos (3 años si la falta no es grave y 7 si lo es, contados desde el mes de los hechos). La calificación de la falta interrumpe la prescripción.`,
    effect: 'alert',
    anchor: 'prescription',
    term: { unit: 'months', amount: months },
    firesWhen: 'reached',
    satisfiedBy: [{ fact: 'qualified' }, { fact: 'closed' }],
    legalBasis: PRESCRIPTION_BASIS,
  };
}

export const ESCALATION_RULES: readonly EscalationRule[] = [
  {
    key: 'escalation.grave-stalled',
    name: 'Falta grave sin iniciar el procedimiento a los 30 días',
    explanation:
      'Si la denuncia trata de una posible falta grave, una falta de particulares o un hecho de corrupción y la autoridad no inicia el procedimiento correspondiente dentro de los 30 días naturales siguientes a conocerla, pasa automáticamente a la autoridad supervisora.',
    effect: 'escalate',
    anchor: 'received',
    term: { unit: 'natural_days', amount: 30 },
    firesWhen: 'overdue',
    severities: SERIOUS_SEVERITIES,
    satisfiedBy: [
      { fact: 'investigation_started' },
      { fact: 'closed', reasons: DECLINING_CLOSURES },
    ],
    legalBasis: [{ law: 'LGRA', article: '64', fraction: 'II' }],
  },
  {
    key: 'escalation.archive-unnotified',
    name: 'Archivo sin aviso en 10 días hábiles',
    explanation:
      'Si la autoridad archiva por falta de elementos la denuncia de una persona identificable y no le escribe por el buzón dentro de los 10 días hábiles siguientes, la denuncia pasa a la autoridad supervisora.',
    effect: 'escalate',
    anchor: 'archived',
    term: { unit: 'business_days', amount: 10 },
    firesWhen: 'overdue',
    modes: ['sealed'],
    satisfiedBy: [{ fact: 'archive_notified' }],
    legalBasis: [{ law: 'LGRA', article: '100' }],
  },
  {
    key: 'escalation.conflict',
    name: 'Acto resolutivo con conflicto de interés sin excusa',
    explanation:
      'Quien tiene un conflicto de interés debe informarlo a su superior inmediato y pedir que lo excuse; el superior le responde a más tardar 48 horas antes del plazo para atender el asunto (LGRA, art. 58). Si la autoridad con un posible conflicto con la persona denunciada califica la falta, archiva o cierra la denuncia sin haberse excusado, la denuncia pasa a la autoridad supervisora. Su propia justificación no basta: también se revisa.',
    effect: 'escalate',
    anchor: 'resolutive',
    term: { unit: 'natural_days', amount: 0 },
    firesWhen: 'reached',
    requires: 'conflict_alert',
    // Solo la excusa: la justificación de la propia autoridad no apaga la regla (H5).
    satisfiedBy: [{ fact: 'conflict_excused' }],
    legalBasis: [{ law: 'LGRA', article: '58' }],
  },
  {
    key: 'escalation.archive-signals',
    name: 'Archivo o cierre que declina con dos o más señales del auditor',
    explanation:
      'Si el archivo por falta de elementos, o un cierre que declina la denuncia (canalizada, improcedente o acumulada), tiene dos o más señales del auditor (acuerdo de plantilla o archivo que no menciona las pruebas o los datos públicos), la denuncia pasa a la autoridad supervisora para que lo revise.',
    effect: 'escalate',
    anchor: 'archived_or_declined',
    term: { unit: 'natural_days', amount: 0 },
    firesWhen: 'reached',
    requires: 'archive_signals',
    satisfiedBy: [],
    legalBasis: [{ law: 'LGRA', article: '100' }],
  },
  {
    key: 'escalation.declined-serious',
    name: 'Cierre que declina una posible falta grave',
    explanation:
      'Si la autoridad cierra como canalizada, improcedente o acumulada una denuncia que el catálogo asocia a una falta grave, a una falta de particulares o a un delito, la denuncia pasa de inmediato a la autoridad supervisora para que revise el cierre. El cierre no se bloquea: se revisa, para que una sola cuenta no pueda enterrar una falta grave.',
    effect: 'escalate',
    anchor: 'declined',
    term: { unit: 'natural_days', amount: 0 },
    firesWhen: 'reached',
    severities: SERIOUS_SEVERITIES,
    satisfiedBy: [],
    legalBasis: [{ law: 'LGRA', article: '64', fraction: 'II' }],
  },
  {
    key: 'escalation.transfer-unconfirmed',
    name: 'Turnado a otro nodo sin comprobante en 10 días hábiles',
    explanation:
      'Si la autoridad turna la denuncia a otro nodo y en 10 días hábiles no entrega el comprobante del nodo destino ligado a tu denuncia, la denuncia sigue con ella y pasa a la autoridad supervisora para que revise el turnado. Así un turnado no puede usarse para que la denuncia desaparezca.',
    effect: 'escalate',
    anchor: 'transfer_pending',
    term: { unit: 'business_days', amount: 10 },
    firesWhen: 'overdue',
    satisfiedBy: [],
    legalBasis: [{ law: 'LGRA', article: '64', fraction: 'II' }],
  },
  {
    key: 'escalation.conflict-justified',
    name: 'Justificación propia ante un posible conflicto de interés',
    explanation:
      'Si la autoridad con un posible conflicto de interés con la persona denunciada decide justificar por qué no lo hay en lugar de excusarse, la denuncia pasa a la autoridad supervisora para que revise esa justificación (LGRA, art. 58: la decisión es del superior inmediato, no de quien tiene el conflicto).',
    effect: 'escalate',
    anchor: 'conflict_justified',
    term: { unit: 'natural_days', amount: 0 },
    firesWhen: 'reached',
    requires: 'conflict_alert',
    satisfiedBy: [],
    legalBasis: [{ law: 'LGRA', article: '58' }],
  },
  {
    key: 'escalation.downgrade-signals',
    name: 'Calificación de no grave con dos o más señales del auditor',
    explanation:
      'Si la autoridad califica como no grave una conducta que el catálogo asocia a una falta grave y el auditor señala dos o más indicios (acuerdo de plantilla, calificación degradada o plazos vencidos), la denuncia pasa a la autoridad supervisora para que la revise. Simular conductas no graves durante la investigación de faltas graves es obstrucción de la justicia (LGRA, art. 64, fr. I); la señal no afirma que haya ocurrido.',
    effect: 'escalate',
    anchor: 'downgraded',
    term: { unit: 'natural_days', amount: 0 },
    firesWhen: 'reached',
    requires: 'downgrade_signals',
    satisfiedBy: [],
    legalBasis: [
      { law: 'LGRA', article: '64', fraction: 'I' },
      { law: 'LGRA', article: '102' },
    ],
  },
  {
    key: 'alert.turn-overdue',
    name: 'Turnado vencido',
    explanation:
      'Si la denuncia cumple 2 días hábiles en el buzón general sin turnarse, o turnada sin que la autoridad la acepte, la supervisión recibe un aviso para revisarla (semáforo de turnado del S5). Es un aviso: la denuncia sigue con quien la tiene y la supervisión no recibe la copia cerrada con la segunda llave.',
    effect: 'alert',
    anchor: 'turn_pending',
    term: { unit: TURN_SEMAPHORE.unit, amount: TURN_SEMAPHORE.overdueAfter },
    firesWhen: 'reached',
    satisfiedBy: [],
    notifiesSupervisor: true,
    legalBasis: [{ law: 'BPDN', article: '58' }],
  },
  prescriptionAlert('alert.prescription-12m', 12),
  prescriptionAlert('alert.prescription-6m', 6),
  prescriptionAlert('alert.prescription-3m', 3),
  {
    key: 'alert.inactivity-warning',
    name: 'Alerta de inactividad a los 5 meses',
    explanation:
      'La autoridad no ha actuado en 5 meses. Es una alerta de inactividad para que la denuncia no se quede detenida; no es una determinación legal ni hace caducar la investigación.',
    effect: 'alert',
    anchor: 'last_activity',
    term: { unit: 'months', amount: 5 },
    firesWhen: 'reached',
    satisfiedBy: [{ fact: 'closed' }],
    exceptStages: POST_ADMISSION_STAGES,
    legalBasis: [],
  },
  {
    key: 'alert.inactivity-expiry',
    name: 'Alerta de inactividad a los 6 meses',
    explanation:
      'La autoridad no ha actuado en 6 meses. Es una alerta de inactividad, no una determinación legal: durante la investigación no corre la caducidad de la instancia, que solo aplica al procedimiento ya admitido el informe.',
    effect: 'alert',
    anchor: 'last_activity',
    term: { unit: 'months', amount: 6 },
    firesWhen: 'reached',
    satisfiedBy: [{ fact: 'closed' }],
    exceptStages: POST_ADMISSION_STAGES,
    legalBasis: [],
  },
  {
    key: 'alert.expiry-warning',
    name: 'Procedimiento sin actuar a los 5 meses',
    explanation:
      'El procedimiento de responsabilidad, ya admitido el informe, lleva 5 meses sin actuación. A los 6 meses sin causa justificada, la persona presunta responsable puede pedir que se decrete la caducidad de la instancia (LGRA, art. 74). Es una alerta, no una determinación legal.',
    effect: 'alert',
    anchor: 'last_activity',
    term: { unit: 'months', amount: 5 },
    firesWhen: 'reached',
    satisfiedBy: [{ fact: 'closed' }],
    stages: POST_ADMISSION_STAGES,
    legalBasis: PRESCRIPTION_BASIS,
  },
  {
    key: 'alert.expiry-reached',
    name: 'Procedimiento seis meses sin actuar',
    explanation:
      'El procedimiento de responsabilidad, ya admitido el informe, lleva 6 meses sin actuación. Sin causa justificada, se decreta la caducidad de la instancia a solicitud de la persona presunta responsable, y la prescripción se reanuda desde la admisión del informe (LGRA, art. 74). Es una alerta, no una determinación legal.',
    effect: 'alert',
    anchor: 'last_activity',
    term: { unit: 'months', amount: 6 },
    firesWhen: 'reached',
    satisfiedBy: [{ fact: 'closed' }],
    stages: POST_ADMISSION_STAGES,
    legalBasis: PRESCRIPTION_BASIS,
  },
];

const RULE_BY_KEY: ReadonlyMap<string, EscalationRule> = new Map(
  ESCALATION_RULES.map((rule) => [rule.key, rule]),
);

/** Regla por clave, o `undefined` si no existe. */
export function findEscalationRule(key: string): EscalationRule | undefined {
  return RULE_BY_KEY.get(key);
}
