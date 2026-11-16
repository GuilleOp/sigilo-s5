// Trámite visible: acciones de la autoridad sobre una denuncia (turnar, aceptar, reasignar,
// devolver, avanzar de etapa y cerrar con fundamento) y la vista con la línea de tiempo, los plazos
// y las reglas cumplidas que ven la persona denunciante y la autoridad.
import { z } from 'zod';
import { AccountIdSchema } from './authority-access.ts';
import { AuthorityIdSchema } from './network.ts';
import { ComplaintStatusSchema } from './complaint.ts';
import { SanctionCheckViewSchema, SanctionClaimSchema } from './context-view.ts';
import { DayDateSchema, FolioSchema, Sha256HexSchema } from './primitives.ts';
import {
  ClosureReasonSchema,
  CriminalStageSchema,
  DeadlineKeySchema,
  DeadlineStatusSchema,
  EscalationRuleKeySchema,
  FederalFundingSchema,
  LegalClosureReasonSchema,
  LegalStageSchema,
  ManagementStateSchema,
  PrecautionaryOutcomeSchema,
  ProcedureActionSchema,
  RemedyFiledBySchema,
  RemedyKindSchema,
  RemedyOutcomeSchema,
  RuleEffectSchema,
  QualificationSeveritySchema,
  TurnSemaphoreStatusSchema,
  TurnWaitSchema,
} from './procedure.ts';

/** Día civil en la hora del centro de México con el que se cuentan los plazos legales. */
export const LegalDaySchema = DayDateSchema.meta({
  description:
    'Día civil en la hora del centro de México (America/Mexico_City) con el que se cuentan los plazos legales; puede diferir del día UTC.',
});

/**
 * Semáforo de turnado de la bandeja del S5 para una denuncia que espera turno o aceptación. Los
 * días cuentan en días hábiles (`TURN_SEMAPHORE`) con el reloj del nodo.
 */
export const TurnSemaphoreSchema = z
  .object({
    waitingFor: TurnWaitSchema,
    status: TurnSemaphoreStatusSchema,
    sinceOn: LegalDaySchema.meta({
      description:
        'Día en que la denuncia entró al estado que espera (recepción, turno o devolución).',
    }),
    elapsedDays: z.number().int().nonnegative().meta({
      description: 'Días hábiles completos desde sinceOn hasta hoy.',
    }),
    warningOn: LegalDaySchema.meta({ description: 'Día desde el que queda «por vencer».' }),
    overdueOn: LegalDaySchema.meta({ description: 'Día desde el que queda «vencida».' }),
  })
  .meta({
    description:
      'Semáforo de turnado del S5: cuánto lleva la denuncia sin turnarse o sin aceptarse. Solo en las denuncias que esperan.',
  });
export type TurnSemaphore = z.infer<typeof TurnSemaphoreSchema>;

/** Nota pública de la autoridad: la persona denunciante la lee tal cual en su seguimiento. */
export const PublicNoteSchema = z
  .string()
  .min(1)
  .max(2000)
  .meta({ description: 'Nota pública de la autoridad; la persona denunciante la lee tal cual.' });

/** Mínimo de caracteres del motivo del turno, sin contar espacios al inicio ni al final. */
export const MIN_ROUTING_NOTE_LENGTH = 10;

/**
 * Motivo del turno: por qué la denuncia va a esa autoridad. Obligatorio, como en la bandeja del
 * S5; la persona denunciante lo lee tal cual en su seguimiento.
 */
export const RoutingNoteSchema = z
  .string()
  .min(MIN_ROUTING_NOTE_LENGTH)
  .max(2000)
  .refine((value) => value.trim().length >= MIN_ROUTING_NOTE_LENGTH, {
    message: `El motivo del turno debe tener al menos ${MIN_ROUTING_NOTE_LENGTH} caracteres.`,
  })
  .meta({
    description:
      'Motivo del turno (al menos 10 caracteres sin contar espacios al inicio ni al final): por qué la denuncia va a esa autoridad. La persona denunciante lo lee tal cual.',
  });

/** Fundamento legal y motivo, visible para la persona denunciante. */
export const LegalBasisTextSchema = z
  .string()
  .min(20)
  .max(1000)
  .meta({ description: 'Fundamento legal y motivo; la persona denunciante lo ve.' });

