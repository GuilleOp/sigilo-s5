// Ciclo de vida legal de una denuncia (LGRA y, en la vía penal, CNPP): transiciones entre etapas
// con la función que actúa en cada una, recursos con sus plazos y su efecto en el trámite, motivos
// legales de cierre, medidas cautelares, vista al Ministerio Público y la regla de los recursos
// federales en entes locales. Todo es nacional (el estándar); cada estado solo asigna quién cumple
// cada función con su tabla de funciones firmada y las funciones de sus cuentas.
import type { ProcedureFunction } from '../authority-access.ts';
import type { ComplaintStatus } from '../complaint.ts';
import type {
  AdministrativeStage,
  ClosureReason,
  CriminalStage,
  DeadlineKey,
  FederalFunding,
  LegalClosureReason,
  PrecautionaryOutcome,
  ProcedureAction,
  QualificationSeverity,
  RemedyFiledBy,
  RemedyKind,
  RemedyOutcome,
} from '../procedure.ts';
import type { LegalReference } from './procedure.ts';

/** Datos que exige una transición además de la nota pública. */
export type TransitionRequirement = 'qualification' | 'legalBasis' | 'agreement';

/** Paso válido entre dos etapas administrativas. */
export interface StageTransition {
  /** Etapa de origen (`null`: la denuncia aceptada todavía no tiene etapa). */
  from: AdministrativeStage | null;
  to: AdministrativeStage;
  /** Función que da el paso. La del Tribunal la puede registrar la substanciación si no hay cuentas del Tribunal. */
  fn: ProcedureFunction;
  /** Acción que queda en la línea de tiempo. */
  action: Extract<
    ProcedureAction,
    'stage_advanced' | 'abstention_declared' | 'report_not_filed' | 'returned_by_court'
  >;
  /** Solo con esta calificación vigente (rama no grave o grave). */
  severities?: readonly QualificationSeverity[];
  requires?: readonly TransitionRequirement[];
  /**
   * Plazos que deben haber vencido para dar el paso, contados desde que la denuncia entró a la etapa
   * de origen con el calendario del nodo. Si el plazo es para presentar un recurso y ese recurso se
   * presentó en la etapa y ya se resolvió, el paso procede sin esperar (LGRA, art. 206).
   */
  afterDeadlines?: readonly DeadlineKey[];
  /** Qué dice el botón del panel. */
  label: string;
  legalBasis: readonly LegalReference[];
}

const LGRA = (article: string, fraction?: string): LegalReference =>
  fraction === undefined ? { law: 'LGRA', article } : { law: 'LGRA', article, fraction };

/**
 * Máquina de estados de la vía administrativa (ver `docs/ciclo-de-vida-legal.md`). Después de la
 * audiencia inicial, la rama no grave sigue con la substanciadora y resolutora (art. 208 fr. VIII
 * a XI) y la grave o de particulares va al Tribunal (art. 209). El Tribunal puede devolver el
 * expediente si la falta no es grave (art. 209 fr. II).
 */
