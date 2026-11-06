// Registro de bitácora de cada señal del auditor (ADR 0009, punto 7): regla o modelo, versión,
// digestos de la entrada y de la salida y resultado. Nunca lleva el texto analizado.
import { z } from 'zod';
import { DayDateSchema, Sha256HexSchema } from './primitives.ts';

/** Tipo de evento de bitácora que el nodo registra por cada señal del auditor. */
export const AUDIT_LEDGER_EVENT_TYPE = 'audit.signal';

/**
 * Identificador estable de una regla del auditor. `AUD-01` a `AUD-08` son reglas deterministas;
 * `AUD-M1` y `AUD-M2` son las tareas del modelo local opcional (siempre orientativas).
 */
export const AuditRuleIdSchema = z
  .enum([
    'AUD-01',
    'AUD-02',
    'AUD-03',
    'AUD-04',
    'AUD-05',
    'AUD-06',
    'AUD-07',
    'AUD-08',
    'AUD-M1',
    'AUD-M2',
  ])
  .meta({
    description:
      'Regla del auditor: AUD-01 a AUD-08 son reglas deterministas; AUD-M1 y AUD-M2, tareas orientativas del modelo local.',
  });
export type AuditRuleId = z.infer<typeof AuditRuleIdSchema>;

/** Versión SemVer (`1.0.0`). */
const SemverSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/u, 'Versión inválida')
  .meta({ description: 'Versión SemVer.' });

/** Qué produjo la señal: las reglas publicadas o el modelo local, con su versión o su digesto. */
export const AuditEngineSchema = z
  .discriminatedUnion('kind', [
    z
      .object({
        kind: z.literal('rules'),
        rulesVersion: SemverSchema.meta({ description: 'Versión de las reglas del auditor.' }),
      })
      .strict(),
    z
      .object({
        kind: z.literal('model'),
        adapterVersion: SemverSchema.meta({ description: 'Versión del adaptador y del prompt.' }),
        modelName: z
          .string()
          .min(1)
          .max(120)
          .regex(/^[A-Za-z0-9._:/-]+$/u, 'Nombre de modelo inválido')
          .meta({ description: 'Nombre del modelo abierto local, por ejemplo qwen2.5:1.5b.' }),
        modelDigest: Sha256HexSchema.meta({
          description: 'SHA-256 del archivo de pesos del modelo, fijado en la configuración.',
        }),
      })
      .strict(),
  ])
  .meta({ description: 'Motor que produjo la señal: reglas deterministas o modelo local.' });
export type AuditEngine = z.infer<typeof AuditEngineSchema>;

/**
 * Resultado: `flagged` (una regla señaló), `suggested` (el modelo sugirió algo válido),
 * `discarded` (la salida del modelo no cumplió el esquema y se descartó) o `unavailable` (el
 * modelo no estaba disponible y el auditor siguió solo con reglas).
 */
export const AuditResultSchema = z
  .enum(['flagged', 'suggested', 'discarded', 'unavailable'])
  .meta({ description: 'Resultado de la regla o de la tarea del modelo.' });
export type AuditResult = z.infer<typeof AuditResultSchema>;

/** Sobre qué es la señal. */
export const AuditSubjectKindSchema = z
  .enum(['closure', 'case', 'authority'])
  .meta({ description: 'Sujeto de la señal: un acuerdo de cierre, un caso o una autoridad.' });
export type AuditSubjectKind = z.infer<typeof AuditSubjectKindSchema>;

/**
 * Registro de una señal. El nodo lo guarda y publica en la bitácora su digesto (`payloadDigest`
 * con la forma canónica de este objeto) bajo el tipo `audit.signal`.
 * Seguridad: solo digestos y claves; ni el texto del acuerdo, ni el relato, ni identidades.
 */
export const AuditLedgerRecordSchema = z
  .object({
    version: z.literal(1),
    type: z.literal(AUDIT_LEDGER_EVENT_TYPE),
    ruleId: AuditRuleIdSchema,
    signalKey: z
      .string()
      .regex(/^(signal|model)\.[a-z0-9-]+$/u, 'Clave de señal inválida')
      .meta({ description: 'Clave estable de la señal, por ejemplo signal.template-closure.' }),
    engine: AuditEngineSchema,
    subjectKind: AuditSubjectKindSchema,
    subjectDigest: Sha256HexSchema.meta({
      description: 'SHA-256 de "sigilo/audit/subject:" + clave del sujeto; la clave no se publica.',
    }),
    inputDigest: Sha256HexSchema.meta({
      description: 'SHA-256 de la forma canónica de la entrada evaluada.',
    }),
    outputDigest: Sha256HexSchema.meta({
      description: 'SHA-256 de la forma canónica de la señal producida (o del motivo de descarte).',
    }),
    result: AuditResultSchema,
    at: DayDateSchema.meta({ description: 'Día de la evaluación (UTC).' }),
  })
  .strict()
  .meta({
    description:
      'Registro de bitácora de una señal del auditor: motor y versión, digestos de entrada y salida, y resultado.',
  });
export type AuditLedgerRecord = z.infer<typeof AuditLedgerRecordSchema>;
