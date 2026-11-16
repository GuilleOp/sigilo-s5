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
  TurnSemaphoreStatus,
  TurnWait,
} from '../procedure.ts';

/** Ordenamiento citado como fundamento. */
export type ProcedureLaw = 'LGRA' | 'CNPP' | 'BPDN' | 'LCF' | 'LFRCF' | 'CPF' | 'CPEUM';

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
  LCF: 'Ley de Coordinación Fiscal',
  LFRCF: 'Ley de Fiscalización y Rendición de Cuentas de la Federación',
  CPF: 'Código Penal Federal',
  CPEUM: 'Constitución Política de los Estados Unidos Mexicanos',
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
      'Área que recibe las denuncias que la tabla de funciones no asigna y decide a qué institución enviarlas. En la versión de pruebas del S5 es la Secretaría Ejecutiva del Sistema Nacional Anticorrupción. En una red con un nodo por estado, es la autoridad receptora que designe cada estado, no quien opera el nodo: que una Secretaría Ejecutiva estatal turne depende de la ley de cada estado.',
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
      'Resuelve las faltas graves y las faltas de particulares, el recurso de inconformidad en su Sala, la apelación y la revisión. Cada estado dice qué cuentas tiene; si no tiene, la autoridad substanciadora registra lo que el Tribunal resolvió, con el número de expediente.',
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

/**
 * Meta de turnado del S5, no un plazo legal (la LGRA y las Bases de la PDN no fijan plazo para
 * turnar; el plazo legal es el de 30 días naturales del art. 64 fr. II de la LGRA para iniciar si
 * puede ser falta grave).
 * Semáforo de turnado de la bandeja del S5: una denuncia sin turnar (en el buzón general) o
 * turnada sin aceptar pasa a «por vencer» al cumplir `warningAfter` días y a «vencida» al cumplir
 * `overdueAfter`, contados desde el día en que entró a ese estado.
 * Decisión: días hábiles, como los demás plazos cortos del trámite (aviso del archivo, solicitud de
 * información, inconformidad). Así una denuncia que llega el viernes no aparece vencida el lunes
 * por la mañana; el S5 de pruebas cuenta días naturales y la diferencia solo aparece en fines de
 * semana y días inhábiles del calendario oficial.
 */
export const TURN_SEMAPHORE = {
  unit: 'business_days',
  warningAfter: 1,
  overdueAfter: 2,
  states: {
    received_in_inbox: 'routing',
    returned_to_inbox: 'routing',
    routed: 'acceptance',
    reassigned: 'acceptance',
  },
} as const satisfies {
  unit: Extract<DeadlineUnit, 'natural_days' | 'business_days'>;
  warningAfter: number;
  overdueAfter: number;
  states: Partial<Record<ManagementState, TurnWait>>;
};

/** Qué espera una denuncia en el estado `state` según el semáforo, o `null` si no aplica. */
export function turnWaitFor(state: ManagementState): TurnWait | null {
  const states: Partial<Record<ManagementState, TurnWait>> = TURN_SEMAPHORE.states;
  return states[state] ?? null;
}

/** Situación del semáforo con su nombre y su símbolo (no solo el color). */
export interface TurnSemaphoreStatusOption {
  key: TurnSemaphoreStatus;
  name: string;
  /** Símbolo que acompaña al nombre, para no depender del color. */
  symbol: string;
  explanation: string;
}

export const TURN_SEMAPHORE_STATUSES: readonly TurnSemaphoreStatusOption[] = [
  {
    key: 'a_tiempo',
    name: 'A tiempo',
    symbol: '●',
    explanation: 'Todavía no cumple un día hábil esperando.',
  },
  {
    key: 'por_vencer',
    name: 'Por vencer',
    symbol: '▲',
    explanation: 'Cumplió un día hábil esperando: atiéndela hoy.',
  },
  {
    key: 'vencida',
    name: 'Vencida',
    symbol: '■',
    explanation:
      'Cumplió dos días hábiles o más esperando; la supervisión recibe un aviso. Es la meta del S5, no un plazo legal.',
  },
];

/**
 * Reasignaciones que admite una denuncia, como en el S5. La cuarta se rechaza: la autoridad la
 * devuelve al buzón general para que se turne de nuevo, o la supervisión la revisa.
 */