export const ADMINISTRATIVE_TRANSITIONS: readonly StageTransition[] = [
  {
    from: null,
    to: 'investigation',
    fn: 'investigation',
    action: 'stage_advanced',
    label: 'Iniciar la investigación',
    legalBasis: [LGRA('94'), LGRA('64', 'II')],
  },
  {
    from: 'investigation',
    to: 'qualification',
    fn: 'investigation',
    action: 'stage_advanced',
    requires: ['qualification'],
    label: 'Calificar la falta',
    legalBasis: [LGRA('100')],
  },
  {
    from: 'qualification',
    to: 'report_filed',
    fn: 'investigation',
    action: 'stage_advanced',
    label: 'Presentar el Informe de Presunta Responsabilidad Administrativa',
    legalBasis: [LGRA('100'), LGRA('194')],
  },
  {
    from: 'report_filed',
    to: 'report_prevented',
    fn: 'substantiation',
    action: 'stage_advanced',
    requires: ['legalBasis'],
    label: 'Prevenir: pedir que se corrija el informe',
    legalBasis: [LGRA('195')],
  },
  {
    from: 'report_filed',
    to: 'abstention',
    fn: 'substantiation',
    action: 'abstention_declared',
    requires: ['legalBasis', 'agreement'],
    label: 'Abstenerse de iniciar el procedimiento',
    legalBasis: [LGRA('101')],
  },
  {
    from: 'report_filed',
    to: 'report_admitted',
    fn: 'substantiation',
    action: 'stage_advanced',
    label: 'Admitir el informe e iniciar el procedimiento',
    legalBasis: [LGRA('112'), LGRA('208', 'I')],
  },
  {
    from: 'report_prevented',
    to: 'report_filed',
    fn: 'investigation',
    action: 'stage_advanced',
    label: 'Presentar el informe corregido',
    legalBasis: [LGRA('195')],
  },
  {
    from: 'report_prevented',
    to: 'investigation',
    fn: 'substantiation',
    action: 'report_not_filed',
    requires: ['legalBasis'],
    afterDeadlines: ['report_correction'],
    label: 'Tener el informe por no presentado (no se corrigió)',
    legalBasis: [LGRA('195')],
  },
  {
    from: 'report_admitted',
    to: 'summoned',
    fn: 'substantiation',
    action: 'stage_advanced',
    label: 'Emplazar a la persona señalada',
    legalBasis: [LGRA('193'), LGRA('208', 'II')],
  },
  {
    from: 'summoned',
    to: 'initial_hearing',
    fn: 'substantiation',
    action: 'stage_advanced',
    label: 'Registrar la audiencia inicial',
    legalBasis: [LGRA('208', 'III a VII')],
  },
  {
    from: 'initial_hearing',
    to: 'evidence_hearing',
    fn: 'substantiation',
    action: 'stage_advanced',
    severities: ['non_serious'],
    label: 'Admitir las pruebas (falta no grave)',
    legalBasis: [LGRA('208', 'VIII')],
  },
  {
    from: 'initial_hearing',
    to: 'case_file_sent',
    fn: 'substantiation',
    action: 'stage_advanced',
    severities: ['serious'],
    label: 'Enviar el expediente al Tribunal (falta grave o de particulares)',
    legalBasis: [LGRA('12'), LGRA('209', 'I')],
  },
  {
    from: 'evidence_hearing',
    to: 'closing_arguments',
    fn: 'substantiation',
    action: 'stage_advanced',
    label: 'Abrir el periodo de alegatos',
    legalBasis: [LGRA('208', 'IX')],
  },
  {
    from: 'closing_arguments',
    to: 'instruction_closed',
    fn: 'substantiation',
    action: 'stage_advanced',
    label: 'Cerrar la instrucción',
    legalBasis: [LGRA('208', 'X')],
  },
  {
    from: 'instruction_closed',
    to: 'resolution',
    fn: 'substantiation',
    action: 'stage_advanced',
    label: 'Resolver la falta no grave',
    legalBasis: [LGRA('208', 'X y XI')],
  },
  {
    from: 'case_file_sent',
    to: 'court_received',
    fn: 'court',
    action: 'stage_advanced',
    label: 'Recibir el expediente en el Tribunal',
    legalBasis: [LGRA('209', 'II')],
  },
  {
    from: 'court_received',
    to: 'evidence_hearing',
    fn: 'court',
    action: 'returned_by_court',
    requires: ['legalBasis'],
    label: 'Devolver a la autoridad substanciadora: no es falta grave',
    legalBasis: [LGRA('209', 'II')],
  },
  {
    from: 'court_received',
    to: 'court_evidence_hearing',
    fn: 'court',
    action: 'stage_advanced',
    label: 'Admitir las pruebas en el Tribunal',
    legalBasis: [LGRA('209', 'II')],
  },
  {
    from: 'court_evidence_hearing',
    to: 'court_closing_arguments',
    fn: 'court',
    action: 'stage_advanced',
    label: 'Abrir los alegatos en el Tribunal',
    legalBasis: [LGRA('209', 'III')],
  },
  {
    from: 'court_closing_arguments',
    to: 'court_instruction_closed',
    fn: 'court',
    action: 'stage_advanced',
    label: 'Cerrar la instrucción en el Tribunal',
    legalBasis: [LGRA('209', 'IV')],
  },
  {
    from: 'court_instruction_closed',
    to: 'court_resolution',
    fn: 'court',
    action: 'stage_advanced',
    label: 'Dictar la sentencia',
    legalBasis: [LGRA('207'), LGRA('209', 'IV y V')],
  },
  {
    from: 'resolution',
    to: 'final',
    fn: 'substantiation',
    action: 'stage_advanced',
    afterDeadlines: ['revocation_filing'],
    label: 'Declarar la resolución firme',
    legalBasis: [LGRA('206')],
  },
  {
    from: 'court_resolution',
    to: 'final',
    fn: 'court',
    action: 'stage_advanced',
    afterDeadlines: ['court_appeal_filing', 'review_filing'],
    label: 'Declarar la sentencia firme',
    legalBasis: [LGRA('206')],
  },
  {
    from: 'final',
    to: 'executed',
    fn: 'substantiation',
    action: 'stage_advanced',
    label: 'Registrar la ejecución de la sanción',
    legalBasis: [LGRA('222'), LGRA('225')],
  },
];

