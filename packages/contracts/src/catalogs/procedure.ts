// Catálogo público del trámite: estados del flujo de gestión del S5, motivos de cierre, etapas
// legales (LGRA y proceso penal), quién actúa en cada uno y los plazos legales con su fundamento.
// Cada entrada explica en lenguaje sencillo qué significa para la persona denunciante.
import type { ComplaintStatus } from '../complaint.ts';
import type {
  AdministrativeStage,
  ClosureReason,
  CriminalStage,
  DeadlineKey,
  DeadlineUnit,
  LegalStage,
  LegalTrack,
  ManagementState,
  ProcedureActor,
} from '../procedure.ts';

/** Ordenamiento citado como fundamento. */
export type ProcedureLaw = 'LGRA' | 'CNPP' | 'BPDN';

/** Fundamento legal de un estado, una etapa o un plazo. */
export interface LegalReference {
  law: ProcedureLaw;
  article: string;
  /** Fracción en números romanos, si aplica. */
  fraction?: string;
}

/** Nombre completo de cada ordenamiento citado. */
export const PROCEDURE_LAW_NAMES: Readonly<Record<ProcedureLaw, string>> = {
  LGRA: 'Ley General de Responsabilidades Administrativas',
  CNPP: 'Código Nacional de Procedimientos Penales',
  BPDN: 'Bases para el Funcionamiento de la Plataforma Digital Nacional',
};

/** Quién actúa: nombre y explicación breve. */
export interface ProcedureActorOption {
  key: ProcedureActor;
  name: string;
  explanation: string;
}

export const PROCEDURE_ACTORS: readonly ProcedureActorOption[] = [
  {
    key: 'reporter',
    name: 'Persona denunciante',
    explanation: 'Quien presentó la denuncia. Puede dar seguimiento con su folio y su recibo.',
  },
  {
    key: 'inbox_operator',
    name: 'Operadora del buzón general',
    explanation:
      'Área que recibe todas las denuncias del sistema y decide a qué institución enviarlas. En la versión de pruebas del S5 es la Secretaría Ejecutiva del Sistema Nacional Anticorrupción.',
  },
  {
    key: 'receiving_institution',
    name: 'Institución que recibe el turno',
    explanation:
      'Institución a la que se envió la denuncia, por ejemplo el órgano interno de control de una dependencia. Decide si le corresponde atenderla.',
  },
  {
    key: 'investigating_authority',
    name: 'Autoridad investigadora',
    explanation: 'Reúne información y pruebas para saber si hubo una falta administrativa.',
  },
  {
    key: 'substantiating_authority',
    name: 'Autoridad substanciadora',
    explanation:
      'Conduce el procedimiento contra la persona señalada: la cita, recibe sus pruebas y sus argumentos. Es distinta de la que investigó.',
  },
  {
    key: 'resolving_authority',
    name: 'Autoridad resolutora',
    explanation:
      'Decide si la persona es responsable y qué sanción corresponde. En faltas no graves es la propia institución; en faltas graves, el Tribunal de Justicia Administrativa.',
  },
  {
    key: 'administrative_court',
    name: 'Tribunal de Justicia Administrativa',
    explanation:
      'Resuelve las faltas graves y las faltas de particulares, y el recurso de inconformidad en su Sala.',
  },
  {
    key: 'prosecutor',
    name: 'Fiscalía (Ministerio Público)',
    explanation: 'Investiga los hechos que pueden ser delitos por corrupción y acusa ante un juez.',
  },
  {
    key: 'criminal_court',
    name: 'Juez o tribunal penal',
    explanation: 'Conduce las audiencias del proceso penal y dicta la sentencia.',
  },
];

/** Estado del flujo de gestión del S5. */
export interface ManagementStateOption {
  key: ManagementState;
  name: string;
  /** Qué significa para la persona denunciante, en lenguaje sencillo. */
  explanation: string;
  actors: readonly ProcedureActor[];
  /**
   * Código del mismo estado en la versión de pruebas del S5 (bandeja de turnado de la SESNA), para
   * que las autoridades reconozcan el flujo y el estándar se pueda mapear sin traducir.
   */
  s5Code: string;
  /** Estados a los que se puede pasar desde este. */
  next: readonly ManagementState[];
  deadlines: readonly DeadlineKey[];
  legalBasis: readonly LegalReference[];
}

