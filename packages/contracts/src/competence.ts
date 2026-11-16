// Competencia por dependencia en el panel de la operación del nodo: cada dependencia de la entidad
// (del catálogo de entes de la PDN) con quién la investiga, y la versión nueva de la tabla de
// funciones que el nodo firma con su llave. La cuenta de operación nunca ve denuncias.
import { z } from 'zod';
import { AccountIdSchema } from './authority-access.ts';
import {
  AuthorityIdSchema,
  CompetenceCoverageSchema,
  EntityAssignmentSchema,
  EntityAssignmentStatusSchema,
  FunctionHolderSchema,
  FunctionTableSchema,
  GovernmentLevelSchema,
  NetworkStateKeySchema,
  NodeIdSchema,
  SignedFunctionTableSchema,
} from './network.ts';
import { DayDateSchema } from './primitives.ts';

export const CompetenceBadgeSchema = z.enum(['keys', 'named', 'pending']).meta({
  description:
    'Distintivo: keys (OIC con llaves vigentes: la denuncia le llega cifrada), named (OIC nombrado, falta su alta) o pending (pendiente: va a la autoridad receptora).',
});

export const EntityCompetenceViewSchema = z
  .object({
    entityId: z.string().min(1).max(64).meta({ description: 'Clave del ente.' }),
    name: z.string().min(1).max(400).meta({ description: 'Nombre del ente.' }),
    level: GovernmentLevelSchema,
    municipalityCode: z
      .string()
      .regex(/^\d{3}$/u)
      .optional()
      .meta({ description: 'Clave INEGI del municipio, si el catálogo la trae.' }),
    isFictitious: z.boolean().meta({
      description: 'Ente ficticio de la demostración (no está en el catálogo de la PDN).',
    }),
    group: z
      .object({ key: z.string().min(1).max(64), label: z.string().min(1).max(200) })
      .strict()
      .meta({
        description: 'Grupo en la pantalla: centralizada, paraestatal, autónomos o municipio.',
      }),
    status: z.union([EntityAssignmentStatusSchema, z.literal('general')]).meta({
      description:
        'assigned, without_oic o pending (competencia por dependencia), o general (lo cubre una regla de todo su orden).',
    }),
    source: z.enum(['entity', 'rule', 'general', 'none']).meta({
      description:
        'De dónde sale: competencia por dependencia, regla del ente, regla general o nada.',
    }),
    holder: FunctionHolderSchema.nullable(),
    holderName: z.string().max(300).nullable(),
    legalBasis: z.string().max(300).nullable(),
    requiresIdentifiedReporter: z.boolean(),
    badge: CompetenceBadgeSchema,
  })
  .strict()
  .meta({ description: 'Una dependencia con quién la investiga.' });
export type EntityCompetenceView = z.infer<typeof EntityCompetenceViewSchema>;

export const CompetenceAuthorityOptionSchema = z
  .object({
    authorityId: AuthorityIdSchema,
    name: z.string().min(1).max(300),
    governmentLevel: GovernmentLevelSchema,
    hasKeys: z.boolean().meta({ description: 'Sus llaves están vigentes hoy.' }),
  })
  .strict()
  .meta({ description: 'Autoridad investigadora del nodo que puede ser el OIC de un ente.' });

export const FunctionTableChangeSchema = z
  .object({
    kind: z.enum(['added', 'removed', 'changed']),
    scope: z.string().min(1).max(32).meta({ description: 'Función o `entity`.' }),
    entityId: z.string().min(1).max(64).optional(),
    text: z.string().min(1).max(1000),
  })
  .strict()
  .meta({ description: 'Un cambio entre dos versiones de la tabla de funciones.' });

export const CompetenceProposalSchema = z
  .object({
    version: z.number().int().min(1),
    signedOn: DayDateSchema,
    signedBy: AccountIdSchema.meta({ description: 'Cuenta de operación que la firmó.' }),
    changes: z.array(FunctionTableChangeSchema),
    signedTable: SignedFunctionTableSchema.meta({
      description:
        'Tabla firmada por el nodo. Se entrega a la SESNA (`sigilo-sesna aceptar`) y entra al directorio cuando los testigos lo cofirman.',
    }),
  })
  .strict()
  .meta({ description: 'Versión nueva de la tabla firmada desde el panel.' });
export type CompetenceProposal = z.infer<typeof CompetenceProposalSchema>;

export const CompetenceViewSchema = z
  .object({
    nodeId: NodeIdSchema,
    stateCode: NetworkStateKeySchema.nullable(),
    today: DayDateSchema,
    table: FunctionTableSchema.meta({ description: 'Tabla vigente del nodo en el directorio.' }),
    authorities: z.array(CompetenceAuthorityOptionSchema),
    entities: z.array(EntityCompetenceViewSchema),
    coverage: CompetenceCoverageSchema,
    proposals: z.array(CompetenceProposalSchema).meta({
      description: 'Versiones firmadas desde el panel, de la más reciente a la más antigua.',
    }),
  })
  .strict()
  .meta({ description: 'Pantalla «Competencia por dependencia» de la operación del nodo.' });
export type CompetenceView = z.infer<typeof CompetenceViewSchema>;

export const CompetenceSaveRequestSchema = z
  .strictObject({
    baseVersion: z
      .number()
      .int()
      .min(1)
      .meta({ description: 'Versión de la tabla sobre la que se editó; si cambió, responde 409.' }),
    entities: z.array(EntityAssignmentSchema).max(5000),
    dryRun: z
      .boolean()
      .meta({ description: 'true: solo revisa y muestra los cambios; false: firma la versión.' }),
  })
  .meta({ description: 'Competencia por dependencia nueva de la tabla del nodo.' });
export type CompetenceSaveRequest = z.infer<typeof CompetenceSaveRequestSchema>;

export const CompetenceSaveResponseSchema = z
  .object({
    version: z.number().int().min(1).meta({ description: 'Versión que tendría o tiene la tabla.' }),
    changes: z.array(FunctionTableChangeSchema),
    problems: z.array(z.string().max(1000)).meta({
      description: 'Problemas de coherencia (vacío si la tabla sirve). Con problemas no se firma.',
    }),
    proposal: CompetenceProposalSchema.nullable().meta({
      description: 'La versión firmada, o null si fue una revisión o tiene problemas.',
    }),
  })
  .strict()
  .meta({ description: 'Resultado de revisar o firmar la competencia por dependencia.' });
export type CompetenceSaveResponse = z.infer<typeof CompetenceSaveResponseSchema>;