/** Paso válido de la vía penal, que corre aparte (`criminalStage`). */
export interface CriminalTransition {
  from: CriminalStage | null;
  to: CriminalStage;
  label: string;
}

/**
 * Máquina de estados de la vía penal. Empieza con la vista al Ministerio Público (acción
 * `refer_to_prosecutor`) o, si la denuncia llegó a la fiscalía, con la investigación penal. La
 * registra quien investiga (la fiscalía o el órgano interno de control como coadyuvante, LGRA
 * art. 42).
 */
export const CRIMINAL_TRANSITIONS: readonly CriminalTransition[] = [
  { from: null, to: 'criminal_investigation', label: 'Iniciar la investigación penal' },
  {
    from: 'criminal_complaint_filed',
    to: 'criminal_investigation',
    label: 'El Ministerio Público inició la investigación',
  },
  {
    from: 'criminal_investigation',
    to: 'prosecutor_determination',
    label: 'Determinación del Ministerio Público',
  },
  { from: 'criminal_investigation', to: 'intermediate_stage', label: 'Etapa intermedia' },
  { from: 'criminal_investigation', to: 'alternative_exit', label: 'Solución alterna' },
  {
    from: 'prosecutor_determination',
    to: 'judicial_review',
    label: 'Se impugnó la determinación ante el juez',
  },
  {
    from: 'prosecutor_determination',
    to: 'criminal_investigation',
    label: 'Se reabrió la investigación',
  },
  {
    from: 'judicial_review',
    to: 'criminal_investigation',
    label: 'El juez ordenó seguir la investigación',
  },
  {
    from: 'judicial_review',
    to: 'prosecutor_determination',
    label: 'El juez confirmó la determinación',
  },
  { from: 'intermediate_stage', to: 'trial', label: 'Juicio' },
  { from: 'intermediate_stage', to: 'alternative_exit', label: 'Solución alterna' },
  { from: 'trial', to: 'sentence', label: 'Sentencia' },
];

/** Qué sigue abierto mientras corre un plazo de `afterDeadlines`, para el aviso «hasta el …». */
export const STAGE_WAIT_TEXTS: Readonly<Partial<Record<DeadlineKey, string>>> = {
  revocation_filing: 'La resolución todavía puede impugnarse con el recurso de revocación',
  court_appeal_filing: 'La sentencia todavía puede apelarse',
  review_filing: 'Todavía se puede pedir la revisión de la sentencia',
  report_correction: 'La autoridad investigadora todavía puede corregir el informe',
};

/** Recurso que se presenta dentro del plazo `key` (revocación, apelación…), o `undefined`. */
export function remedyKindForFilingDeadline(key: DeadlineKey): RemedyKind | undefined {
  return REMEDY_KINDS.find((kind) => kind.filingDeadline === key)?.key;
}

/** Transiciones administrativas que salen de `from`. */
export function transitionsFrom(from: AdministrativeStage | null): readonly StageTransition[] {
  return ADMINISTRATIVE_TRANSITIONS.filter((transition) => transition.from === from);
}