export const MANAGEMENT_STATES: readonly ManagementStateOption[] = [
  {
    key: 'received_in_inbox',
    name: 'Recibida en el buzón general',
    explanation:
      'Tu denuncia llegó al buzón general del sistema. Ahí se revisa para saber qué institución debe atenderla. Todavía nadie la investiga.',
    actors: ['inbox_operator'],
    s5Code: 'SIN_TURNAR',
    next: ['routed', 'closed'],
    deadlines: [],
    legalBasis: [
      { law: 'BPDN', article: '57' },
      { law: 'BPDN', article: '58' },
    ],
  },
  {
    key: 'routed',
    name: 'Turnada',
    explanation:
      'Turnar significa enviar tu denuncia a la institución que puede investigarla, por ejemplo el órgano interno de control de la dependencia donde ocurrieron los hechos. Esa institución todavía tiene que aceptarla: turnada no quiere decir que ya se investiga ni que se decidió algo.',
    actors: ['receiving_institution'],
    s5Code: 'TURNADA',
    next: ['accepted', 'reassigned', 'returned_to_inbox'],
    deadlines: [],
    legalBasis: [{ law: 'BPDN', article: '58' }],
  },
  {
    key: 'accepted',
    name: 'Aceptada',
    explanation:
      'La institución revisó tu denuncia y aceptó que le corresponde atenderla. Desde aquí empieza la investigación y corren los plazos legales.',
    actors: ['receiving_institution', 'investigating_authority'],
    s5Code: 'ACEPTADA',
    next: ['closed'],
    deadlines: ['serious_offense_start'],
    legalBasis: [
      { law: 'LGRA', article: '91' },
      { law: 'LGRA', article: '64', fraction: 'II' },
    ],
  },
  {
    key: 'reassigned',
    name: 'Reasignada',
    explanation:
      'La institución que la recibió consideró que no le corresponde y la envió a otra que sí podría atenderla. Tu folio y tu recibo siguen sirviendo igual.',
    actors: ['receiving_institution'],
    s5Code: 'REASIGNADA',
    next: ['accepted', 'reassigned', 'returned_to_inbox'],
    deadlines: [],
    legalBasis: [{ law: 'BPDN', article: '58' }],
  },
  {
    key: 'returned_to_inbox',
    name: 'Devuelta al buzón general',
    explanation:
      'La institución consideró que no le corresponde y la regresó al buzón general para que se envíe a otra. No se pierde: vuelve a turnarse.',
    actors: ['inbox_operator'],
    s5Code: 'DEVUELTA',
    next: ['routed', 'closed'],
    deadlines: [],
    legalBasis: [{ law: 'BPDN', article: '58' }],
  },
  {
    key: 'closed',
    name: 'Cerrada',
    explanation:
      'El trámite en el sistema terminó. El motivo de cierre explica por qué. Si se archivó por falta de elementos, puede reabrirse si aportas nuevos indicios.',
    actors: ['inbox_operator', 'receiving_institution'],
    s5Code: 'CERRADA',
    next: ['accepted'],
    deadlines: ['archive_notification'],
    legalBasis: [{ law: 'LGRA', article: '100' }],
  },
];

/** Motivo de cierre del flujo de gestión. */
export interface ClosureReasonOption {
  key: ClosureReason;
  name: string;
  explanation: string;
}

export const CLOSURE_REASONS: readonly ClosureReasonOption[] = [
  {
    key: 'attended',
    name: 'Atendido',
    explanation:
      'La institución atendió tu denuncia: investigó y tomó una decisión, por ejemplo iniciar un procedimiento o imponer una sanción.',
  },
  {
    key: 'channeled',
    name: 'Canalizado',
    explanation:
      'Los hechos los debe atender otra instancia fuera de este sistema (por ejemplo, una comisión de derechos humanos o una fiscalía). La institución debe decirte a dónde se envió.',
  },
  {
    key: 'inadmissible',
    name: 'Improcedente',
    explanation:
      'La denuncia no puede tramitarse como falta administrativa ni como hecho de corrupción; por ejemplo, porque no involucra a personas servidoras públicas ni a recursos públicos.',
  },
  {
    key: 'insufficient_information',
    name: 'Información insuficiente',
    explanation:
      'No había datos suficientes para investigar. Si tienes más información, envíala por el buzón: la denuncia puede reabrirse con nuevos indicios.',
  },
  {
    key: 'joined',
    name: 'Acumulado',
    explanation:
      'Tu denuncia trata de los mismos hechos que otra y se juntaron en un solo expediente para investigarlas juntas. No se pierde.',
  },
  {
    key: 'other',
    name: 'Otro',
    explanation:
      'Se cerró por un motivo distinto. La institución debe explicarlo en una nota pública que puedes leer con tu folio y tu recibo.',
  },
];

