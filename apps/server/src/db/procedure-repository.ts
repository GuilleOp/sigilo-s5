// Registros de solo agregar del trámite: pasos de la línea de tiempo con su nota pública, acuerdos
// de cierre en versión pública y reglas públicas cumplidas.
import type { DatabaseSync } from 'node:sqlite';
import {
  ClosureReasonSchema,
  EscalationRuleKeySchema,
  LegalStageSchema,
  ManagementStateSchema,
  ProcedureActionSchema,
  RuleEffectSchema,
} from '@sigilo/contracts';
import type {
  ClosureReason,
  ClosureRecord,
  EscalationRuleKey,
  LegalStage,
  ManagementState,
  ProcedureAction,
  RuleEffect,
} from '@sigilo/contracts';
import { readOptionalText, readText } from './database.ts';
import type { Row } from './database.ts';

/** Paso del trámite tal como se guarda. */
export interface StoredStep {
  action: ProcedureAction;
  on: string;
  legalOn: string;
  managementState: ManagementState;
  legalStage: LegalStage | null;
  closureReason: ClosureReason | null;
  authorityId: string;
  actorId: string | null;
  note: string | null;
}

/** Regla pública cumplida para una denuncia. */
export interface StoredRuleTrigger {
  folio: string;
  ruleKey: EscalationRuleKey;
  anchorOn: string;
  triggeredOn: string;
  dueOn: string;
  effect: RuleEffect;
  authorityId: string;
  supervisorId: string | null;
}

/** Operaciones sobre `procedure_steps`, `closure_agreements` y `rule_triggers`. */
export interface ProcedureRepository {
  insertStep(folio: string, step: StoredStep): void;
  /** Pasos del folio en el orden en que ocurrieron. */
  listSteps(folio: string): StoredStep[];
  insertClosure(record: ClosureRecord): void;
  /** Último acuerdo de cierre del folio, o `null`. */
  lastClosure(folio: string): ClosureRecord | null;
  /** Acuerdos de las autoridades dadas, de los más recientes a los más antiguos. */
  listClosures(authorityIds: readonly string[], offset: number, limit: number): ClosureRecord[];
  /** Registra la regla; devuelve `false` si ya estaba registrada con el mismo inicio. */
  insertRuleTrigger(trigger: StoredRuleTrigger): boolean;
  listRuleTriggers(folio: string): StoredRuleTrigger[];
  /** Escalamientos a la supervisora, de los más recientes a los más antiguos. */
  listEscalationsFor(supervisorId: string): StoredRuleTrigger[];
}

function toStep(row: Row): StoredStep {
  const stage = readOptionalText(row, 'legal_stage');
  const reason = readOptionalText(row, 'closure_reason');
  return {
    action: ProcedureActionSchema.parse(readText(row, 'action')),
    on: readText(row, 'step_on'),
    legalOn: readText(row, 'legal_on'),
    managementState: ManagementStateSchema.parse(readText(row, 'management_state')),
    legalStage: stage === null ? null : LegalStageSchema.parse(stage),
    closureReason: reason === null ? null : ClosureReasonSchema.parse(reason),
    authorityId: readText(row, 'authority_id'),
    actorId: readOptionalText(row, 'actor_id'),
    note: readOptionalText(row, 'note'),
  };
}

function toClosure(row: Row): ClosureRecord {
  return {
    folio: readText(row, 'folio'),
    authorityId: readText(row, 'authority_id'),
    on: readText(row, 'closed_on'),
    legalOn: readText(row, 'legal_on'),
    reason: ClosureReasonSchema.parse(readText(row, 'reason')),
    legalBasis: readText(row, 'legal_basis'),
    agreement: readText(row, 'agreement'),
    agreementDigest: readText(row, 'agreement_digest'),
    actorId: readText(row, 'actor_id'),
  };
}