/** Transición administrativa de `from` a `to`, o `undefined` si no existe. */
export function findTransition(
  from: AdministrativeStage | null,
  to: AdministrativeStage,
): StageTransition | undefined {
  return ADMINISTRATIVE_TRANSITIONS.find(
    (transition) => transition.from === from && transition.to === to,
  );
}

/** Transición penal de `from` a `to`, o `undefined` si no existe. */
export function findCriminalTransition(
  from: CriminalStage | null,
  to: CriminalStage,
): CriminalTransition | undefined {
  return CRIMINAL_TRANSITIONS.find(
    (transition) => transition.from === from && transition.to === to,
  );
}

/** Recurso con sus plazos, quién lo presenta y lo resuelve, y su efecto en el trámite. */
export interface RemedyKindOption {
  key: RemedyKind;
  name: string;
  /** Contra qué procede. */
  against: string;
  /** Quiénes pueden presentarlo. */
  filedBy: readonly RemedyFiledBy[];
  /** Ante quién se presenta. */
  filedBefore: string;
  /** Funciones que registran la presentación en el sistema. */
  recordedBy: readonly ProcedureFunction[];
  /**
   * Función que lo resuelve; `in_charge` es la que lleva la etapa en que se presentó (la autoridad
   * que dictó el auto, en la reclamación).
   */
  resolvedBy: ProcedureFunction | 'in_charge';
  /** Etapas en las que se puede presentar. */
  stages: readonly AdministrativeStage[];
  filingDeadline: DeadlineKey;
  resolutionDeadline?: DeadlineKey;
  /** Etapas a las que no se puede pasar mientras el recurso está pendiente. */
  blocks: readonly AdministrativeStage[];
  /** Efecto en el trámite, en lenguaje sencillo. */
  effect: string;
  /** Qué pasa en el trámite si se revoca (o se deja sin efecto) el acto. */
  onRevoked: string;
  legalBasis: readonly LegalReference[];
}

const AFTER_ADMISSION: readonly AdministrativeStage[] = [
  'report_admitted',
  'summoned',
  'initial_hearing',
  'evidence_hearing',
  'closing_arguments',
  'instruction_closed',
  'case_file_sent',
  'court_received',
  'court_evidence_hearing',
  'court_closing_arguments',
  'court_instruction_closed',
];