/** Etapa legal del trámite. */
export interface LegalStageOption {
  key: LegalStage;
  track: LegalTrack;
  name: string;
  explanation: string;
  actors: readonly ProcedureActor[];
  deadlines: readonly DeadlineKey[];
  legalBasis: readonly LegalReference[];
}

/** Etapas de las faltas administrativas, en el orden del procedimiento. */
export const ADMINISTRATIVE_STAGES: readonly (LegalStageOption & { key: AdministrativeStage })[] = [
  {
    key: 'investigation',
    track: 'administrative',
    name: 'Investigación',
    explanation:
      'La autoridad investigadora reúne información y pruebas: pide documentos, hace requerimientos y revisa los hechos. Tu identidad sigue protegida.',
    actors: ['investigating_authority'],
    deadlines: [
      'serious_offense_start',
      'information_request',
      'prescription_non_serious',
      'prescription_serious',
    ],
    legalBasis: [
      { law: 'LGRA', article: '91' },
      { law: 'LGRA', article: '96' },
    ],
  },
  {
    key: 'qualification',
    track: 'administrative',
    name: 'Calificación de la falta',
    explanation:
      'Con lo investigado, la autoridad decide si hubo una falta y si es grave o no grave. Si no encuentra elementos, archiva el expediente y debe avisarte si eres identificable. Si la califica como no grave, puedes inconformarte.',
    actors: ['investigating_authority'],
    deadlines: ['archive_notification', 'appeal_filing', 'appeal_resolution'],
    legalBasis: [
      { law: 'LGRA', article: '100' },
      { law: 'LGRA', article: '102' },
    ],
  },
  {
    key: 'report_filed',
    track: 'administrative',
    name: 'Envío del Informe de Presunta Responsabilidad Administrativa',
    explanation:
      'La autoridad investigadora escribe un informe con la falta que encontró y sus pruebas, y lo entrega a la autoridad substanciadora. Con esto empieza el procedimiento contra la persona señalada.',
    actors: ['investigating_authority', 'substantiating_authority'],
    deadlines: ['inactivity_expiry'],
    legalBasis: [{ law: 'LGRA', article: '100' }],
  },
  {
    key: 'case_file_sent',
    track: 'administrative',
    name: 'Envío del expediente',
    explanation:
      'En faltas graves y faltas de particulares, la autoridad substanciadora envía el expediente al Tribunal de Justicia Administrativa, que es quien resuelve.',
    actors: ['substantiating_authority', 'administrative_court'],
    deadlines: ['inactivity_expiry'],
    legalBasis: [{ law: 'LGRA', article: '209' }],
  },
  {
    key: 'evidence_hearing',
    track: 'administrative',
    name: 'Admisión y desahogo de pruebas',
    explanation:
      'Se reciben y se revisan las pruebas de las partes. La persona señalada tiene derecho a defenderse.',
    actors: ['substantiating_authority', 'administrative_court'],
    deadlines: ['inactivity_expiry'],
    legalBasis: [
      { law: 'LGRA', article: '208' },
      { law: 'LGRA', article: '209' },
    ],
  },
  {
    key: 'closing_arguments',
    track: 'administrative',
    name: 'Alegatos',
    explanation: 'Las partes presentan por escrito sus últimos argumentos.',
    actors: ['substantiating_authority', 'administrative_court'],
    deadlines: ['inactivity_expiry'],
    legalBasis: [
      { law: 'LGRA', article: '208' },
      { law: 'LGRA', article: '209' },
    ],
  },
  {
    key: 'instruction_closed',
    track: 'administrative',
    name: 'Cierre de la instrucción',
    explanation:
      'Ya no se reciben más pruebas ni argumentos: el asunto queda listo para que se resuelva.',
    actors: ['resolving_authority'],
    deadlines: ['inactivity_expiry'],
    legalBasis: [
      { law: 'LGRA', article: '208' },
      { law: 'LGRA', article: '209' },
    ],
  },
  {
    key: 'resolution',
    track: 'administrative',
    name: 'Resolución',
    explanation:
      'La autoridad resolutora decide si la persona es responsable y, en su caso, qué sanción le corresponde.',
    actors: ['resolving_authority'],
    deadlines: [],
    legalBasis: [
      { law: 'LGRA', article: '208' },
      { law: 'LGRA', article: '209' },
    ],
  },
];