/** Versión pública del acuerdo de cierre: texto completo sin datos personales. */
export const AgreementTextSchema = z.string().min(50).max(20_000).meta({
  description:
    'Versión pública del acuerdo de cierre, sin datos personales. Queda disponible para el auditor y para la persona denunciante.',
});

const RouteActionSchema = z.strictObject({
  action: z.literal('route'),
  authorityId: AuthorityIdSchema,
  note: RoutingNoteSchema,
});
const AcceptActionSchema = z.strictObject({
  action: z.literal('accept'),
  note: PublicNoteSchema.optional(),
});
const ReassignActionSchema = z.strictObject({
  action: z.literal('reassign'),
  authorityId: AuthorityIdSchema,
  note: PublicNoteSchema,
});
const ReturnActionSchema = z.strictObject({
  action: z.literal('return'),
  note: PublicNoteSchema,
});
/** Calificación de la falta con su fundamento y la versión pública del acuerdo (LGRA, art. 100). */
export const QualificationInputSchema = z
  .strictObject({
    severity: QualificationSeveritySchema,
    legalBasis: LegalBasisTextSchema,
    agreement: AgreementTextSchema,
  })
  .meta({
    description:
      'Calificación de la falta como grave o no grave, con fundamento y acuerdo en versión pública. Si es no grave, se notifica a quien denunció y puede inconformarse (LGRA, arts. 102 y 103).',
  });
export type QualificationInput = z.infer<typeof QualificationInputSchema>;

/**
 * Registro de una actuación del Tribunal que hace la autoridad substanciadora cuando el estado no
 * dio cuentas al Tribunal: el número de expediente y el fundamento de lo que el Tribunal resolvió.
 * En la línea de tiempo se lee «Registro de actuación del Tribunal».
 */
export const CourtRecordSchema = z
  .strictObject({
    fileNumber: z
      .string()
      .min(3)
      .max(80)
      .regex(/^[\p{L}\p{N}][\p{L}\p{N} /.\-_º°]*$/u, 'Número de expediente inválido')
      .meta({ description: 'Número de expediente del Tribunal.' }),
    legalBasis: LegalBasisTextSchema,
  })
  .meta({
    description:
      'Registro de actuación del Tribunal hecho por otra autoridad (la substanciadora) porque el estado no dio cuentas al Tribunal: número de expediente y fundamento.',
  });
export type CourtRecord = z.infer<typeof CourtRecordSchema>;

const AdvanceStageActionSchema = z.strictObject({
  action: z.literal('advance_stage'),
  stage: LegalStageSchema,
  note: PublicNoteSchema.optional(),
  /** Al pasar a `qualification`: la calificación, que el auditor revisa (AUD-01 y AUD-03). */
  qualification: QualificationInputSchema.optional(),
  /** Fundamento, cuando la transición lo exige (prevención, abstención, devolución…). */
  legalBasis: LegalBasisTextSchema.optional(),
  /** Acuerdo en versión pública, cuando la transición lo exige (abstención). */
  agreement: AgreementTextSchema.optional(),
  /** Si la substanciación registra una actuación del Tribunal. */
  courtRecord: CourtRecordSchema.optional(),
});

/** Destino de una remisión por incompetencia: una autoridad de la red o una institución de fuera. */
export const ReferralDestinationSchema = z
  .strictObject({
    kind: z.enum(['network', 'outside']).meta({
      description:
        'network: autoridad de la red (por ejemplo, otro nodo); outside: institución sin nodo.',
    }),
    name: z.string().min(3).max(300).meta({ description: 'Nombre de la autoridad de destino.' }),
  })
  .meta({ description: 'A quién se remitió el asunto (LGRA, arts. 14 y 196 fr. II).' });
export type ReferralDestination = z.infer<typeof ReferralDestinationSchema>;