export const REMEDY_KINDS: readonly RemedyKindOption[] = [
  {
    key: 'inconformity',
    name: 'Inconformidad',
    against:
      'La calificación de la falta como no grave o la abstención de iniciar el procedimiento.',
    filedBy: ['reporter'],
    filedBefore:
      'La autoridad investigadora, que la envía con el expediente a la Sala del Tribunal.',
    recordedBy: ['investigation'],
    resolvedBy: 'court',
    stages: ['qualification', 'report_filed', 'abstention'],
    filingDeadline: 'appeal_filing',
    resolutionDeadline: 'appeal_resolution',
    blocks: ['report_admitted'],
    effect:
      'Mientras se resuelve no se inicia el procedimiento de responsabilidad ni se cierra por abstención. El escrito exige firma autógrafa: sin ella no se tiene por presentado y no hay prevención.',
    onRevoked:
      'Si se revoca la calificación de no grave, la autoridad investigadora vuelve a calificar; si se revoca la abstención, la autoridad substanciadora debe pronunciarse de nuevo sobre el informe.',
    legalBasis: [LGRA('102'), LGRA('103'), LGRA('104'), LGRA('107'), LGRA('109'), LGRA('110')],
  },
  {
    key: 'claim',
    name: 'Reclamación',
    against:
      'Los autos que admiten, desechan o tienen por no presentado el informe, la contestación o una prueba; los que sobreseen antes del cierre de la instrucción, y los que admiten o rechazan a un tercero.',
    filedBy: ['accused', 'investigating_authority', 'reporter', 'other_party'],
    filedBefore: 'La autoridad que dictó el auto.',
    recordedBy: ['substantiation', 'court'],
    resolvedBy: 'in_charge',
    stages: AFTER_ADMISSION,
    filingDeadline: 'claim_filing',
    resolutionDeadline: 'claim_resolution',
    blocks: [],
    effect: 'No suspende el procedimiento. Se resuelve en 5 días hábiles y no admite recurso.',
    onRevoked:
      'El auto reclamado queda sin efecto y la autoridad que lo dictó lo repone; el cambio se registra con la etapa que corresponda.',
    legalBasis: [LGRA('213'), LGRA('214')],
  },
  {
    key: 'revocation',
    name: 'Revocación',
    against: 'La resolución que sanciona por una falta no grave.',
    filedBy: ['accused'],
    filedBefore: 'La autoridad que resolvió (órgano interno de control o contraloría).',
    recordedBy: ['substantiation'],
    resolvedBy: 'substantiation',
    stages: ['resolution'],
    filingDeadline: 'revocation_filing',
    resolutionDeadline: 'revocation_resolution',
    blocks: ['final'],
    effect:
      'Mientras se resuelve, la resolución no queda firme. Contra lo que se resuelva cabe juicio ante el Tribunal.',
    onRevoked:
      'La resolución queda sin efecto o se modifica: la autoridad registra la nueva resolución antes de declararla firme.',
    legalBasis: [LGRA('210'), LGRA('211'), LGRA('212')],
  },
  {
    key: 'appeal',
    name: 'Apelación',
    against: 'La sentencia del Tribunal que sanciona o que absuelve.',
    filedBy: ['accused', 'reporter', 'investigating_authority', 'other_party'],
    filedBefore: 'El Tribunal que resolvió; la resuelve su segunda instancia.',
    recordedBy: ['court', 'investigation'],
    resolvedBy: 'court',
    stages: ['court_resolution'],
    filingDeadline: 'court_appeal_filing',
    blocks: ['final'],
    effect:
      'Mientras se resuelve, la sentencia no queda firme. La persona denunciante identificada puede apelar como tercera.',
    onRevoked:
      'La sentencia se revoca o se modifica en segunda instancia; lo que resuelva la alzada es lo que queda firme.',
    legalBasis: [
      LGRA('215'),
      LGRA('216'),
      LGRA('217'),
      LGRA('218'),
      LGRA('219'),
      LGRA('116', 'IV'),
    ],
  },
  {
    key: 'review',
    name: 'Revisión',
    against: 'Las sentencias definitivas del Tribunal.',
    filedBy: ['investigating_authority', 'other_party'],
    filedBefore: 'El Tribunal que resolvió, según la ley de cada estado.',
    recordedBy: ['court', 'investigation'],
    resolvedBy: 'court',
    stages: ['court_resolution'],
    filingDeadline: 'review_filing',
    blocks: ['final'],
    effect: 'Mientras se resuelve, la sentencia no queda firme.',
    onRevoked: 'La sentencia se revoca o se modifica; lo que se resuelva es lo que queda firme.',
    legalBasis: [LGRA('220'), LGRA('221')],
  },
];

/** Nombre y explicación de cada resultado de un recurso. */
export const REMEDY_OUTCOMES: readonly { key: RemedyOutcome; name: string; explanation: string }[] =
  [
    {
      key: 'admitted',
      name: 'Procedente (admitido)',
      explanation: 'El recurso se admitió y sigue en trámite hasta que se resuelva.',
    },
    {
      key: 'inadmissible',
      name: 'Improcedente',
      explanation:
        'El recurso no se admitió (por ejemplo, fuera de plazo o sin firma autógrafa). El acto recurrido sigue igual.',
    },
    {
      key: 'confirmed',
      name: 'Confirmada',
      explanation: 'Se confirmó el acto recurrido: sigue igual.',
    },
    {
      key: 'revoked',
      name: 'Revocada',
      explanation: 'El acto recurrido quedó sin efecto.',
    },
    {
      key: 'modified',
      name: 'Modificada',
      explanation: 'El acto recurrido se modificó.',
    },
  ];

/** Nombre de quien presenta un recurso. */
export const REMEDY_FILERS: readonly { key: RemedyFiledBy; name: string }[] = [
  { key: 'reporter', name: 'La persona denunciante (como tercera)' },
  { key: 'accused', name: 'La persona señalada' },
  { key: 'investigating_authority', name: 'La autoridad investigadora' },
  { key: 'other_party', name: 'Otra parte o autoridad' },
];