function toTrigger(row: Row): StoredRuleTrigger {
  return {
    folio: readText(row, 'folio'),
    ruleKey: EscalationRuleKeySchema.parse(readText(row, 'rule_key')),
    anchorOn: readText(row, 'anchor_on'),
    triggeredOn: readText(row, 'triggered_on'),
    dueOn: readText(row, 'due_on'),
    effect: RuleEffectSchema.parse(readText(row, 'effect')),
    authorityId: readText(row, 'authority_id'),
    supervisorId: readOptionalText(row, 'supervisor_id'),
  };
}

/** Crea el repositorio del trámite sobre `db`. */
export function createProcedureRepository(db: DatabaseSync): ProcedureRepository {
  const insertStepStatement = db.prepare(
    `INSERT INTO procedure_steps (folio, position, action, step_on, legal_on, management_state,
       legal_stage, closure_reason, authority_id, actor_id, note)
     VALUES (?, (SELECT COALESCE(MAX(position) + 1, 0) FROM procedure_steps WHERE folio = ?), ?, ?,
       ?, ?, ?, ?, ?, ?, ?)`,
  );
  const listStepsStatement = db.prepare(
    'SELECT * FROM procedure_steps WHERE folio = ? ORDER BY position',
  );
  const insertClosureStatement = db.prepare(
    `INSERT INTO closure_agreements (folio, position, authority_id, closed_on, legal_on, reason,
       legal_basis, agreement, agreement_digest, actor_id)
     VALUES (?, (SELECT COALESCE(MAX(position) + 1, 0) FROM closure_agreements WHERE folio = ?), ?,
       ?, ?, ?, ?, ?, ?, ?)`,
  );
  const lastClosureStatement = db.prepare(
    'SELECT * FROM closure_agreements WHERE folio = ? ORDER BY position DESC LIMIT 1',
  );
  const listClosuresStatement = db.prepare(
    `SELECT * FROM closure_agreements
     WHERE authority_id IN (SELECT value FROM json_each(?))
     ORDER BY closed_on DESC, folio, position LIMIT ? OFFSET ?`,
  );
  const insertTriggerStatement = db.prepare(
    `INSERT OR IGNORE INTO rule_triggers (folio, rule_key, anchor_on, triggered_on, due_on, effect,
       authority_id, supervisor_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const listTriggersStatement = db.prepare(
    'SELECT * FROM rule_triggers WHERE folio = ? ORDER BY triggered_on, rule_key',
  );
  const listEscalationsStatement = db.prepare(
    `SELECT * FROM rule_triggers WHERE supervisor_id = ? AND effect = 'escalate'
     ORDER BY triggered_on DESC, folio, rule_key`,
  );
  return {
    insertStep: (folio, step) => {
      insertStepStatement.run(
        folio,
        folio,
        step.action,
        step.on,
        step.legalOn,
        step.managementState,
        step.legalStage,
        step.closureReason,
        step.authorityId,
        step.actorId,
        step.note,
      );
    },
    listSteps: (folio) => listStepsStatement.all(folio).map(toStep),
    insertClosure: (record) => {
      insertClosureStatement.run(
        record.folio,
        record.folio,
        record.authorityId,
        record.on,
        record.legalOn,
        record.reason,
        record.legalBasis,
        record.agreement,
        record.agreementDigest,
        record.actorId,
      );
    },
    lastClosure: (folio) => {
      const row = lastClosureStatement.get(folio);
      return row === undefined ? null : toClosure(row);
    },
    listClosures: (authorityIds, offset, limit) =>
      listClosuresStatement.all(JSON.stringify(authorityIds), limit, offset).map(toClosure),
    insertRuleTrigger: (trigger) => {
      const result = insertTriggerStatement.run(
        trigger.folio,
        trigger.ruleKey,
        trigger.anchorOn,
        trigger.triggeredOn,
        trigger.dueOn,
        trigger.effect,
        trigger.authorityId,
        trigger.supervisorId,
      );
      return Number(result.changes) > 0;
    },
    listRuleTriggers: (folio) => listTriggersStatement.all(folio).map(toTrigger),
    listEscalationsFor: (supervisorId) => listEscalationsStatement.all(supervisorId).map(toTrigger),
  };
}