const CloseActionSchema = z.strictObject({
  action: z.literal('close'),
  reason: ClosureReasonSchema,
  legalBasis: LegalBasisTextSchema,
  agreement: AgreementTextSchema,
  /** Sanción declarada (cierre con sanción): el nodo la verifica contra S3. */
  sanction: SanctionClaimSchema.optional(),
  /** Motivo legal del cierre, con sus requisitos en `LEGAL_CLOSURE_REASONS`. */
  legalOutcome: LegalClosureReasonSchema.optional(),
  /** Destino obligatorio con el motivo legal `incompetence`. */
  destination: ReferralDestinationSchema.optional(),
  courtRecord: CourtRecordSchema.optional(),
});
const OrderReclassificationActionSchema = z.strictObject({
  action: z.literal('order_reclassification'),
  legalBasis: LegalBasisTextSchema,
  note: PublicNoteSchema.optional(),
  courtRecord: CourtRecordSchema.optional(),
});
const RequestPrecautionaryActionSchema = z.strictObject({
  action: z.literal('request_precautionary'),
  measure: z.string().min(10).max(2000).meta({
    description:
      'Medida que se pide (LGRA, art. 124). Es privada del nodo: la persona denunciante solo ve que se pidió una medida.',
  }),
  legalBasis: LegalBasisTextSchema,
});
const DecidePrecautionaryActionSchema = z.strictObject({
  action: z.literal('decide_precautionary'),
  outcome: PrecautionaryOutcomeSchema,
  legalBasis: LegalBasisTextSchema,
  courtRecord: CourtRecordSchema.optional(),
});
const FileRemedyActionSchema = z.strictObject({
  action: z.literal('file_remedy'),
  kind: RemedyKindSchema,
  filedBy: RemedyFiledBySchema,
  signed: z.literal(true).meta({
    description:
      'La autoridad declara que recibió el escrito con firma autógrafa (LGRA, art. 109). Sin firma no hay recurso.',
  }),
  legalBasis: LegalBasisTextSchema.optional(),
  note: PublicNoteSchema.optional(),
  courtRecord: CourtRecordSchema.optional(),
});
const ResolveRemedyActionSchema = z.strictObject({
  action: z.literal('resolve_remedy'),
  kind: RemedyKindSchema,
  outcome: RemedyOutcomeSchema,
  legalBasis: LegalBasisTextSchema,
  note: PublicNoteSchema.optional(),
  courtRecord: CourtRecordSchema.optional(),
});
const ReferToProsecutorActionSchema = z.strictObject({
  action: z.literal('refer_to_prosecutor'),
  basis: z.enum(['internal_control', 'superior_audit', 'public_servant']).meta({
    description:
      'Fundamento: internal_control (LGRA, art. 10 fr. III), superior_audit (LGRA, art. 98) o public_servant (CNPP, art. 222).',
  }),
  prosecutor: z.string().min(3).max(300).meta({ description: 'Fiscalía que recibe la vista.' }),
  prosecutorAuthorityId: AuthorityIdSchema.optional().meta({
    description:
      'Fiscalía del mismo nodo (autoridad con papel prosecution) que recibe la vista en su bandeja como copia de lectura: ve los hechos y las pruebas cuyas llaves se le re-cifraron, y solo avanza la vía penal. La denuncia no se reasigna. Sin este campo, la vista va por oficio a una fiscalía fuera del nodo.',
  }),
  note: PublicNoteSchema.optional(),
});
const FlagFederalFundsActionSchema = z.strictObject({
  action: z.literal('flag_federal_funds'),
  funding: FederalFundingSchema,
  note: PublicNoteSchema.optional(),
});
const SendFederalNoticeActionSchema = z.strictObject({
  action: z.literal('send_federal_notice'),
  recipients: z
    .array(z.enum(['asf', 'sabg', 'fgr']))
    .min(1)
    .max(3)
    .refine((items) => new Set(items).size === items.length, 'Destinatario repetido')
    .meta({ description: 'Autoridades federales a las que se da vista o aviso.' }),
  legalBasis: LegalBasisTextSchema,
});
const RegisterSanctionActionSchema = z.strictObject({
  action: z.literal('register_sanction'),
  registryReference: z.string().min(3).max(200).meta({
    description:
      'Referencia de la inscripción en el sistema de sancionados (S3). Solo se registra el acto; no hay integración con el S3.',
  }),
  legalBasis: LegalBasisTextSchema,
});
const RecordWithdrawalActionSchema = z.strictObject({
  action: z.literal('record_withdrawal'),
  note: PublicNoteSchema,
});
const RespondConflictActionSchema = z.strictObject({
  action: z.literal('respond_conflict'),
  response: z.enum(['excuse', 'justification']).meta({
    description:
      'excuse: la autoridad se excusa (LGRA, art. 58); justification: explica por qué no hay conflicto.',
  }),
  note: PublicNoteSchema,
});