/** Recurso por clave, o `undefined`. */
export function findRemedyKind(key: string): RemedyKindOption | undefined {
  return REMEDY_KINDS.find((kind) => kind.key === key);
}

/** Resultado de recurso por clave, o `undefined`. */
export function findRemedyOutcome(key: string) {
  return REMEDY_OUTCOMES.find((outcome) => outcome.key === key);
}

/** Motivo legal del cierre con sus requisitos. */
export interface LegalClosureReasonOption {
  key: LegalClosureReason;
  name: string;
  explanation: string;
  /** Motivos del S5 con los que se puede combinar (el cierre lleva los dos). */
  s5Reasons: readonly ClosureReason[];
  /** Estatus de la API v1 que deja. */
  status: ComplaintStatus;
  /**
   * Etapas administrativas en las que cabe; `undefined`, en cualquiera. `allowsNoStage` permite
   * cerrar antes de iniciar la investigación.
   */
  stages?: readonly AdministrativeStage[];
  allowsNoStage?: boolean;
  /** Exige el destino (otra autoridad, dentro o fuera de la red). */
  requiresDestination?: boolean;
  legalBasis: readonly LegalReference[];
}

export const LEGAL_CLOSURE_REASONS: readonly LegalClosureReasonOption[] = [
  {
    key: 'archived',
    name: 'Archivo por falta de elementos',
    explanation:
      'La investigación no encontró elementos para acreditar la falta. Se puede reabrir con nuevos indicios mientras no prescriba.',
    s5Reasons: ['insufficient_information'],
    status: 'archived',
    stages: ['investigation', 'qualification'],
    allowsNoStage: true,
    legalBasis: [LGRA('100')],
  },
  {
    key: 'abstention',
    name: 'Abstención',
    explanation:
      'La autoridad se abstuvo de iniciar el procedimiento o de sancionar (sin daño a la hacienda pública y por criterio opinable o corrección espontánea), y la abstención no se impugnó o se confirmó.',
    s5Reasons: ['attended'],
    status: 'final_no_sanction',
    stages: ['abstention'],
    legalBasis: [LGRA('101')],
  },
  {
    key: 'prescribed',
    name: 'Prescripción',
    explanation:
      'Pasó el plazo para sancionar: 3 años en faltas no graves y 7 en graves o de particulares.',
    s5Reasons: ['other'],
    status: 'prescribed_or_expired',
    allowsNoStage: true,
    legalBasis: [LGRA('74')],
  },
  {
    key: 'expired',
    name: 'Caducidad de la instancia',
    explanation:
      'Admitido el informe, el procedimiento estuvo parado más de 6 meses sin causa justificada y se decretó la caducidad a petición de la persona señalada.',
    s5Reasons: ['other'],
    status: 'prescribed_or_expired',
    stages: AFTER_ADMISSION,
    legalBasis: [LGRA('74')],
  },
  {
    key: 'dismissed',
    name: 'Sobreseimiento',
    explanation:
      'El procedimiento terminó sin resolver el fondo por una causa de la ley (por ejemplo, improcedencia, muerte de la persona señalada o derogación de la falta).',
    s5Reasons: ['other', 'inadmissible'],
    status: 'final_no_sanction',
    stages: [...AFTER_ADMISSION, 'resolution', 'court_resolution'],
    legalBasis: [LGRA('196'), LGRA('197')],
  },
  {
    key: 'incompetence',
    name: 'Incompetencia y remisión',
    explanation:
      'La autoridad no es competente y remitió el asunto a la que sí lo es (dentro o fuera de la red), con fundamento y por oficio.',
    s5Reasons: ['channeled'],
    status: 'resolved',
    allowsNoStage: true,
    requiresDestination: true,
    legalBasis: [LGRA('14'), LGRA('196', 'II')],
  },
  {
    key: 'sanctioned',
    name: 'Resolución firme con sanción',
    explanation:
      'La resolución que sanciona quedó firme (o la sanción ya se ejecutó) y la sanción está inscrita en el registro de sancionados (S3, LGRA art. 27).',
    s5Reasons: ['attended'],
    status: 'final_sanction',
    stages: ['final', 'executed'],
    legalBasis: [LGRA('206'), LGRA('222')],
  },
  {
    key: 'responsible_no_sanction',
    name: 'Resolución firme: responsable sin sanción',
    explanation:
      'La resolución firme declaró la responsabilidad, pero la autoridad se abstuvo de sancionar porque no hubo dolo ni antecedentes.',
    s5Reasons: ['attended'],
    status: 'final_no_sanction',
    stages: ['final'],
    legalBasis: [LGRA('77'), LGRA('206')],
  },
  {
    key: 'not_responsible',
    name: 'Resolución firme: no responsable',
    explanation: 'La resolución firme declaró que la persona señalada no es responsable.',
    s5Reasons: ['attended'],
    status: 'final_no_sanction',
    stages: ['final'],
    legalBasis: [LGRA('206')],
  },
];

