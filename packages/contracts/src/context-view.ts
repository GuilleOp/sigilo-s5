// Contexto de la PDN, del auditor y de la corroboración tal como lo ve la autoridad en el detalle:
// ficha con prioridad explicable, revisión de conflicto de interés, verificación de sanciones y
// señales del auditor. Nunca se muestra a quien denuncia salvo el resultado de la sanción.
import { z } from 'zod';
import { AuditRuleIdSchema } from './audit.ts';
import { DayDateSchema } from './primitives.ts';

/** Un dato público con la cita de su fuente («S6 federal, datos a enero de 2023»). */
export const CitedFactSchema = z
  .object({
    label: z.string().meta({ description: 'Qué dato es.' }),
    value: z.string().meta({ description: 'El dato.' }),
    source: z.string().meta({ description: 'Cita de la fuente y su fecha.' }),
  })
  .meta({ description: 'Dato público con su fuente.' });
export type CitedFact = z.infer<typeof CitedFactSchema>;

export const PriorityFactorViewSchema = z
  .object({
    id: z.string().meta({ description: 'Clave estable del factor (config/prioridad.json).' }),
    label: z.string().meta({ description: 'Nombre del factor.' }),
    points: z.number().int().meta({ description: 'Puntos que suma (0 si solo informa).' }),
    reason: z.string().meta({ description: 'Por qué se aplicó.' }),
    source: z
      .string()
      .nullable()
      .meta({ description: 'Fuente del dato, o null si viene de la denuncia o de fuera.' }),
  })
  .meta({ description: 'Factor de la prioridad explicable.' });

export const ContextSheetViewSchema = z
  .object({
    score: z.number().int().meta({ description: 'Puntaje: suma entera de los factores.' }),
    level: z.enum(['high', 'medium', 'low']).meta({ description: 'Nivel de prioridad.' }),
    label: z.string().meta({ description: 'Nivel en español.' }),
    configVersion: z.string().meta({ description: 'Versión de la configuración publicada.' }),
    factors: z.array(PriorityFactorViewSchema).meta({ description: 'Factores aplicados.' }),
    facts: z.array(CitedFactSchema).meta({ description: 'Datos públicos relevantes.' }),
    notices: z
      .array(z.string())
      .meta({ description: 'Alertas que no cambian la prioridad (conflicto, inconsistencias).' }),
  })
  .meta({
    description:
      'Ficha de contexto con prioridad explicable: cada factor dice por qué se aplicó y de qué fuente viene. Orienta, nunca decide.',
  });
export type ContextSheetView = z.infer<typeof ContextSheetViewSchema>;

export const ConflictAlertViewSchema = z
  .object({
    kind: z.enum(['conflict.shared-interest', 'conflict.chain-of-command']).meta({
      description: 'Intereses declarados en común (S1) o cadena de mando (S2).',
    }),
    title: z.string().meta({ description: 'Título de la alerta.' }),
    explanation: z.string().meta({ description: 'Explicación con la fuente.' }),
    evidence: z
      .array(CitedFactSchema)
      .meta({ description: 'Evidencia (nombres, no porcentajes).' }),
  })
  .meta({ description: 'Alerta de posible conflicto de interés.' });

/**
 * Revisión de conflicto de interés antes de turnar (LGRA, art. 58). Nunca bloquea: con un posible
 * conflicto, la autoridad debe registrar su excusa o su justificación.
 */
export const ConflictReviewSchema = z
  .object({
    checkedOn: DayDateSchema.meta({ description: 'Día de la revisión.' }),
    authorityId: z.string().meta({ description: 'Autoridad revisada (la que recibe el turno).' }),
    outcome: z.enum(['possible-conflict', 'none-found', 'no_coverage']).meta({
      description:
        'possible-conflict, none-found (no descarta un conflicto) o no_coverage (sin datos: nunca «sin conflicto»).',
    }),
    summary: z.string().meta({ description: 'Resumen en español con el fundamento.' }),
    alerts: z.array(ConflictAlertViewSchema).meta({ description: 'Alertas con su evidencia.' }),
    requiresResponse: z
      .boolean()
      .meta({ description: 'Si la autoridad debe excusarse o justificar antes de resolver.' }),
    response: z
      .enum(['excuse', 'justification'])
      .optional()
      .meta({ description: 'Respuesta registrada de la autoridad, si ya la hay.' }),
  })
  .meta({ description: 'Revisión de conflicto de interés antes de turnar.' });