/**
 * Acción de la autoridad sobre el trámite. `route`: el buzón general turna a una autoridad del
 * nodo; `accept`, `reassign` y `return`: la autoridad turnada acepta, reasigna o devuelve al buzón
 * general; `advance_stage`: la investigación avanza a una etapa legal; `close`: cierre con uno de
 * los seis motivos, su fundamento y la versión pública del acuerdo.
 */
export const ProcedureActionRequestSchema = z
  .discriminatedUnion('action', [
    RouteActionSchema,
    AcceptActionSchema,
    ReassignActionSchema,
    ReturnActionSchema,
    AdvanceStageActionSchema,
    CloseActionSchema,
    RespondConflictActionSchema,
    OrderReclassificationActionSchema,
    RequestPrecautionaryActionSchema,
    DecidePrecautionaryActionSchema,
    FileRemedyActionSchema,
    ResolveRemedyActionSchema,
    ReferToProsecutorActionSchema,
    FlagFederalFundsActionSchema,
    SendFederalNoticeActionSchema,
    RegisterSanctionActionSchema,
    RecordWithdrawalActionSchema,
  ])
  .meta({
    description:
      'Acción del trámite: route (con su motivo obligatorio), accept, reassign, return, advance_stage (etapas de ADMINISTRATIVE_TRANSITIONS y CRIMINAL_TRANSITIONS), close (con motivo legal opcional y sanción opcional, que se verifica contra S3), respond_conflict, order_reclassification, request_precautionary y decide_precautionary, file_remedy y resolve_remedy, refer_to_prosecutor (vista al Ministerio Público), flag_federal_funds y send_federal_notice, register_sanction o record_withdrawal. Cada una queda en la bitácora y, si lleva nota, en el seguimiento.',
  });
export type ProcedureActionRequest = z.infer<typeof ProcedureActionRequestSchema>;

/** Estado del trámite después de una acción. */
export const ProcedureStateSchema = z
  .object({
    folio: FolioSchema,
    status: ComplaintStatusSchema,
    managementState: ManagementStateSchema,
    legalStage: LegalStageSchema.optional(),
    criminalStage: CriminalStageSchema.optional(),
    closureReason: ClosureReasonSchema.optional(),
    assignedAuthorityId: AuthorityIdSchema,
  })
  .meta({
    description:
      'Estado del trámite: estatus, flujo de gestión, etapa administrativa, etapa penal (en paralelo) y autoridad.',
  });
export type ProcedureState = z.infer<typeof ProcedureStateSchema>;

/**
 * Datos del acto registrados con el paso. La vista de la persona denunciante omite lo reservado
 * (la medida cautelar concreta y quién recurrió, salvo que haya sido ella).
 */
export const ProcedureStepRecordSchema = z
  .object({
    recordedForCourt: z.literal(true).optional().meta({
      description:
        'Registro de actuación del Tribunal: lo capturó otra autoridad (la substanciadora) porque el estado no dio cuentas al Tribunal.',
    }),
    courtFileNumber: z.string().optional().meta({ description: 'Expediente del Tribunal.' }),
    legalBasis: z.string().optional().meta({ description: 'Fundamento del acto.' }),
    remedyKind: RemedyKindSchema.optional(),
    remedyOutcome: RemedyOutcomeSchema.optional(),
    remedyFiledBy: RemedyFiledBySchema.optional(),
    precautionaryOutcome: PrecautionaryOutcomeSchema.optional(),
    criminalStage: CriminalStageSchema.optional(),
    legalOutcome: LegalClosureReasonSchema.optional(),
    destination: ReferralDestinationSchema.optional(),
    funding: FederalFundingSchema.optional(),
    recipients: z
      .array(z.enum(['asf', 'sabg', 'fgr']))
      .optional()
      .meta({ description: 'Autoridades federales a las que se dio aviso.' }),
    prosecutor: z.string().optional().meta({ description: 'Fiscalía que recibió la vista.' }),
    registryReference: z
      .string()
      .optional()
      .meta({ description: 'Referencia de la inscripción de la sanción en el S3.' }),
  })
  .meta({ description: 'Datos del acto registrados con el paso.' });
export type ProcedureStepRecord = z.infer<typeof ProcedureStepRecordSchema>;