export const MAX_REASSIGNMENTS = 3;

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
  /** Plazos relacionados con la etapa (informativo). */
  deadlines: readonly DeadlineKey[];
  /**
   * Plazos que empiezan a correr el día en que la denuncia entra a la etapa y dejan de correr
   * cuando sale de ella.
   */
  startsOnEntry?: readonly DeadlineKey[];
  legalBasis: readonly LegalReference[];
}

/**
 * Etapas de las faltas administrativas, en orden de lectura. Después de la audiencia inicial hay dos
 * ramas (LGRA, arts. 208 y 209): la no grave sigue con la substanciadora y resolutora
 * (`evidence_hearing` a `resolution`) y la grave o de particulares va al Tribunal
 * (`case_file_sent` a `court_resolution`). Las transiciones válidas están en
 * `ADMINISTRATIVE_TRANSITIONS`.
 */
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
    name: 'Informe de Presunta Responsabilidad Administrativa presentado',
    explanation:
      'La autoridad investigadora escribió un informe con la falta que encontró y sus pruebas, y lo entregó a la autoridad substanciadora, que es otra área. Esa autoridad tiene 3 días para revisarlo: puede pedir que se corrija, abstenerse o admitirlo.',
    actors: ['investigating_authority', 'substantiating_authority'],
    deadlines: ['report_admission'],
    startsOnEntry: ['report_admission'],
    legalBasis: [
      { law: 'LGRA', article: '100' },
      { law: 'LGRA', article: '194' },
    ],
  },
  {
    key: 'report_prevented',
    track: 'administrative',
    name: 'Informe con observaciones (prevención)',
    explanation:
      'La autoridad substanciadora encontró defectos en el informe y pidió a la investigadora corregirlos en 3 días. Si no los corrige, el informe se tiene por no presentado y vuelve a la investigación; puede presentarse de nuevo mientras la falta no prescriba.',
    actors: ['substantiating_authority', 'investigating_authority'],
    deadlines: ['report_correction'],
    startsOnEntry: ['report_correction'],
    legalBasis: [{ law: 'LGRA', article: '195' }],
  },
  {
    key: 'abstention',
    track: 'administrative',
    name: 'Abstención',
    explanation:
      'La autoridad decidió no iniciar el procedimiento (o no sancionar) porque no hubo daño a la hacienda pública y el caso era de criterio opinable o se corrigió de forma espontánea. Si eres identificable y no estás de acuerdo, puedes inconformarte; si nadie se inconforma, el expediente se cierra.',
    actors: ['substantiating_authority', 'resolving_authority'],
    deadlines: ['appeal_filing', 'appeal_resolution'],
    legalBasis: [
      { law: 'LGRA', article: '101' },
      { law: 'LGRA', article: '102' },
    ],
  },
  {
    key: 'report_admitted',
    track: 'administrative',
    name: 'Procedimiento iniciado (informe admitido)',
    explanation:
      'La autoridad substanciadora admitió el informe: con esto empieza el procedimiento de responsabilidad contra la persona señalada. Desde aquí el procedimiento no puede quedarse parado más de 6 meses.',
    actors: ['substantiating_authority'],
    deadlines: ['inactivity_expiry'],
    legalBasis: [
      { law: 'LGRA', article: '112' },
      { law: 'LGRA', article: '113' },
      { law: 'LGRA', article: '208', fraction: 'I' },
    ],
  },
  {
    key: 'summoned',
    track: 'administrative',
    name: 'Emplazamiento',
    explanation:
      'Se citó en persona a la persona señalada, con copia del informe, para que se defienda en la audiencia inicial, que debe celebrarse entre 10 y 15 días hábiles después. Si te identificaste, te citan como tercera 72 horas antes.',
    actors: ['substantiating_authority'],
    deadlines: ['initial_hearing_window', 'parties_summons', 'inactivity_expiry'],
    startsOnEntry: ['initial_hearing_window'],
    legalBasis: [
      { law: 'LGRA', article: '193' },
      { law: 'LGRA', article: '208', fraction: 'II' },
    ],
  },
  {
    key: 'initial_hearing',
    track: 'administrative',
    name: 'Audiencia inicial',
    explanation:
      'Se celebró la audiencia inicial: la persona señalada declaró y ofreció sus pruebas, y las demás partes (también tú, si te identificaste como tercera) pudieron hablar y ofrecer las suyas. Después ya no se reciben más pruebas, salvo las supervenientes. Si la falta es no grave, sigue con la misma autoridad; si es grave, el expediente va al Tribunal.',
    actors: ['substantiating_authority'],
    deadlines: ['evidence_admission', 'court_referral', 'inactivity_expiry'],
    legalBasis: [
      { law: 'LGRA', article: '208', fraction: 'III a VII' },
      { law: 'LGRA', article: '116', fraction: 'IV' },
    ],
  },
  {
    key: 'evidence_hearing',
    track: 'administrative',
    name: 'Admisión y desahogo de pruebas',
    explanation:
      'Se admiten y se revisan las pruebas de las partes. La persona señalada tiene derecho a defenderse. En faltas no graves lo hace la autoridad substanciadora y resolutora.',
    actors: ['substantiating_authority'],
    deadlines: ['evidence_admission', 'inactivity_expiry'],
    legalBasis: [{ law: 'LGRA', article: '208', fraction: 'VIII' }],
  },
  {
    key: 'closing_arguments',
    track: 'administrative',
    name: 'Alegatos',
    explanation: 'Las partes presentan por escrito sus últimos argumentos, en 5 días hábiles.',
    actors: ['substantiating_authority'],
    deadlines: ['closing_arguments', 'inactivity_expiry'],
    startsOnEntry: ['closing_arguments'],
    legalBasis: [{ law: 'LGRA', article: '208', fraction: 'IX' }],
  },
  {
    key: 'instruction_closed',
    track: 'administrative',
    name: 'Cierre de la instrucción',
    explanation:
      'Ya no se reciben más pruebas ni argumentos: la autoridad resolutora tiene 30 días hábiles para resolver (puede ampliarlos una vez por otros 30).',
    actors: ['resolving_authority'],
    deadlines: ['resolution_term', 'inactivity_expiry'],
    startsOnEntry: ['resolution_term'],
    legalBasis: [{ law: 'LGRA', article: '208', fraction: 'X' }],
  },
  {
    key: 'resolution',
    track: 'administrative',
    name: 'Resolución (falta no grave)',
    explanation:
      'El órgano interno de control o la contraloría decidió si la persona es responsable de la falta no grave y, en su caso, qué sanción le corresponde. Se te notifica para tu conocimiento. La persona sancionada puede pedir la revocación en 15 días hábiles.',
    actors: ['resolving_authority'],
    deadlines: ['resolution_notice', 'revocation_filing'],
    startsOnEntry: ['resolution_notice', 'revocation_filing'],
    legalBasis: [
      { law: 'LGRA', article: '208', fraction: 'X y XI' },
      { law: 'LGRA', article: '75' },
      { law: 'LGRA', article: '77' },
    ],
  },
  {
    key: 'case_file_sent',
    track: 'administrative',
    name: 'Envío del expediente al Tribunal',
    explanation:
      'Como la falta es grave o de particulares, la autoridad substanciadora envió el expediente original al Tribunal de Justicia Administrativa, que es el único que puede sancionarla.',
    actors: ['substantiating_authority', 'administrative_court'],
    deadlines: ['court_referral', 'inactivity_expiry'],
    legalBasis: [
      { law: 'LGRA', article: '12' },
      { law: 'LGRA', article: '209', fraction: 'I' },
    ],
  },
  {
    key: 'court_received',
    track: 'administrative',
    name: 'Recibido en el Tribunal',
    explanation:
      'El Tribunal recibió el expediente y revisa que la falta sí sea grave. Si no lo es, lo devuelve a la autoridad substanciadora; si es otra falta grave, ordena reclasificarla en 3 días hábiles. Después admite las pruebas en 15 días hábiles.',
    actors: ['administrative_court'],
    deadlines: ['evidence_admission', 'reclassification', 'inactivity_expiry'],
    startsOnEntry: ['evidence_admission'],
    legalBasis: [{ law: 'LGRA', article: '209', fraction: 'II' }],
  },
  {
    key: 'court_evidence_hearing',
    track: 'administrative',
    name: 'Pruebas en el Tribunal',
    explanation: 'El Tribunal admite y desahoga las pruebas de las partes.',
    actors: ['administrative_court'],
    deadlines: ['inactivity_expiry'],
    legalBasis: [{ law: 'LGRA', article: '209', fraction: 'II' }],
  },
  {
    key: 'court_closing_arguments',
    track: 'administrative',
    name: 'Alegatos en el Tribunal',
    explanation: 'Las partes presentan sus últimos argumentos ante el Tribunal, en 5 días hábiles.',
    actors: ['administrative_court'],
    deadlines: ['closing_arguments', 'inactivity_expiry'],
    startsOnEntry: ['closing_arguments'],
    legalBasis: [{ law: 'LGRA', article: '209', fraction: 'III' }],
  },
  {
    key: 'court_instruction_closed',
    track: 'administrative',
    name: 'Cierre de la instrucción en el Tribunal',
    explanation:
      'El Tribunal cerró la instrucción y tiene 30 días hábiles para dictar sentencia (puede ampliarlos una vez por otros 30).',
    actors: ['administrative_court'],
    deadlines: ['resolution_term', 'inactivity_expiry'],
    startsOnEntry: ['resolution_term'],
    legalBasis: [{ law: 'LGRA', article: '209', fraction: 'IV' }],
  },
  {
    key: 'court_resolution',
    track: 'administrative',
    name: 'Sentencia del Tribunal',
    explanation:
      'El Tribunal decidió si la persona es responsable de la falta grave o de particulares y, en su caso, la sanción. Se te notifica para tu conocimiento. Las partes pueden apelar en 15 días hábiles (tú también, como tercera, si te identificaste) y las autoridades pueden pedir la revisión en 10 días hábiles.',
    actors: ['administrative_court'],
    deadlines: ['resolution_notice', 'court_appeal_filing', 'review_filing'],
    startsOnEntry: ['resolution_notice', 'court_appeal_filing', 'review_filing'],
    legalBasis: [
      { law: 'LGRA', article: '207' },
      { law: 'LGRA', article: '209', fraction: 'IV y V' },
    ],
  },
  {
    key: 'final',
    track: 'administrative',
    name: 'Resolución firme',
    explanation:
      'La resolución quedó firme: no se recurrió a tiempo o ya se resolvieron los recursos. Desde aquí se ejecuta la sanción, si la hay.',
    actors: ['resolving_authority', 'administrative_court'],
    deadlines: ['execution_report'],
    legalBasis: [{ law: 'LGRA', article: '206' }],
  },
  {
    key: 'executed',
    track: 'administrative',
    name: 'Sanción ejecutada',
    explanation:
      'La sanción se ejecutó (por ejemplo, la destitución, la inhabilitación o el cobro de la sanción económica) y debe inscribirse en el sistema de servidores públicos y particulares sancionados de la Plataforma Digital Nacional.',
    actors: ['resolving_authority'],
    deadlines: [],
    legalBasis: [
      { law: 'LGRA', article: '222' },
      { law: 'LGRA', article: '225' },
      { law: 'LGRA', article: '27' },
    ],
  },
];