/** Etapas del proceso penal por hechos de corrupción, en orden. */
export const CRIMINAL_STAGES: readonly (LegalStageOption & { key: CriminalStage })[] = [
  {
    key: 'criminal_investigation',
    track: 'criminal',
    name: 'Investigación',
    explanation:
      'La fiscalía investiga si los hechos son un delito y quién podría haberlo cometido.',
    actors: ['prosecutor'],
    deadlines: [],
    legalBasis: [{ law: 'CNPP', article: '211' }],
  },
  {
    key: 'intermediate_stage',
    track: 'criminal',
    name: 'Etapa intermedia',
    explanation:
      'Ante un juez de control, la fiscalía presenta su acusación y se decide qué pruebas irán a juicio.',
    actors: ['prosecutor', 'criminal_court'],
    deadlines: [],
    legalBasis: [{ law: 'CNPP', article: '211' }],
  },
  {
    key: 'trial',
    track: 'criminal',
    name: 'Juicio',
    explanation: 'Un tribunal escucha a las partes y revisa las pruebas en audiencia.',
    actors: ['criminal_court'],
    deadlines: [],
    legalBasis: [{ law: 'CNPP', article: '211' }],
  },
  {
    key: 'sentence',
    track: 'criminal',
    name: 'Sentencia',
    explanation:
      'El tribunal decide si la persona acusada es culpable o inocente y, en su caso, la pena.',
    actors: ['criminal_court'],
    deadlines: [],
    legalBasis: [{ law: 'CNPP', article: '211' }],
  },
];

/** Todas las etapas legales: primero las administrativas y después las penales. */
export const LEGAL_STAGES: readonly LegalStageOption[] = [
  ...ADMINISTRATIVE_STAGES,
  ...CRIMINAL_STAGES,
];

/**
 * Plazo legal. `amount` es el plazo (o el mínimo, si hay `maxAmount`); la autoridad fija el plazo
 * concreto dentro del rango. `warning` es la anticipación con la que el plazo pasa a «por vencer».
 */
export interface DeadlineRule {
  key: DeadlineKey;
  name: string;
  explanation: string;
  unit: DeadlineUnit;
  amount: number;
  maxAmount?: number;
  /** Desde cuándo corre, en lenguaje sencillo. */
  startsFrom: string;
  /** Qué pasa si vence. */
  consequence: string;
  warning: { unit: 'natural_days' | 'business_days'; amount: number };
  legalBasis: readonly LegalReference[];
}