/** Paso de la línea de tiempo, con su explicación en lenguaje sencillo. */
export const ProcedureStepSchema = z
  .object({
    on: DayDateSchema.meta({ description: 'Día (UTC) de la acción.' }),
    legalOn: LegalDaySchema,
    action: ProcedureActionSchema,
    managementState: ManagementStateSchema,
    legalStage: LegalStageSchema.optional(),
    closureReason: ClosureReasonSchema.optional(),
    title: z.string().meta({ description: 'Qué pasó, en pocas palabras.' }),
    explanation: z.string().meta({ description: 'Qué significa, en lenguaje sencillo.' }),
    note: PublicNoteSchema.optional(),
    record: ProcedureStepRecordSchema.optional(),
  })
  .meta({ description: 'Paso del trámite en la línea de tiempo.' });
export type ProcedureStep = z.infer<typeof ProcedureStepSchema>;

/** Plazo legal vigente con su situación. */
export const DeadlineViewSchema = z
  .object({
    key: DeadlineKeySchema,
    name: z.string().meta({ description: 'Nombre del plazo.' }),
    explanation: z.string().meta({ description: 'Qué exige el plazo, en lenguaje sencillo.' }),
    startsOn: LegalDaySchema,
    dueOn: LegalDaySchema,
    status: DeadlineStatusSchema,
    remaining: z.number().int().meta({
      description: 'Días que faltan en remainingUnit (0 el último día, negativo si venció).',
    }),
    remainingUnit: z
      .enum(['natural_days', 'business_days'])
      .meta({ description: 'Unidad de remaining: días naturales o días hábiles.' }),
    legalBasis: z.array(z.string()).meta({ description: 'Fundamentos con el nombre de la ley.' }),
    earliestOn: LegalDaySchema.optional().meta({
      description:
        'Solo en plazos con mínimo: primer día en que procede el acto (la audiencia inicial, no antes de 10 días hábiles después del emplazamiento; LGRA, art. 208 fr. III).',
    }),
    isEarliestReached: z.boolean().optional().meta({
      description: 'Solo en plazos con mínimo: si hoy ya procede el acto, según el reloj del nodo.',
    }),
  })
  .meta({
    description: 'Plazo legal con su vencimiento y situación (en curso, por vencer, vencido).',
  });
export type DeadlineView = z.infer<typeof DeadlineViewSchema>;

/** Cierre con su motivo, su fundamento y la versión pública del acuerdo. */
export const ClosureViewSchema = z
  .object({
    on: DayDateSchema,
    legalOn: LegalDaySchema,
    reason: ClosureReasonSchema,
    reasonName: z.string().meta({ description: 'Nombre del motivo de cierre.' }),
    reasonExplanation: z
      .string()
      .meta({ description: 'Qué significa el motivo, en lenguaje sencillo.' }),
    legalBasis: LegalBasisTextSchema,
    agreement: AgreementTextSchema,
    sanctionCheck: SanctionCheckViewSchema.optional(),
    legalOutcome: LegalClosureReasonSchema.optional(),
    legalOutcomeName: z.string().optional().meta({ description: 'Nombre del motivo legal.' }),
    legalOutcomeExplanation: z
      .string()
      .optional()
      .meta({ description: 'Qué significa el motivo legal, en lenguaje sencillo.' }),
    destination: ReferralDestinationSchema.optional(),
  })
  .meta({ description: 'Cierre del trámite con fundamento y acuerdo en versión pública.' });
export type ClosureView = z.infer<typeof ClosureViewSchema>;

/**
 * Aviso de inconformidad de la persona denunciante (LGRA, arts. 102 a 110). La inconformidad cuenta
 * cuando la autoridad registra el escrito con firma autógrafa (`signedOn`); solo entonces corre el
 * plazo de la Sala.
 */
export const AppealViewSchema = z
  .object({
    filedOn: DayDateSchema.meta({ description: 'Día del aviso en línea.' }),
    legalOn: LegalDaySchema,
    reasons: z.string().meta({
      description: 'Motivos por los que estima indebida la calificación o la abstención.',
    }),
    filingDueOn: LegalDaySchema.optional().meta({
      description:
        'Último día para entregar el escrito firmado ante la autoridad investigadora (LGRA, arts. 103 y 109).',
    }),
    signedOn: LegalDaySchema.optional().meta({
      description: 'Día en que la autoridad registró el escrito con firma autógrafa.',
    }),
    resolutionDueOn: LegalDaySchema.optional().meta({
      description:
        'Plazo de la Sala para resolver: 30 días hábiles (LGRA, art. 107), desde el escrito firmado.',
    }),
  })
  .meta({ description: 'Aviso de inconformidad y, si ya llegó, el escrito firmado.' });