/**
 * Etapas del proceso penal por hechos de corrupción. Corren en paralelo a las administrativas
 * (`criminalStage`); las transiciones están en `CRIMINAL_TRANSITIONS`.
 */
export const CRIMINAL_STAGES: readonly (LegalStageOption & { key: CriminalStage })[] = [
  {
    key: 'criminal_complaint_filed',
    track: 'criminal',
    name: 'Denuncia penal presentada (vista al Ministerio Público)',
    explanation:
      'La autoridad que investiga vio hechos que pueden ser delito y dio vista al Ministerio Público, como manda la ley. La vía penal corre aparte y al mismo tiempo que la administrativa: una no detiene a la otra.',
    actors: ['investigating_authority', 'prosecutor'],
    deadlines: [],
    legalBasis: [
      { law: 'LGRA', article: '10', fraction: 'III' },
      { law: 'CNPP', article: '222' },
    ],
  },
  {
    key: 'criminal_investigation',
    track: 'criminal',
    name: 'Investigación penal',
    explanation:
      'La fiscalía investiga si los hechos son un delito y quién podría haberlo cometido.',
    actors: ['prosecutor'],
    deadlines: [],
    legalBasis: [{ law: 'CNPP', article: '211' }],
  },
  {
    key: 'prosecutor_determination',
    track: 'criminal',
    name: 'Determinación del Ministerio Público',
    explanation:
      'La fiscalía decidió no seguir por ahora: se abstuvo de investigar, archivó temporalmente, aplicó un criterio de oportunidad o decidió no ejercer la acción penal. Si eres víctima u ofendida, puedes impugnarlo ante un juez en 10 días.',
    actors: ['prosecutor'],
    deadlines: ['prosecutor_determination_challenge'],
    startsOnEntry: ['prosecutor_determination_challenge'],
    legalBasis: [
      { law: 'CNPP', article: '253' },
      { law: 'CNPP', article: '254' },
      { law: 'CNPP', article: '255' },
      { law: 'CNPP', article: '256' },
    ],
  },
  {
    key: 'judicial_review',
    track: 'criminal',
    name: 'Control judicial de la determinación',
    explanation:
      'Un juez revisa la decisión de la fiscalía porque se impugnó. Puede confirmarla o pedir que siga la investigación.',
    actors: ['criminal_court'],
    deadlines: [],
    legalBasis: [{ law: 'CNPP', article: '258' }],
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
    key: 'alternative_exit',
    track: 'criminal',
    name: 'Solución alterna',
    explanation:
      'El proceso terminó o se suspendió con un acuerdo reparatorio o una suspensión condicional, sin juicio.',
    actors: ['prosecutor', 'criminal_court'],
    deadlines: [],
    legalBasis: [{ law: 'CNPP', article: '183 a 200' }],
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
  /** Mínimo: el acto no procede antes de que pasen estos días (audiencia inicial, 10 hábiles). */
  minAmount?: number;
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
      'Cuando la autoridad conoce una conducta que podría ser falta grave, falta de particulares o acto de corrupción, tiene 30 días naturales para iniciar el procedimiento correspondiente. SIGILO lo da por cumplido con el acuerdo de inicio que registra la autoridad: es una lectura prudente, porque la ley no precisa qué acto cuenta como «iniciar».',
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
    name: 'Presentar la inconformidad con firma',
    explanation:
      'Si la falta se calificó como no grave o la autoridad se abstuvo, la persona denunciante puede inconformarse. El escrito se entrega ante la autoridad investigadora con nombre, domicilio y firma autógrafa: sin firma no se tiene por presentado. Un aviso en línea no basta.',
    unit: 'business_days',
    amount: 5,
    startsFrom: 'Desde que se notifica la calificación o la abstención.',
    consequence:
      'Pasado el plazo sin el escrito firmado, ya no se puede impugnar la calificación ni la abstención.',
    warning: { unit: 'business_days', amount: 2 },
    legalBasis: [
      { law: 'LGRA', article: '103' },
      { law: 'LGRA', article: '104' },
      { law: 'LGRA', article: '109' },
    ],
  },
  {
    key: 'appeal_resolution',
    name: 'Resolver la inconformidad',
    explanation: 'La Sala del Tribunal tiene 30 días hábiles para resolver la inconformidad.',
    unit: 'business_days',
    amount: 30,
    startsFrom:
      'Desde que la autoridad registra que recibió el escrito firmado (la investigadora lo envía a la Sala).',
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
  {
    key: 'report_correction',
    name: 'Corregir el informe (prevención)',
    explanation:
      'Si el Informe de Presunta Responsabilidad Administrativa tiene defectos, la autoridad investigadora tiene 3 días para corregirlos.',
    unit: 'business_days',
    amount: 3,
    startsFrom: 'Desde que la autoridad substanciadora previene a la investigadora.',
    consequence:
      'Si no se corrige, el informe se tiene por no presentado; puede presentarse de nuevo mientras la falta no prescriba.',
    warning: { unit: 'business_days', amount: 1 },
    legalBasis: [{ law: 'LGRA', article: '195' }],
  },
  {
    key: 'report_admission',
    name: 'Pronunciarse sobre la admisión del informe',
    explanation:
      'La autoridad substanciadora tiene 3 días para admitir el informe, prevenir que se corrija o abstenerse.',
    unit: 'business_days',
    amount: 3,
    startsFrom: 'Desde que recibe el Informe de Presunta Responsabilidad Administrativa.',
    consequence: 'El retraso se puede señalar ante la autoridad supervisora.',
    warning: { unit: 'business_days', amount: 1 },
    legalBasis: [{ law: 'LGRA', article: '208', fraction: 'I' }],
  },
  {
    key: 'initial_hearing_window',
    name: 'Celebrar la audiencia inicial',
    explanation:
      'La audiencia inicial se celebra entre 10 y 15 días hábiles después del emplazamiento. Este es el último día.',
    unit: 'business_days',
    amount: 15,
    minAmount: 10,
    startsFrom: 'Desde el emplazamiento de la persona señalada.',
    consequence: 'La audiencia fuera de plazo puede impugnarse.',
    warning: { unit: 'business_days', amount: 5 },
    legalBasis: [{ law: 'LGRA', article: '208', fraction: 'III' }],
  },
  {
    key: 'parties_summons',
    name: 'Citar a las demás partes',
    explanation:
      'Las demás partes (también la persona denunciante identificada, como tercera) se citan al menos 72 horas antes de la audiencia inicial.',
    unit: 'hours',
    amount: 72,
    startsFrom: 'Día de la audiencia inicial: el plazo se cuenta hacia atrás.',
    consequence: 'Sin la cita a tiempo, la parte puede pedir que se repita la diligencia.',
    warning: { unit: 'natural_days', amount: 1 },
    legalBasis: [{ law: 'LGRA', article: '208', fraction: 'IV' }],
  },
  {
    key: 'evidence_admission',
    name: 'Admitir las pruebas',
    explanation:
      'Después de la audiencia inicial (en no graves) o de recibir el expediente (en el Tribunal), la autoridad tiene 15 días hábiles para admitir las pruebas.',
    unit: 'business_days',
    amount: 15,
    startsFrom:
      'Desde el cierre de la audiencia inicial o desde que el Tribunal recibe el expediente.',
    consequence: 'El retraso cuenta para la caducidad de la instancia.',
    warning: { unit: 'business_days', amount: 3 },
    legalBasis: [
      { law: 'LGRA', article: '208', fraction: 'VIII' },
      { law: 'LGRA', article: '209', fraction: 'II' },
    ],
  },
  {
    key: 'closing_arguments',
    name: 'Presentar alegatos',
    explanation: 'Las partes tienen 5 días hábiles comunes para presentar sus alegatos.',
    unit: 'business_days',
    amount: 5,
    startsFrom: 'Desde que se abre el periodo de alegatos.',
    consequence: 'Pasado el plazo, la instrucción se cierra sin esos alegatos.',
    warning: { unit: 'business_days', amount: 2 },
    legalBasis: [
      { law: 'LGRA', article: '208', fraction: 'IX' },
      { law: 'LGRA', article: '209', fraction: 'III' },
    ],
  },
  {
    key: 'resolution_term',
    name: 'Resolver',
    explanation:
      'Cerrada la instrucción, la autoridad resolutora o el Tribunal tiene 30 días hábiles para resolver; puede ampliarlos una sola vez por otros 30, con causa justificada.',
    unit: 'business_days',
    amount: 30,
    maxAmount: 60,
    startsFrom: 'Desde el cierre de la instrucción.',
    consequence:
      'El retraso se puede señalar ante la autoridad supervisora o los órganos de control.',
    warning: { unit: 'business_days', amount: 5 },
    legalBasis: [
      { law: 'LGRA', article: '208', fraction: 'X' },
      { law: 'LGRA', article: '209', fraction: 'IV' },
    ],
  },
  {
    key: 'resolution_notice',
    name: 'Notificar la resolución',
    explanation:
      'La resolución se notifica en 10 días hábiles: en persona a la persona señalada y, para su conocimiento, a la persona denunciante.',
    unit: 'business_days',
    amount: 10,
    startsFrom: 'Desde que se dicta la resolución.',
    consequence: 'Los plazos de los recursos corren desde la notificación.',
    warning: { unit: 'business_days', amount: 3 },
    legalBasis: [
      { law: 'LGRA', article: '208', fraction: 'XI' },
      { law: 'LGRA', article: '209', fraction: 'V' },
    ],
  },
  {
    key: 'court_referral',
    name: 'Enviar el expediente al Tribunal',
    explanation:
      'En faltas graves y de particulares, la autoridad substanciadora envía los autos originales al Tribunal en 3 días hábiles después de la audiencia inicial.',
    unit: 'business_days',
    amount: 3,
    startsFrom: 'Desde el cierre de la audiencia inicial.',
    consequence: 'El retraso se puede señalar ante la autoridad supervisora.',
    warning: { unit: 'business_days', amount: 1 },
    legalBasis: [{ law: 'LGRA', article: '209', fraction: 'I' }],
  },
  {
    key: 'reclassification',
    name: 'Reclasificar la falta',
    explanation:
      'Si el Tribunal ordena reclasificar la conducta a otra falta grave, la autoridad investigadora tiene 3 días hábiles para hacerlo.',
    unit: 'business_days',
    amount: 3,
    startsFrom: 'Desde que el Tribunal lo ordena.',
    consequence: 'El retraso se puede señalar ante el Tribunal y la autoridad supervisora.',
    warning: { unit: 'business_days', amount: 1 },
    legalBasis: [{ law: 'LGRA', article: '209', fraction: 'II' }],
  },
  {
    key: 'precautionary_hearing',
    name: 'Vista sobre la medida cautelar',
    explanation:
      'Pedida una medida cautelar, se da vista a quienes afecta para que digan lo que les convenga en 5 días hábiles.',
    unit: 'business_days',
    amount: 5,
    startsFrom: 'Desde que la autoridad investigadora pide la medida.',
    consequence: 'Después se resuelve con lo que haya.',
    warning: { unit: 'business_days', amount: 2 },
    legalBasis: [{ law: 'LGRA', article: '126' }],
  },
  {
    key: 'precautionary_decision',
    name: 'Resolver la medida cautelar',
    explanation:
      'La autoridad substanciadora o el Tribunal resuelve la medida cautelar en 5 días hábiles, por resolución interlocutoria que no admite recurso.',
    unit: 'business_days',
    amount: 5,
    startsFrom: 'Desde que termina la vista a los afectados.',
    consequence: 'El retraso se puede señalar ante la autoridad supervisora.',
    warning: { unit: 'business_days', amount: 2 },
    legalBasis: [{ law: 'LGRA', article: '127' }],
  },
  {
    key: 'claim_filing',
    name: 'Presentar la reclamación',
    explanation:
      'Contra el auto que admite, desecha o tiene por no presentado el informe, la contestación o una prueba, el que sobresee antes del cierre o el que admite o rechaza a un tercero, las partes pueden presentar reclamación en 5 días hábiles ante la autoridad que lo dictó.',
    unit: 'business_days',
    amount: 5,
    startsFrom: 'Desde que se notifica el auto.',
    consequence: 'Pasado el plazo, el auto ya no se puede reclamar.',
    warning: { unit: 'business_days', amount: 2 },
    legalBasis: [
      { law: 'LGRA', article: '213' },
      { law: 'LGRA', article: '214' },
    ],
  },
  {
    key: 'claim_resolution',
    name: 'Resolver la reclamación',
    explanation:
      'La autoridad que dictó el auto resuelve la reclamación en 5 días hábiles, sin recurso posterior.',
    unit: 'business_days',
    amount: 5,
    startsFrom: 'Desde que se presenta la reclamación.',
    consequence: 'El retraso se puede señalar ante la autoridad supervisora.',
    warning: { unit: 'business_days', amount: 2 },
    legalBasis: [{ law: 'LGRA', article: '214' }],
  },
  {
    key: 'revocation_filing',
    name: 'Pedir la revocación',
    explanation:
      'La persona sancionada por una falta no grave puede pedir la revocación en 15 días hábiles ante la autoridad que resolvió.',
    unit: 'business_days',
    amount: 15,
    startsFrom: 'Desde que se notifica la resolución.',
    consequence: 'Si nadie la pide, la resolución queda firme.',
    warning: { unit: 'business_days', amount: 3 },
    legalBasis: [{ law: 'LGRA', article: '210' }],
  },
  {
    key: 'revocation_resolution',
    name: 'Resolver la revocación',
    explanation:
      'La autoridad que resolvió admite la revocación en 3 días hábiles y la resuelve en 30 días hábiles. Contra lo que resuelva cabe juicio ante el Tribunal.',
    unit: 'business_days',
    amount: 30,
    startsFrom: 'Desde que se presenta la revocación.',
    consequence: 'El retraso se puede señalar ante la autoridad supervisora.',
    warning: { unit: 'business_days', amount: 5 },
    legalBasis: [
      { law: 'LGRA', article: '210' },
      { law: 'LGRA', article: '211' },
    ],
  },
  {
    key: 'court_appeal_filing',
    name: 'Apelar la sentencia',
    explanation:
      'Contra la sentencia del Tribunal que sanciona o absuelve, las personas responsables o los terceros (también la persona denunciante identificada) pueden apelar en 15 días hábiles ante el Tribunal que resolvió.',
    unit: 'business_days',
    amount: 15,
    startsFrom: 'Desde que se notifica la sentencia.',
    consequence: 'Si nadie apela ni se pide la revisión, la sentencia queda firme.',
    warning: { unit: 'business_days', amount: 3 },
    legalBasis: [
      { law: 'LGRA', article: '215' },
      { law: 'LGRA', article: '216' },
    ],
  },
  {
    key: 'review_filing',
    name: 'Pedir la revisión',
    explanation:
      'Las autoridades (la Secretaría, el órgano interno de control o la entidad de fiscalización) pueden pedir la revisión de la sentencia definitiva en 10 días hábiles. Ante quién y quién la resuelve lo dicen la ley federal o la de cada estado, y lo declara cada nodo.',
    unit: 'business_days',
    amount: 10,
    startsFrom: 'Desde que se notifica la sentencia.',
    consequence: 'Pasado el plazo, la autoridad ya no puede pedirla.',
    warning: { unit: 'business_days', amount: 3 },
    legalBasis: [
      { law: 'LGRA', article: '220' },
      { law: 'LGRA', article: '221' },
    ],
  },
  {
    key: 'execution_report',
    name: 'Informar la ejecución',
    explanation:
      'En faltas graves, el Tribunal ordena ejecutar la sanción sin que nadie lo pida, y el superior y la Secretaría informan en 10 días que la ejecutaron.',
    unit: 'business_days',
    amount: 10,
    startsFrom: 'Desde que la resolución queda firme.',
    consequence: 'No cumplir la ejecución es causa de responsabilidad.',
    warning: { unit: 'business_days', amount: 3 },
    legalBasis: [{ law: 'LGRA', article: '225' }],
  },
  {
    key: 'prosecutor_determination_challenge',
    name: 'Impugnar la determinación del Ministerio Público',
    explanation:
      'La víctima u ofendida puede impugnar ante el juez de control la abstención, el archivo temporal, el criterio de oportunidad o el no ejercicio de la acción penal en 10 días.',
    unit: 'natural_days',
    amount: 10,
    startsFrom: 'Desde que se notifica la determinación.',
    consequence: 'Pasado el plazo, la determinación ya no se puede impugnar.',
    warning: { unit: 'natural_days', amount: 3 },
    legalBasis: [{ law: 'CNPP', article: '258' }],
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
  {
    key: 'in_procedure',
    name: 'En procedimiento de responsabilidad',
    explanation:
      'La autoridad substanciadora admitió el informe y sigue el procedimiento contra la persona señalada.',
    managementState: 'accepted',
    legalStage: 'report_admitted',
  },
  {
    key: 'in_court',
    name: 'En el Tribunal',
    explanation:
      'La falta es grave o de particulares: el expediente está en el Tribunal de Justicia Administrativa, que la resuelve.',
    managementState: 'accepted',
    legalStage: 'court_received',
  },
  {
    key: 'under_remedy',
    name: 'En recurso',
    explanation:
      'Alguien presentó un recurso contra una decisión del trámite (inconformidad, reclamación, revocación, apelación o revisión) y está pendiente de resolverse.',
    managementState: 'accepted',
  },
  {
    key: 'final_sanction',
    name: 'Concluida con sanción firme',
    explanation: 'La resolución que sanciona quedó firme y la sanción se ejecutó.',
    managementState: 'closed',
  },
  {
    key: 'final_no_sanction',
    name: 'Concluida sin sanción',
    explanation:
      'Terminó sin sanción: la persona no fue responsable, la autoridad se abstuvo o se sobreseyó el procedimiento.',
    managementState: 'closed',
  },
  {
    key: 'prescribed_or_expired',
    name: 'Prescrita o caducada',
    explanation:
      'Pasó el tiempo que la ley da para sancionar (prescripción) o el procedimiento estuvo parado más de 6 meses (caducidad).',
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
