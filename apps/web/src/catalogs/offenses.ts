// Conductas denunciables: faltas de la Ley General de Responsabilidades Administrativas (LGRA) y
// algunos delitos por hechos de corrupción del Código Penal Federal (CPF). Catálogo público.

/** Grupo de la conducta. */
export type OffenseGroup = 'lgra-grave' | 'lgra-no-grave' | 'lgra-particulares' | 'cpf';

/** Conducta del catálogo. `code` es una clave propia: ley y artículo. */
export interface OffenseOption {
  code: string;
  name: string;
  group: OffenseGroup;
  /** Explicación breve en lenguaje claro. */
  hint: string;
}

/** Nombre de cada grupo, en el orden en que se muestran. */
export const OFFENSE_GROUPS: readonly { group: OffenseGroup; label: string }[] = [
  { group: 'lgra-grave', label: 'Faltas administrativas graves (LGRA)' },
  { group: 'lgra-no-grave', label: 'Faltas administrativas no graves (LGRA)' },
  { group: 'lgra-particulares', label: 'Faltas de particulares (LGRA)' },
  { group: 'cpf', label: 'Delitos por hechos de corrupción (Código Penal Federal)' },
];

/** Catálogo completo; se carga entero y se filtra en el navegador. */
export const OFFENSES: readonly OffenseOption[] = [
  {
    code: 'LGRA-52',
    name: 'Cohecho',
    group: 'lgra-grave',
    hint: 'Pedir o aceptar dinero, regalos o favores por hacer o dejar de hacer algo del cargo.',
  },
  {
    code: 'LGRA-53',
    name: 'Peculado',
    group: 'lgra-grave',
    hint: 'Usar o apropiarse de recursos públicos para beneficio propio o de otros.',
  },
  {
    code: 'LGRA-54',
    name: 'Desvío de recursos públicos',
    group: 'lgra-grave',
    hint: 'Destinar dinero o bienes públicos a un fin distinto del autorizado.',
  },
  {
    code: 'LGRA-55',
    name: 'Utilización indebida de información',
    group: 'lgra-grave',
    hint: 'Usar información reservada del cargo para obtener ventajas.',
  },
  {
    code: 'LGRA-57',
    name: 'Abuso de funciones',
    group: 'lgra-grave',
    hint: 'Usar el cargo para perjudicar a alguien o beneficiarse.',
  },
  {
    code: 'LGRA-58',
    name: 'Actuación bajo conflicto de interés',
    group: 'lgra-grave',
    hint: 'Intervenir en un asunto en el que se tiene interés personal o familiar.',
  },
  {
    code: 'LGRA-59',
    name: 'Contratación indebida',
    group: 'lgra-grave',
    hint: 'Contratar a personas o empresas impedidas o inhabilitadas.',
  },
  {
    code: 'LGRA-60',
    name: 'Enriquecimiento oculto u ocultamiento de conflicto de interés',
    group: 'lgra-grave',
    hint: 'Ocultar bienes o intereses en la declaración patrimonial.',
  },
  {
    code: 'LGRA-61',
    name: 'Tráfico de influencias',
    group: 'lgra-grave',
    hint: 'Usar la posición para influir en otra persona servidora pública.',
  },
  {
    code: 'LGRA-62',
    name: 'Encubrimiento',
    group: 'lgra-grave',
    hint: 'Ocultar una falta grave o un hecho de corrupción del que se tiene conocimiento.',
  },
  {
    code: 'LGRA-63',
    name: 'Desacato',
    group: 'lgra-grave',
    hint: 'No cumplir o dar información falsa ante requerimientos de autoridades.',
  },
  {
    code: 'LGRA-64',
    name: 'Obstrucción de la justicia',
    group: 'lgra-grave',
    hint: 'Impedir investigaciones o revelar la identidad de una persona denunciante anónima.',
  },
  {
    code: 'LGRA-49',
    name: 'Incumplimiento de obligaciones del servicio público',
    group: 'lgra-no-grave',
    hint: 'No cumplir las obligaciones del cargo, por ejemplo no atender con respeto o no custodiar documentos.',
  },
  {
    code: 'LGRA-50',
    name: 'Daño a la Hacienda Pública sin intención',
    group: 'lgra-no-grave',
    hint: 'Causar daños o pérdidas a los recursos públicos por descuido.',
  },
  {
    code: 'LGRA-66',
    name: 'Soborno',
    group: 'lgra-particulares',
    hint: 'Ofrecer o dar dinero o favores a una persona servidora pública.',
  },
  {
    code: 'LGRA-67',
    name: 'Participación ilícita en procedimientos administrativos',
    group: 'lgra-particulares',
    hint: 'Participar en licitaciones o trámites estando impedido.',
  },
  {
    code: 'LGRA-68',
    name: 'Tráfico de influencias para inducir a la autoridad',
    group: 'lgra-particulares',
    hint: 'Usar influencia real o fingida sobre servidores públicos para obtener un beneficio.',
  },
  {
    code: 'LGRA-69',
    name: 'Utilización de información falsa',
    group: 'lgra-particulares',
    hint: 'Presentar documentos o información falsa para obtener un beneficio.',
  },
  {
    code: 'LGRA-70',
    name: 'Colusión',
    group: 'lgra-particulares',
    hint: 'Ponerse de acuerdo entre empresas para obtener ventajas en contrataciones públicas.',
  },
  {
    code: 'LGRA-71',
    name: 'Uso indebido de recursos públicos',
    group: 'lgra-particulares',
    hint: 'Usar recursos públicos recibidos por un particular para otro fin.',
  },
  {
    code: 'LGRA-72',
    name: 'Contratación indebida de exservidores públicos',
    group: 'lgra-particulares',
    hint: 'Contratar a quien fue servidor público para aprovechar información privilegiada.',
  },
  {
    code: 'CPF-214',
    name: 'Ejercicio ilícito de servicio público',
    group: 'cpf',
    hint: 'Ejercer funciones sin nombramiento o después de haber sido separado del cargo.',
  },
  {
    code: 'CPF-215',
    name: 'Abuso de autoridad',
    group: 'cpf',
    hint: 'Usar el cargo para violentar, maltratar o negar derechos.',
  },
  {
    code: 'CPF-217',
    name: 'Uso ilícito de atribuciones y facultades',
    group: 'cpf',
    hint: 'Otorgar permisos, contratos o concesiones de forma ilegal.',
  },
  {
    code: 'CPF-218',
    name: 'Concusión',
    group: 'cpf',
    hint: 'Exigir cobros o contribuciones que no corresponden por ley.',
  },
  {
    code: 'CPF-219',
    name: 'Intimidación',
    group: 'cpf',
    hint: 'Amenazar a alguien para que no denuncie o no declare.',
  },
  {
    code: 'CPF-220',
    name: 'Ejercicio abusivo de funciones',
    group: 'cpf',
    hint: 'Dar contratos o beneficios a familiares o socios desde el cargo.',
  },
  {
    code: 'CPF-221',
    name: 'Tráfico de influencia',
    group: 'cpf',
    hint: 'Gestionar asuntos ajenos al cargo para obtener beneficios.',
  },
  {
    code: 'CPF-222',
    name: 'Cohecho',
    group: 'cpf',
    hint: 'Solicitar o recibir dinero o dádivas por actos del cargo.',
  },
  {
    code: 'CPF-223',
    name: 'Peculado',
    group: 'cpf',
    hint: 'Disponer de dinero o bienes públicos para fines propios.',
  },
  {
    code: 'CPF-224',
    name: 'Enriquecimiento ilícito',
    group: 'cpf',
    hint: 'Tener bienes que no se pueden justificar con los ingresos del cargo.',
  },
];