export type AppealView = z.infer<typeof AppealViewSchema>;

/** Calificación de la falta con su acuerdo, y la inconformidad si la hubo. */
export const QualificationViewSchema = z
  .object({
    on: DayDateSchema,
    legalOn: LegalDaySchema,
    severity: QualificationSeveritySchema,
    severityName: z.string().meta({ description: 'Falta grave o falta no grave.' }),
    explanation: z
      .string()
      .meta({ description: 'Qué significa y qué puede hacer quien denunció.' }),
    legalBasis: LegalBasisTextSchema,
    agreement: AgreementTextSchema,
    appealDueOn: LegalDaySchema.optional().meta({
      description:
        'Último día para inconformarse: 5 días hábiles desde la notificación (LGRA, art. 103).',
    }),
    appeal: AppealViewSchema.optional(),
  })
  .meta({ description: 'Calificación de la falta (LGRA, arts. 100 y 102).' });
export type QualificationView = z.infer<typeof QualificationViewSchema>;

/** Recurso del trámite con su situación. */
export const RemedyViewSchema = z
  .object({
    kind: RemedyKindSchema,
    name: z.string().meta({ description: 'Nombre del recurso.' }),
    filedOn: LegalDaySchema,
    filedBy: RemedyFiledBySchema.optional().meta({
      description:
        'Quién lo presentó. En el seguimiento solo aparece si fue la propia persona denunciante.',
    }),
    status: z.enum(['pending', 'admitted', 'resolved']).meta({
      description: 'pending (presentado), admitted (admitido, sin resolver) o resolved (resuelto).',
    }),
    outcome: RemedyOutcomeSchema.optional(),
    outcomeName: z.string().optional().meta({ description: 'Nombre del resultado.' }),
    resolvedOn: LegalDaySchema.optional(),
    resolutionDueOn: LegalDaySchema.optional(),
    effect: z.string().meta({ description: 'Efecto del recurso en el trámite.' }),
  })
  .meta({ description: 'Recurso presentado y su resultado.' });
export type RemedyView = z.infer<typeof RemedyViewSchema>;

/** Inconformidad posible o en curso contra la calificación de no grave o la abstención. */
export const InconformityViewSchema = z
  .object({
    against: z.enum(['non_serious', 'abstention']).meta({
      description:
        'Acto que se impugna: non_serious (calificación de no grave) o abstention (abstención).',
    }),
    notifiedOn: LegalDaySchema.optional(),
    filingDueOn: LegalDaySchema.optional(),
    filingRemaining: z.number().int().optional().meta({
      description:
        'Días hábiles que faltan para entregar el escrito, contados por el nodo con su reloj y su calendario.',
    }),
    filingStatus: DeadlineStatusSchema.optional(),
    notice: AppealViewSchema.optional(),
    signedOn: LegalDaySchema.optional(),
    resolutionDueOn: LegalDaySchema.optional(),
    outcome: RemedyOutcomeSchema.optional(),
  })
  .meta({ description: 'Inconformidad: plazo, aviso, escrito firmado y resultado.' });
export type InconformityView = z.infer<typeof InconformityViewSchema>;

/** Abstención de la autoridad (LGRA, art. 101) con su acuerdo. */
export const AbstentionViewSchema = z
  .object({
    legalOn: LegalDaySchema,
    legalBasis: z.string().meta({ description: 'Fundamento de la abstención.' }),
    agreement: z.string().meta({ description: 'Acuerdo de abstención en versión pública.' }),
    explanation: z
      .string()
      .meta({ description: 'Qué significa y cómo inconformarse, en lenguaje sencillo.' }),
  })
  .meta({ description: 'Abstención con su fundamento y acuerdo en versión pública.' });
export type AbstentionView = z.infer<typeof AbstentionViewSchema>;

/** Recursos federales en un ente local y lo que la regla ofrece (B10). */
export const FederalFundsViewSchema = z
  .object({
    funding: FederalFundingSchema,
    fundingName: z.string().meta({ description: 'Nombre del origen de los recursos.' }),
    flaggedOn: LegalDaySchema,
    noticeSentOn: LegalDaySchema.optional(),
  })
  .meta({ description: 'La denuncia involucra recursos federales: guía de la regla.' });
