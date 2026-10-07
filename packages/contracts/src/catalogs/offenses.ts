// Conductas denunciables: faltas de la Ley General de Responsabilidades Administrativas (LGRA) y
// delitos por hechos de corrupción del Código Penal Federal (CPF). Catálogo público.
// Las etiquetas dicen primero lo que pasó, en lenguaje claro, y después el término legal.

/** Ley de la que proviene una clave. */
export type OffenseLaw = 'LGRA' | 'CPF';

/** Situación cotidiana con la que se agrupan las conductas. */
export type OffenseSituation =
  | 'dinero-y-regalos'
  | 'recursos-publicos'
  | 'contratos-y-tramites'
  | 'abuso-del-cargo'
  | 'ocultar-y-obstruir';

/**
 * Conducta del catálogo. `code` es la clave propia (ley y artículo) que viaja en la denuncia.
 * `equivalentCodes` son claves de otra ley con el mismo nombre; se aceptan y se muestran como
 * esta conducta para no repetirla en la lista.
 */
export interface OffenseOption {
  code: string;
  equivalentCodes: readonly string[];
  /** Lo que pasó, en lenguaje claro, con el término legal entre paréntesis. */
  label: string;
  /** Término legal. */
  legalTerm: string;
  situation: OffenseSituation;
  /** Explicación breve en lenguaje claro. */
  hint: string;
}

/** Nombre completo de cada ley. */
export const OFFENSE_LAW_NAMES: Readonly<Record<OffenseLaw, string>> = {
  LGRA: 'Ley General de Responsabilidades Administrativas',
  CPF: 'Código Penal Federal',
};

/** Situaciones en el orden en que se muestran. */
export const OFFENSE_SITUATIONS: readonly { situation: OffenseSituation; label: string }[] = [
  { situation: 'dinero-y-regalos', label: 'Dinero, regalos o favores a cambio de algo' },
  { situation: 'recursos-publicos', label: 'Uso del dinero y los bienes públicos' },
  { situation: 'contratos-y-tramites', label: 'Contratos, licitaciones y trámites' },
  { situation: 'abuso-del-cargo', label: 'Abuso del cargo o de influencias' },
  { situation: 'ocultar-y-obstruir', label: 'Ocultar, obstruir o amenazar' },
];