/** Motivo legal de cierre por clave, o `undefined`. */
export function findLegalClosureReason(key: string): LegalClosureReasonOption | undefined {
  return LEGAL_CLOSURE_REASONS.find((reason) => reason.key === key);
}

/** Indica si el motivo legal `reason` cabe en la etapa `stage`. */
export function isLegalClosureAllowedAt(
  reason: LegalClosureReasonOption,
  stage: AdministrativeStage | null,
): boolean {
  if (stage === null) return reason.allowsNoStage === true;
  return reason.stages === undefined || reason.stages.includes(stage);
}

/**
 * Medidas cautelares (LGRA, arts. 123 a 129): las pide la autoridad investigadora y las resuelve la
 * substanciadora o, en las etapas del Tribunal, el Tribunal. En el seguimiento solo se dice que se
 * dictaron medidas para proteger la investigación, sin detalles.
 */
export const PRECAUTIONARY_RULE = {
  requestedBy: 'investigation',
  /** Etapas en que se pueden pedir: en cualquier momento después del informe. */
  stages: [
    'report_filed',
    'report_prevented',
    'report_admitted',
    'summoned',
    'initial_hearing',
    'evidence_hearing',
    'closing_arguments',
    'instruction_closed',
    'case_file_sent',
    'court_received',
    'court_evidence_hearing',
    'court_closing_arguments',
    'court_instruction_closed',
  ],
  examples: [
    'Suspensión temporal del presunto responsable de su empleo, cargo o comisión (art. 124 fr. I)',
    'Exhibición de documentos originales',
    'Apercibimiento de multa',
    'Embargo precautorio de bienes',
  ],
  deadlines: ['precautionary_hearing', 'precautionary_decision'],
  outcomes: [
    { key: 'granted', name: 'Concedida' },
    { key: 'provisional', name: 'Concedida provisionalmente' },
    { key: 'denied', name: 'Negada' },
  ],
  legalBasis: [LGRA('123'), LGRA('124'), LGRA('125'), LGRA('126'), LGRA('127'), LGRA('129')],
} as const satisfies {
  requestedBy: ProcedureFunction;
  stages: readonly AdministrativeStage[];
  examples: readonly string[];
  deadlines: readonly DeadlineKey[];
  outcomes: readonly { key: PrecautionaryOutcome; name: string }[];
  legalBasis: readonly LegalReference[];
};

/** Fundamento de la vista al Ministerio Público, según quién la da. */
export const CRIMINAL_REFERRAL_BASES = [
  {
    key: 'internal_control',
    name: 'Órgano interno de control o Secretaría',
    legalBasis: [LGRA('10', 'III')],
    explanation:
      'Los órganos internos de control y las Secretarías presentan denuncia ante la fiscalía anticorrupción cuando ven un posible delito.',
  },
  {
    key: 'superior_audit',
    name: 'Entidad de fiscalización (ASF o del estado)',
    legalBasis: [LGRA('98')],
    explanation:
      'La Auditoría Superior de la Federación y las entidades de fiscalización de los estados denuncian ante el Ministerio Público los delitos que resulten de sus investigaciones.',
  },
  {
    key: 'public_servant',
    name: 'Cualquier persona servidora pública',
    legalBasis: [{ law: 'CNPP', article: '222' }],
    explanation:
      'Quien en ejercicio de funciones públicas conozca un probable delito debe denunciarlo de inmediato.',
  },
] as const satisfies readonly {
  key: string;
  name: string;
  legalBasis: readonly LegalReference[];
  explanation: string;
}[];

