// Competencia por dependencia del nodo Querétaro de la demostración (formato 2 de la tabla de
// funciones): qué órgano interno de control investiga a cada ente real del catálogo de la PDN. Las
// autoridades y las instituciones son ficticias; los entes son los reales del catálogo, y ningún caso
// de la demostración acusa a uno de ellos. La lista de entes se escribe aquí (no se importa el
// catálogo completo, que no va en el bundle de la web) y la prueba de la red la compara con él.
import type { EntityAssignment, FunctionHolder } from '@sigilo/contracts';

/** Nombres ficticios de las instituciones de Querétaro en la demostración (B08). */
export const QUERETARO_NAMES = {
  receptora:
    'Unidad receptora de quejas y denuncias de la Secretaría de la Contraloría del Poder Ejecutivo del Estado de Querétaro (ficticia)',
  contraloria:
    'Secretaría de la Contraloría del Poder Ejecutivo del Estado de Querétaro (ficticia)',
  responsabilidades:
    'Dirección de Responsabilidades Administrativas de la Secretaría de la Contraloría de Querétaro (ficticia)',
  titularContraloria: 'Titular de la Secretaría de la Contraloría de Querétaro (ficticia)',
  sesea: 'Secretaría Ejecutiva del Sistema Estatal Anticorrupción de Querétaro (ficticia)',
  oicMunicipioQueretaro: 'Órgano Interno de Control del Municipio de Querétaro (ficticio)',
  oicElMarques: 'Órgano Interno de Control del Municipio de El Marqués (ficticio)',
  oicSanJuanDelRio: 'Órgano Interno de Control del Municipio de San Juan del Río (ficticio)',
  areaResponsabilidadesQueretaro:
    'Área de Responsabilidades del Órgano Interno de Control del Municipio de Querétaro (ficticia)',
  areaResponsabilidadesElMarques:
    'Área de Responsabilidades del Órgano Interno de Control del Municipio de El Marqués (ficticia)',
  oicCea: 'Órgano Interno de Control de la Comisión Estatal de Aguas (ficticio)',
  oicUaq: 'Órgano Interno de Control de la Universidad Autónoma de Querétaro (ficticio)',
  oicLegislatura:
    'Órgano Interno de Control del Poder Legislativo del Estado de Querétaro (ficticio)',
  sala: 'Sala Especializada en materia de Responsabilidades Administrativas del Tribunal de Justicia Administrativa del Estado de Querétaro (ficticia)',
  cuartaSeccion:
    'Cuarta Sección de la Sala Superior del Tribunal de Justicia Administrativa de Querétaro (ficticia)',
  fiscalia:
    'Fiscalía Especializada en el Combate a la Corrupción de la Fiscalía General del Estado de Querétaro (ficticia)',
  esfe: 'Entidad Superior de Fiscalización del Estado de Querétaro (ficticia)',
} as const;

/** Entes del Municipio de Querétaro en el catálogo (por su nombre: la clave de municipio varía). */
export const QUERETARO_MUNICIPIO_QUERETARO_ENTES = ['PDN-22-7258', 'PDN-22-7283', 'PDN-22-7284'];

/** Entes del Municipio de El Marqués en el catálogo. */
export const QUERETARO_EL_MARQUES_ENTES = [
  'PDN-22-7244',
  'PDN-22-7252',
  'PDN-22-7275',
  'PDN-22-7276',
];

/** Entes del Municipio de San Juan del Río: su OIC está nombrado y le falta el alta. */
const SAN_JUAN_DEL_RIO_ENTES = ['PDN-22-7242', 'PDN-22-7257', 'PDN-22-7263', 'PDN-22-7264'];

/** Comisión Estatal de Aguas: paraestatal con su propio OIC, con llaves. */
export const QUERETARO_CEA_ENTE = 'PDN-22-7109';

/** Dependencias de la administración centralizada del Ejecutivo. */
const CENTRALIZED_ENTES = [
  'PDN-22-7124',
  'PDN-22-7125',
  'PDN-22-7126',
  'PDN-22-7150',
  'PDN-22-7154',
  'PDN-22-7158',
  'PDN-22-7160',
  'PDN-22-7162',
  'PDN-22-7164',
  'PDN-22-7166',
  'PDN-22-7168',
  'PDN-22-7170',
  'PDN-22-7172',
  'PDN-22-7174',
  'PDN-22-7176',
  'PDN-22-7178',
  'PDN-22-7180',
  'PDN-22-7182',
  'PDN-22-7184',
  'PDN-22-7186',
  'PDN-22-7188',
  'PDN-22-7193',
  'PDN-22-7199',
  'PDN-22-7202',
  'PDN-22-7203',
];