export const DEADLINE_RULES: readonly DeadlineRule[] = [
  {
    key: 'serious_offense_start',
    name: 'Iniciar ante una posible falta grave',
    explanation:
      'Cuando la autoridad conoce una conducta que podría ser falta grave, falta de particulares o acto de corrupción, tiene 30 días naturales para iniciar el procedimiento.',
    unit: 'natural_days',
    amount: 30,
    startsFrom: 'Desde que la autoridad tiene conocimiento de la conducta.',
    consequence: 'No iniciar a tiempo es obstrucción de la justicia, que es una falta grave.',
    warning: { unit: 'natural_days', amount: 5 },
    legalBasis: [{ law: 'LGRA', article: '64', fraction: 'II' }],
  },
  {
    key: 'archive_notification',
    name: 'Notificar el archivo',
    explanation:
      'Si la autoridad archiva la investigación por falta de elementos, debe notificarlo a las personas denunciantes identificables.',
    unit: 'business_days',
    amount: 10,
    startsFrom: 'Desde que se emite el acuerdo de conclusión y archivo.',
    consequence:
      'Sin la notificación, la persona denunciante no sabe que puede aportar nuevos indicios para reabrir el caso.',
    warning: { unit: 'business_days', amount: 3 },
    legalBasis: [{ law: 'LGRA', article: '100' }],
  },
  {
    key: 'information_request',
    name: 'Atender un requerimiento',
    explanation:
      'Quien recibe un requerimiento de la autoridad investigadora debe responder en el plazo que ésta fije, de 5 a 15 días hábiles; puede ampliarse por causa justificada.',
    unit: 'business_days',
    amount: 5,
    maxAmount: 15,
    startsFrom: 'Desde que se notifica el requerimiento.',
    consequence: 'No atenderlo puede dar lugar a medidas de apremio.',
    warning: { unit: 'business_days', amount: 2 },
    legalBasis: [{ law: 'LGRA', article: '96' }],
  },
  {
    key: 'appeal_filing',
    name: 'Presentar la inconformidad',
    explanation:
      'Si la falta se calificó como no grave, la persona denunciante puede inconformarse. La inconformidad exige nombre, domicilio y firma autógrafa.',
    unit: 'business_days',
    amount: 5,
    startsFrom: 'Desde que se notifica la calificación.',
    consequence: 'Pasado el plazo ya no se puede impugnar la calificación.',
    warning: { unit: 'business_days', amount: 2 },
    legalBasis: [{ law: 'LGRA', article: '103' }],
  },
  {
    key: 'appeal_resolution',
    name: 'Resolver la inconformidad',
    explanation: 'La Sala del Tribunal tiene 30 días hábiles para resolver la inconformidad.',
    unit: 'business_days',
    amount: 30,
    startsFrom: 'Desde que la Sala recibe el recurso.',
    consequence: 'El retraso se puede señalar ante los órganos de control del Tribunal.',
    warning: { unit: 'business_days', amount: 5 },
    legalBasis: [{ law: 'LGRA', article: '107' }],
  },
  {
    key: 'prescription_non_serious',
    name: 'Prescripción de faltas no graves',
    explanation:
      'La facultad para sancionar una falta no grave prescribe en 3 años. La calificación de la falta interrumpe la prescripción.',
    unit: 'years',
    amount: 3,
    startsFrom: 'Día de la falta o de su cese; el plazo cuenta desde el siguiente.',
    consequence: 'Si prescribe, la falta ya no se puede sancionar.',
    warning: { unit: 'natural_days', amount: 180 },
    legalBasis: [{ law: 'LGRA', article: '74' }],
  },
  {
    key: 'prescription_serious',
    name: 'Prescripción de faltas graves',
    explanation:
      'La facultad para sancionar una falta grave o una falta de particulares prescribe en 7 años. La calificación de la falta interrumpe la prescripción.',
    unit: 'years',
    amount: 7,
    startsFrom: 'Día de la falta o de su cese; el plazo cuenta desde el siguiente.',
    consequence: 'Si prescribe, la falta ya no se puede sancionar.',
    warning: { unit: 'natural_days', amount: 365 },
    legalBasis: [{ law: 'LGRA', article: '74' }],
  },
  {
    key: 'inactivity_expiry',
    name: 'Caducidad por inactividad',
    explanation:
      'Admitido el Informe de Presunta Responsabilidad Administrativa, el procedimiento no puede detenerse más de 6 meses sin causa justificada; si ocurre, se decreta la caducidad de la instancia a solicitud del presunto infractor. No aplica durante la investigación.',
    unit: 'months',
    amount: 6,
    startsFrom: 'Desde la última actuación en el procedimiento de responsabilidad.',
    consequence:
      'Decretada la caducidad, termina la instancia y la prescripción se reanuda desde la admisión del informe.',
    warning: { unit: 'natural_days', amount: 30 },
    legalBasis: [{ law: 'LGRA', article: '74' }],
  },
];

/**
 * Estatus de la API v1 (`ComplaintStatusSchema`) y su lugar en las dos capas del trámite. Los textos
 * son los que ve la persona denunciante en el seguimiento.
 */
export interface ComplaintStatusOption {
  key: ComplaintStatus;
  name: string;
  explanation: string;
  managementState: ManagementState;
  legalStage?: LegalStage;
}