/** Clave del fundamento de la vista al Ministerio Público. */
export type CriminalReferralBasisKey = (typeof CRIMINAL_REFERRAL_BASES)[number]['key'];

// TODO(tabla-de-funciones-fondos): la tabla de funciones firmada (formato 2, con la función
// `court` y su `instance`) todavía no tiene reglas por ente con `fundingSources` (aportaciones y
// convenios federales); con ellas, la marca de recursos federales saldría también del ente y no
// solo de la denuncia. Lo agrega quien mantiene `packages/red/src/function-table.ts`.

/** Autoridad federal competente cuando hay recursos federales en un ente local. */
export interface FederalAuthorityOption {
  key: 'asf' | 'sabg' | 'fgr';
  name: string;
  role: string;
  legalBasis: readonly LegalReference[];
}

/**
 * Regla de los recursos federales en entes locales (B10). Con aportaciones (Ramo 33) o convenios
 * federales, las responsabilidades las determinan las autoridades federales y la autoridad local
 * avisa de inmediato a la ASF y a la Secretaría federal; el delito es federal porque quien lo
 * comete maneja recursos económicos federales. Es una guía en el panel: el sistema no decide la
 * competencia, solo ofrece turnar al nodo Federal y dar vista con su fundamento.
 */
export const FEDERAL_FUNDS_RULE = {
  question:
    '¿La denuncia involucra recursos federales (aportaciones del Ramo 33 o convenios con la Federación)?',
  fundings: [
    {
      key: 'aportaciones',
      name: 'Aportaciones federales (Ramo 33)',
      explanation:
        'Fondos como FAIS, FORTAMUN, FONE o FASSA: son federales y condicionados aunque los ejerza el estado o el municipio.',
    },
    {
      key: 'convenio_federal',
      name: 'Convenio o subsidio federal',
      explanation:
        'Recursos que la Federación entrega por convenio a un estado, un municipio o un particular.',
    },
  ],
  authorities: [
    {
      key: 'asf',
      name: 'Auditoría Superior de la Federación (ASF)',
      role: 'Fiscaliza los recursos federales e investiga las faltas graves, que lleva al Tribunal Federal de Justicia Administrativa.',
      legalBasis: [
        { law: 'LFRCF', article: '47' },
        { law: 'LFRCF', article: '66 Bis' },
      ],
    },
    {
      key: 'sabg',
      name: 'Secretaría Anticorrupción y Buen Gobierno (SABG)',
      role: 'Recibe el aviso inmediato de la autoridad local; las responsabilidades las determinan las autoridades federales.',
      legalBasis: [{ law: 'LCF', article: '49' }],
    },
    {
      key: 'fgr',
      name: 'Fiscalía Especializada en materia de Combate a la Corrupción de la FGR',
      role: 'Investiga el delito: es federal porque quien lo comete maneja recursos económicos federales.',
      legalBasis: [{ law: 'CPF', article: '212' }],
    },
  ],
  noticeLegalBasis: [{ law: 'LCF', article: '49' }],
  notice:
    'La autoridad local que detecte el desvío de aportaciones debe avisar «en forma inmediata» a la ASF y a la Secretaría federal.',
  transfer:
    'Si la competencia es federal, turna la denuncia al nodo Federal con «Turnar a otro nodo»; la investigación local del control durante el ejercicio puede seguir.',
  towardState:
    'En el nodo Federal, si la denuncia es sobre un ente estatal o municipal y no involucra recursos federales (o tiene faltas locales además de las federales), turna esa parte al nodo del estado con «Turnar a otro nodo».',
} as const satisfies {
  question: string;
  fundings: readonly { key: FederalFunding; name: string; explanation: string }[];
  authorities: readonly FederalAuthorityOption[];
  noticeLegalBasis: readonly LegalReference[];
  notice: string;
  transfer: string;
  towardState: string;
};

/** Clave de una autoridad federal de la regla. */
export type FederalAuthorityKey = (typeof FEDERAL_FUNDS_RULE)['authorities'][number]['key'];