export type ConflictReview = z.infer<typeof ConflictReviewSchema>;

/** Sanción que la autoridad declara al cerrar con sanción. */
export const SanctionClaimSchema = z
  .strictObject({
    fileNumber: z.string().min(1).max(64).meta({ description: 'Expediente de la resolución.' }),
    personName: z
      .string()
      .min(1)
      .max(200)
      .meta({ description: 'Persona sancionada (ya pública en S3 si se publicó).' }),
    sanction: z.string().min(1).max(200).meta({ description: 'Sanción en texto libre.' }),
    institution: z.string().min(1).max(300).meta({ description: 'Institución de la persona.' }),
    stateCode: z
      .string()
      .min(2)
      .max(16)
      .meta({ description: 'Clave INEGI de la entidad o 00 para lo federal.' }),
  })
  .meta({ description: 'Sanción declarada en el cierre, para verificarla contra S3.' });
export type SanctionClaimInput = z.infer<typeof SanctionClaimSchema>;

/** Verificación de una sanción declarada contra S3 (tres resultados; la ausencia no es evidencia). */
export const SanctionCheckViewSchema = z
  .object({
    checkedOn: DayDateSchema.meta({ description: 'Día de la verificación.' }),
    outcome: z.enum(['confirmed', 'contradicted', 'no_coverage']).meta({
      description: 'confirmed, contradicted o no_coverage (no podemos comprobarlo).',
    }),
    explanation: z.string().meta({ description: 'Explicación en lenguaje claro.' }),
    unverifiable: z.boolean().meta({
      description:
        'Señal «sanción no verificable»: la fuente cubre a la institución, el registro no aparece y pasó el plazo de publicación.',
    }),
  })
  .meta({ description: 'Resultado de verificar la sanción declarada contra S3.' });
export type SanctionCheckView = z.infer<typeof SanctionCheckViewSchema>;

/** Señal del auditor con su evidencia, tal como la ve la autoridad. */
export const AuditSignalViewSchema = z
  .object({
    ruleId: AuditRuleIdSchema,
    key: z.string().meta({ description: 'Clave estable de la señal.' }),
    name: z.string().meta({ description: 'Nombre de la señal.' }),
    explanation: z.string().meta({ description: 'Por qué se señaló.' }),
    on: DayDateSchema.meta({ description: 'Día de la evaluación.' }),
    evidence: z
      .array(
        z.object({
          label: z.string().meta({ description: 'Qué se compara.' }),
          actText: z.string().nullable().meta({ description: 'Lo que dice el acuerdo.' }),
          counterpart: z.string().meta({ description: 'La prueba o el dato que lo contrasta.' }),
          counterpartSource: z.string().meta({ description: 'De dónde sale el contraste.' }),
        }),
      )
      .meta({ description: 'Evidencia lado a lado.' }),
    note: z.string().meta({ description: 'Recordatorio: la señal no decide nada.' }),
  })
  .meta({ description: 'Señal del auditor sobre un acuerdo o un caso. No decide nada.' });
export type AuditSignalView = z.infer<typeof AuditSignalViewSchema>;

/** Estado de corroboración de la denuncia según el índice (ADR 0006 y 0010). */
export const CorroborationViewSchema = z
  .object({
    sources: z.enum(['one', 'two_or_more']).meta({
      description:
        'Personas independientes que denuncian lo mismo, en intervalos: one (solo esta) o two_or_more (2 o más). Nunca el conteo exacto, para que el detalle no sirva de oráculo.',
    }),
    isPossibleCampaign: z
      .boolean()
      .meta({ description: 'Posible campaña: el grupo cuenta como una fuente.' }),
    updatedOn: DayDateSchema.meta({ description: 'Día del último aviso del índice.' }),
    newIndicationOn: DayDateSchema.optional().meta({
      description:
        'Si la denuncia estaba archivada cuando llegó otra corroboración: posible nuevo indicio (LGRA, art. 100).',
    }),
  })
  .meta({ description: 'Corroboración ciega: cuántas fuentes independientes coinciden.' });
export type CorroborationView = z.infer<typeof CorroborationViewSchema>;