export const COMPLAINT_STATUSES: readonly ComplaintStatusOption[] = [
  {
    key: 'received',
    name: 'Recibida',
    explanation: 'Tu denuncia llegó y está en espera de revisión.',
    managementState: 'received_in_inbox',
  },
  {
    key: 'routing',
    name: 'Buscando a la autoridad que debe atenderla',
    explanation: 'Estamos buscando qué autoridad debe atender tu denuncia.',
    managementState: 'received_in_inbox',
  },
  {
    key: 'routed',
    name: 'Turnada a la autoridad competente',
    explanation: 'La autoridad competente ya la tiene.',
    managementState: 'routed',
  },
  {
    key: 'investigating',
    name: 'En investigación',
    explanation: 'La autoridad está investigando los hechos.',
    managementState: 'accepted',
    legalStage: 'investigation',
  },
  {
    key: 'classified',
    name: 'Revisada: la autoridad decidió si la falta es grave',
    explanation: 'La autoridad ya decidió si la falta es grave o no.',
    managementState: 'accepted',
    legalStage: 'qualification',
  },
  {
    key: 'archived',
    name: 'Archivada',
    explanation: 'Se cerró por ahora; puede reabrirse si hay nuevos elementos.',
    managementState: 'closed',
  },
  {
    key: 'resolved',
    name: 'Concluida',
    explanation: 'La autoridad terminó el trámite.',
    managementState: 'closed',
  },
];

function indexBy<K extends string, T extends { key: K }>(items: readonly T[]): ReadonlyMap<K, T> {
  return new Map(items.map((item) => [item.key, item]));
}

const ACTOR_BY_KEY = indexBy(PROCEDURE_ACTORS);
const MANAGEMENT_STATE_BY_KEY = indexBy(MANAGEMENT_STATES);
const CLOSURE_REASON_BY_KEY = indexBy(CLOSURE_REASONS);
const LEGAL_STAGE_BY_KEY = indexBy(LEGAL_STAGES);
const DEADLINE_RULE_BY_KEY = indexBy(DEADLINE_RULES);
const COMPLAINT_STATUS_BY_KEY = indexBy(COMPLAINT_STATUSES);

/** Actor por clave, o `undefined` si no existe. */
export function findProcedureActor(key: string): ProcedureActorOption | undefined {
  return ACTOR_BY_KEY.get(key as ProcedureActor);
}

/** Estado del flujo de gestión por clave, o `undefined` si no existe. */
export function findManagementState(key: string): ManagementStateOption | undefined {
  return MANAGEMENT_STATE_BY_KEY.get(key as ManagementState);
}

/** Motivo de cierre por clave, o `undefined` si no existe. */
export function findClosureReason(key: string): ClosureReasonOption | undefined {
  return CLOSURE_REASON_BY_KEY.get(key as ClosureReason);
}

/** Etapa legal por clave, o `undefined` si no existe. */
export function findLegalStage(key: string): LegalStageOption | undefined {
  return LEGAL_STAGE_BY_KEY.get(key as LegalStage);
}

/** Regla de plazo por clave, o `undefined` si no existe. */
export function findDeadlineRule(key: string): DeadlineRule | undefined {
  return DEADLINE_RULE_BY_KEY.get(key as DeadlineKey);
}

/** Estatus de la API v1 con su nombre, explicación y lugar en el trámite. */
export function findComplaintStatus(key: string): ComplaintStatusOption | undefined {
  return COMPLAINT_STATUS_BY_KEY.get(key as ComplaintStatus);
}

/** Indica si el flujo de gestión admite pasar de `from` a `to`. */
export function isManagementTransition(from: string, to: string): boolean {
  return findManagementState(from)?.next.includes(to as ManagementState) ?? false;
}

/** Cita con el nombre completo: «Ley General de Responsabilidades Administrativas, art. 64, fracc. II». */
export function describeLegalReference(reference: LegalReference): string {
  const fraction = reference.fraction === undefined ? '' : `, fracc. ${reference.fraction}`;
  return `${PROCEDURE_LAW_NAMES[reference.law]}, art. ${reference.article}${fraction}`;
}

/** Texto de cita: «LGRA, art. 64, fracc. II». */
export function formatLegalReference(reference: LegalReference): string {
  const fraction = reference.fraction === undefined ? '' : `, fracc. ${reference.fraction}`;
  return `${reference.law}, art. ${reference.article}${fraction}`;
}