/** Organismos, empresas y fideicomisos del Ejecutivo (sin la CEA, que tiene su OIC). */
const PARASTATAL_ENTES = [
  'PDN-22-7074',
  'PDN-22-7076',
  'PDN-22-7078',
  'PDN-22-7080',
  'PDN-22-7081',
  'PDN-22-7082',
  'PDN-22-7083',
  'PDN-22-7085',
  'PDN-22-7087',
  'PDN-22-7089',
  'PDN-22-7091',
  'PDN-22-7093',
  'PDN-22-7095',
  'PDN-22-7097',
  'PDN-22-7098',
  'PDN-22-7099',
  'PDN-22-7101',
  'PDN-22-7103',
  'PDN-22-7105',
  'PDN-22-7107',
  'PDN-22-7111',
  'PDN-22-7112',
  'PDN-22-7114',
  'PDN-22-7116',
  'PDN-22-7117',
  'PDN-22-7119',
  'PDN-22-7121',
  'PDN-22-7122',
  'PDN-22-7128',
  'PDN-22-7129',
  'PDN-22-7130',
  'PDN-22-7132',
  'PDN-22-7133',
  'PDN-22-7135',
  'PDN-22-7137',
  'PDN-22-7139',
  'PDN-22-7141',
  'PDN-22-7142',
  'PDN-22-7144',
  'PDN-22-7146',
  'PDN-22-7148',
  'PDN-22-7152',
  'PDN-22-7156',
  'PDN-22-7190',
  'PDN-22-7191',
  'PDN-22-7194',
  'PDN-22-7195',
  'PDN-22-7197',
  'PDN-22-7200',
  'PDN-22-7204',
  'PDN-22-7208',
  'PDN-22-7210',
  'PDN-22-7212',
  'PDN-22-7214',
  'PDN-22-7216',
  'PDN-22-7218',
];

/**
 * Poderes y organismos autónomos: la Contraloría del Ejecutivo no los investiga. Quedan pendientes
 * hasta que su OIC se dé de alta (salvo la Universidad Autónoma y la Legislatura, ya nombrados).
 */
const AUTONOMOUS_PENDING_ENTES = [
  'PDN-22-7221',
  'PDN-22-7222',
  'PDN-22-7223',
  'PDN-22-7224',
  'PDN-22-7226',
  'PDN-22-7228',
  'PDN-22-7230',
  'PDN-22-7232',
  'PDN-22-7234',
  'PDN-22-7236',
  'PDN-22-7238',
  'PDN-22-7239',
];

/** Fundamento de que la Contraloría atienda las dependencias del Ejecutivo sin OIC designado. */
export const COMPTROLLER_WITHOUT_OIC_BASIS =
  'LRAEQ, arts. 2, fr. XXII, 6 y 7: la Secretaría de la Contraloría investiga en el Poder Ejecutivo';

/**
 * Competencia por dependencia de Querétaro: las dependencias del Ejecutivo «sin OIC designado →
 * la Contraloría»; la CEA y los municipios de Querétaro y El Marqués con su OIC (con llaves); San
 * Juan del Río, la Universidad Autónoma y la Legislatura con su OIC nombrado sin alta; los demás
 * autónomos, pendientes. Los demás municipios no se listan: sin regla, sus denuncias van a la
 * receptora con la nota «turnar al OIC del municipio» (nunca a la Contraloría, CPEUM art. 109 fr. III).
 */
export function queretaroEntityAssignments(authority: {
  comptroller: string;
  oicMunicipioQueretaro: string;
  oicElMarques: string;
  oicCea: string;
}): EntityAssignment[] {
  const ofAuthority = (authorityId: string): FunctionHolder => ({ kind: 'authority', authorityId });
  const named = (name: string): FunctionHolder => ({ kind: 'institution', name });
  const assigned = (entityId: string, holder: FunctionHolder, legalBasis: string) =>
    ({ entityId, status: 'assigned', holder, legalBasis }) as const;
  const municipal = 'CPEUM, art. 109, fr. III; LRAEQ, arts. 6 y 7';
  return [
    ...[...CENTRALIZED_ENTES, ...PARASTATAL_ENTES].map((entityId): EntityAssignment => ({
      entityId,
      status: 'without_oic',
      holder: ofAuthority(authority.comptroller),
      legalBasis: COMPTROLLER_WITHOUT_OIC_BASIS,
    })),
    assigned(QUERETARO_CEA_ENTE, ofAuthority(authority.oicCea), 'LGRA, arts. 3, fr. XXI, y 10'),
    ...QUERETARO_MUNICIPIO_QUERETARO_ENTES.map((id) =>
      assigned(id, ofAuthority(authority.oicMunicipioQueretaro), municipal),
    ),
    ...QUERETARO_EL_MARQUES_ENTES.map((id) =>
      assigned(id, ofAuthority(authority.oicElMarques), municipal),
    ),
    ...SAN_JUAN_DEL_RIO_ENTES.map((id) =>
      assigned(id, named(QUERETARO_NAMES.oicSanJuanDelRio), municipal),
    ),
    assigned('PDN-22-7206', named(QUERETARO_NAMES.oicUaq), 'LGRA, arts. 3, fr. XXI, y 10'),
    assigned('PDN-22-7219', named(QUERETARO_NAMES.oicLegislatura), 'LGRA, arts. 3, fr. XXI, y 10'),
    ...AUTONOMOUS_PENDING_ENTES.map((entityId): EntityAssignment => ({
      entityId,
      status: 'pending',
    })),
  ].sort((left, right) => left.entityId.localeCompare(right.entityId));
}