/** Catálogo completo; se carga entero y se filtra en el navegador. */
export const OFFENSES: readonly OffenseOption[] = [
  {
    code: 'LGRA-52',
    equivalentCodes: ['CPF-222'],
    label: 'Pedir o aceptar dinero o regalos (cohecho)',
    legalTerm: 'cohecho',
    situation: 'dinero-y-regalos',
    hint: 'Una persona servidora pública pide o recibe dinero, regalos o favores por hacer o dejar de hacer algo de su cargo.',
  },
  {
    code: 'LGRA-66',
    equivalentCodes: [],
    label: 'Ofrecer o dar dinero o regalos a una persona servidora pública (soborno)',
    legalTerm: 'soborno',
    situation: 'dinero-y-regalos',
    hint: 'Alguien ofrece o entrega dinero, regalos o favores para conseguir algo de una persona servidora pública.',
  },
  {
    code: 'CPF-218',
    equivalentCodes: [],
    label: 'Cobrar pagos que la ley no permite (concusión)',
    legalTerm: 'concusión',
    situation: 'dinero-y-regalos',
    hint: 'Exigir cobros, cuotas o contribuciones que no corresponden por ley.',
  },
  {
    code: 'LGRA-53',
    equivalentCodes: ['CPF-223'],
    label: 'Quedarse con dinero o bienes públicos (peculado)',
    legalTerm: 'peculado',
    situation: 'recursos-publicos',
    hint: 'Usar o apropiarse de dinero o bienes públicos para beneficio propio o de otras personas.',
  },
  {
    code: 'LGRA-54',
    equivalentCodes: [],
    label: 'Usar dinero público para algo distinto de lo autorizado (desvío de recursos públicos)',
    legalTerm: 'desvío de recursos públicos',
    situation: 'recursos-publicos',
    hint: 'Destinar dinero o bienes públicos a un fin distinto del autorizado.',
  },
  {
    code: 'LGRA-71',
    equivalentCodes: [],
    label:
      'Un particular usa mal los recursos públicos que recibió (uso indebido de recursos públicos)',
    legalTerm: 'uso indebido de recursos públicos',
    situation: 'recursos-publicos',
    hint: 'Una persona o empresa usa para otro fin los recursos públicos que recibió.',
  },
  {
    code: 'LGRA-50',
    equivalentCodes: [],
    label: 'Causar pérdidas al dinero público por descuido (daño a la Hacienda Pública)',
    legalTerm: 'daño a la Hacienda Pública',
    situation: 'recursos-publicos',
    hint: 'Causar daños o pérdidas a los recursos públicos sin intención, por descuido.',
  },
  {
    code: 'LGRA-60',
    equivalentCodes: [],
    label:
      'Ocultar bienes o intereses en la declaración patrimonial (enriquecimiento oculto u ocultamiento de conflicto de interés)',
    legalTerm: 'enriquecimiento oculto u ocultamiento de conflicto de interés',
    situation: 'recursos-publicos',
    hint: 'No declarar bienes, ingresos o intereses que se deben informar.',
  },
  {
    code: 'CPF-224',
    equivalentCodes: [],
    label: 'Tener bienes que no se explican con el sueldo (enriquecimiento ilícito)',
    legalTerm: 'enriquecimiento ilícito',
    situation: 'recursos-publicos',
    hint: 'Tener bienes que no se pueden justificar con los ingresos del cargo.',
  },
  {
    code: 'LGRA-59',
    equivalentCodes: [],
    label: 'Contratar a personas o empresas que tienen prohibido contratar (contratación indebida)',
    legalTerm: 'contratación indebida',
    situation: 'contratos-y-tramites',
    hint: 'Contratar a personas o empresas impedidas o inhabilitadas.',
  },
  {
    code: 'LGRA-67',
    equivalentCodes: [],
    label:
      'Participar en una licitación o trámite estando impedido (participación ilícita en procedimientos administrativos)',
    legalTerm: 'participación ilícita en procedimientos administrativos',
    situation: 'contratos-y-tramites',
    hint: 'Una persona o empresa participa en licitaciones o trámites aunque tiene prohibido hacerlo.',
  },
  {
    code: 'LGRA-70',
    equivalentCodes: [],
    label: 'Empresas que se ponen de acuerdo para ganar contratos (colusión)',
    legalTerm: 'colusión',
    situation: 'contratos-y-tramites',
    hint: 'Empresas que se ponen de acuerdo para obtener ventajas en contrataciones públicas.',
  },
  {
    code: 'LGRA-72',
    equivalentCodes: [],
    label:
      'Contratar a quien dejó un cargo público para aprovechar lo que sabe (contratación indebida de exservidores públicos)',
    legalTerm: 'contratación indebida de exservidores públicos',
    situation: 'contratos-y-tramites',
    hint: 'Contratar a quien fue persona servidora pública para aprovechar información privilegiada.',
  },
  {
    code: 'LGRA-69',
    equivalentCodes: [],
    label: 'Presentar documentos o datos falsos (utilización de información falsa)',
    legalTerm: 'utilización de información falsa',
    situation: 'contratos-y-tramites',
    hint: 'Presentar documentos o información falsa para obtener un beneficio.',
  },
  {
    code: 'CPF-217',
    equivalentCodes: [],
    label:
      'Dar permisos, contratos o concesiones de forma ilegal (uso ilícito de atribuciones y facultades)',
    legalTerm: 'uso ilícito de atribuciones y facultades',
    situation: 'contratos-y-tramites',
    hint: 'Otorgar permisos, contratos o concesiones sin cumplir la ley.',
  },
  {
    code: 'CPF-220',
    equivalentCodes: [],
    label: 'Dar contratos o beneficios a familiares o socios (ejercicio abusivo de funciones)',
    legalTerm: 'ejercicio abusivo de funciones',
    situation: 'contratos-y-tramites',
    hint: 'Dar contratos o beneficios desde el cargo a familiares, socios o amistades.',
  },
  {
    code: 'LGRA-57',
    equivalentCodes: [],
    label: 'Usar el cargo para perjudicar a alguien o para beneficiarse (abuso de funciones)',
    legalTerm: 'abuso de funciones',
    situation: 'abuso-del-cargo',
    hint: 'Usar las atribuciones del cargo para dañar a alguien o para obtener un beneficio.',
  },
  {
    code: 'CPF-215',
    equivalentCodes: [],
    label: 'Maltratar a alguien o negarle sus derechos desde el cargo (abuso de autoridad)',
    legalTerm: 'abuso de autoridad',
    situation: 'abuso-del-cargo',
    hint: 'Usar el cargo para violentar, maltratar o negar derechos.',
  },
  {
    code: 'LGRA-58',
    equivalentCodes: [],
    label:
      'Decidir un asunto en el que se tiene interés personal (actuación bajo conflicto de interés)',
    legalTerm: 'actuación bajo conflicto de interés',
    situation: 'abuso-del-cargo',
    hint: 'Intervenir en un asunto en el que se tiene interés personal, familiar o de negocios.',
  },
  {
    code: 'LGRA-61',
    equivalentCodes: ['CPF-221'],
    label:
      'Usar el puesto para presionar a otra persona servidora pública (tráfico de influencias)',
    legalTerm: 'tráfico de influencias',
    situation: 'abuso-del-cargo',
    hint: 'Usar la posición para influir en otra persona servidora pública y obtener un beneficio.',
  },
  {
    code: 'LGRA-68',
    equivalentCodes: [],
    label:
      'Un particular presume influencias para conseguir algo (tráfico de influencias para inducir a la autoridad)',
    legalTerm: 'tráfico de influencias para inducir a la autoridad',
    situation: 'abuso-del-cargo',
    hint: 'Usar influencia real o fingida sobre personas servidoras públicas para obtener un beneficio.',
  },
  {
    code: 'LGRA-55',
    equivalentCodes: [],
    label: 'Aprovechar información reservada del cargo (utilización indebida de información)',
    legalTerm: 'utilización indebida de información',
    situation: 'abuso-del-cargo',
    hint: 'Usar información que se conoce por el cargo para obtener ventajas.',
  },
  {
    code: 'CPF-214',
    equivalentCodes: [],
    label:
      'Actuar en un cargo sin nombramiento o después de dejarlo (ejercicio ilícito de servicio público)',
    legalTerm: 'ejercicio ilícito de servicio público',
    situation: 'abuso-del-cargo',
    hint: 'Ejercer funciones sin nombramiento o después de haber sido separado del cargo.',
  },
  {
    code: 'LGRA-49',
    equivalentCodes: [],
    label:
      'No cumplir las obligaciones del cargo (incumplimiento de obligaciones del servicio público)',
    legalTerm: 'incumplimiento de obligaciones del servicio público',
    situation: 'abuso-del-cargo',
    hint: 'Por ejemplo, no atender con respeto o no cuidar los documentos a su cargo.',
  },
  {
    code: 'LGRA-62',
    equivalentCodes: [],
    label: 'Ocultar una falta o un hecho de corrupción que se conoce (encubrimiento)',
    legalTerm: 'encubrimiento',
    situation: 'ocultar-y-obstruir',
    hint: 'Saber de una falta grave o de un hecho de corrupción y ocultarlo.',
  },
  {
    code: 'LGRA-63',
    equivalentCodes: [],
    label: 'No obedecer o mentir a una autoridad que investiga (desacato)',
    legalTerm: 'desacato',
    situation: 'ocultar-y-obstruir',
    hint: 'No cumplir o dar información falsa ante los requerimientos de una autoridad.',
  },
  {
    code: 'LGRA-64',
    equivalentCodes: [],
    label: 'Impedir una investigación o revelar quién denunció (obstrucción de la justicia)',
    legalTerm: 'obstrucción de la justicia',
    situation: 'ocultar-y-obstruir',
    hint: 'Impedir investigaciones o revelar la identidad de una persona denunciante anónima.',
  },
  {
    code: 'CPF-219',
    equivalentCodes: [],
    label: 'Amenazar a alguien para que no denuncie o no declare (intimidación)',
    legalTerm: 'intimidación',
    situation: 'ocultar-y-obstruir',
    hint: 'Amenazar o presionar a una persona para que no denuncie, no declare o se retracte.',
  },
];