export type FederalFundsView = z.infer<typeof FederalFundsViewSchema>;

/** Regla pública que se cumplió: escalamiento o alerta. */
export const RuleTriggerViewSchema = z
  .object({
    on: DayDateSchema,
    ruleKey: EscalationRuleKeySchema,
    name: z.string().meta({ description: 'Nombre de la regla.' }),
    explanation: z
      .string()
      .meta({ description: 'Qué vigila la regla y qué pasa, en lenguaje sencillo.' }),
    effect: RuleEffectSchema,
    dueOn: LegalDaySchema.meta({ description: 'Vencimiento que dio lugar a la regla.' }),
  })
  .meta({ description: 'Regla pública de escalamiento o de alerta que se cumplió.' });
export type RuleTriggerView = z.infer<typeof RuleTriggerViewSchema>;

/** Vista del trámite: dónde está, qué significa, qué pasó, qué plazos corren y qué reglas se cumplieron. */
export const ProcedureViewSchema = z
  .object({
    managementState: ManagementStateSchema,
    managementStateName: z.string().meta({ description: 'Nombre del estado actual.' }),
    explanation: z.string().meta({ description: 'Qué significa el estado actual.' }),
    legalStage: LegalStageSchema.optional(),
    legalStageName: z.string().optional().meta({ description: 'Nombre de la etapa legal.' }),
    criminalStage: CriminalStageSchema.optional().meta({
      description: 'Etapa de la vía penal, que corre en paralelo a la administrativa.',
    }),
    criminalStageName: z
      .string()
      .optional()
      .meta({ description: 'Nombre de la etapa de la vía penal.' }),
    closure: ClosureViewSchema.optional(),
    qualification: QualificationViewSchema.optional(),
    abstention: AbstentionViewSchema.optional(),
    inconformity: InconformityViewSchema.optional(),
    remedies: z.array(RemedyViewSchema).optional().meta({ description: 'Recursos presentados.' }),
    precautionary: z
      .object({
        requestedOn: LegalDaySchema,
        decidedOn: LegalDaySchema.optional(),
        outcome: PrecautionaryOutcomeSchema.optional(),
      })
      .optional()
      .meta({
        description: 'Última medida cautelar pedida y su resultado, sin la medida concreta.',
      }),
    federalFunds: FederalFundsViewSchema.optional(),
    courtRecording: z.boolean().optional().meta({
      description:
        'Solo en el panel: el estado no dio cuentas al Tribunal y la substanciación registra sus actuaciones.',
    }),
    sanctionRegistered: z
      .object({
        legalOn: LegalDaySchema,
        registryReference: z
          .string()
          .meta({ description: 'Referencia de la inscripción en el S3 (registrada como acto).' }),
      })
      .optional()
      .meta({ description: 'Inscripción de la sanción en el S3, registrada como acto.' }),
    steps: z
      .array(ProcedureStepSchema)
      .meta({ description: 'Pasos del más antiguo al más reciente.' }),
    deadlines: z.array(DeadlineViewSchema).meta({ description: 'Plazos legales que corren.' }),
    rules: z
      .array(RuleTriggerViewSchema)
      .meta({ description: 'Reglas públicas que se cumplieron (escalamientos y alertas).' }),
  })
  .meta({ description: 'Trámite de la denuncia con su línea de tiempo, plazos y reglas.' });
export type ProcedureView = z.infer<typeof ProcedureViewSchema>;

/** Acuerdo de cierre tal como lo consulta el auditor (`GET authorityClosures`). */
export const ClosureRecordSchema = z
  .object({
    folio: FolioSchema,
    authorityId: AuthorityIdSchema,
    on: DayDateSchema,
    legalOn: LegalDaySchema,
    reason: ClosureReasonSchema,
    legalBasis: LegalBasisTextSchema,
    agreement: AgreementTextSchema,
    agreementDigest: Sha256HexSchema.meta({
      description: 'SHA-256 del texto del acuerdo; va en los datos de su evento de bitácora.',
    }),
    actorId: AccountIdSchema,
  })
  .meta({ description: 'Acuerdo de cierre en versión pública, para el auditor.' });
export type ClosureRecord = z.infer<typeof ClosureRecordSchema>;
