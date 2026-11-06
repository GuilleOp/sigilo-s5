// Registro de bitácora de cada señal (formato AuditLedgerRecordSchema de @sigilo/contracts): motor
// y versión, digestos de la entrada, del sujeto y de la salida. Nunca el texto.
import { AUDIT_LEDGER_EVENT_TYPE, AuditLedgerRecordSchema } from '@sigilo/contracts';
import type {
  AuditEngine,
  AuditLedgerRecord,
  AuditResult,
  AuditRuleId,
  AuditSubjectKind,
} from '@sigilo/contracts';
import { canonicalize, sha256Hex } from '@sigilo/core';

/**
 * SHA-256 de la forma canónica de cualquier valor JSON. Los números no enteros se convierten a
 * texto antes, porque la forma canónica solo admite enteros seguros; `undefined` se omite.
 */
export function digestOf(value: unknown): string {
  const plain: unknown = JSON.parse(
    JSON.stringify(value, (_key, item: unknown) =>
      typeof item === 'number' && !Number.isSafeInteger(item) ? String(item) : item,
    ) ?? 'null',
  );
  return sha256Hex(canonicalize(plain));
}

/** Digesto del sujeto con separación de dominio; la clave no se publica. */
export function subjectDigestOf(id: string): string {
  return sha256Hex(`sigilo/audit/subject:${id}`);
}

/** Construye y valida el registro. Lanza si no cumple el esquema (error de programación). */
export function buildLedgerRecord(input: {
  ruleId: AuditRuleId;
  signalKey: string;
  engine: AuditEngine;
  subject: { kind: AuditSubjectKind; id: string };
  input: unknown;
  output: unknown;
  result: AuditResult;
  at: string;
}): AuditLedgerRecord {
  return AuditLedgerRecordSchema.parse({
    version: 1,
    type: AUDIT_LEDGER_EVENT_TYPE,
    ruleId: input.ruleId,
    signalKey: input.signalKey,
    engine: input.engine,
    subjectKind: input.subject.kind,
    subjectDigest: subjectDigestOf(input.subject.id),
    inputDigest: digestOf(input.input),
    outputDigest: digestOf(input.output),
    result: input.result,
    at: input.at,
  });
}
