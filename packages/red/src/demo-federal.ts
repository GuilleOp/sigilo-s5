// Competencia por dependencia del nodo federal de la demostración (formato 2): el órgano interno de
// control de cada ente federal, «sin OIC designado → la Secretaría Anticorrupción y Buen Gobierno»
// o pendiente. Las autoridades y las instituciones son ficticias; los entes PDN-00-… son los reales
// del catálogo (fragmento 00) y ningún caso de la demostración acusa a uno de ellos.
import type { EntityAssignment } from '@sigilo/contracts';

/** Nombres ficticios de las instituciones federales de la demostración. */
export const FEDERAL_NAMES = {
  sabg: 'Secretaría Anticorrupción y Buen Gobierno (ficticia)',
  sabgOperation: 'Secretaría Anticorrupción y Buen Gobierno (ficticia), operación del nodo federal',
  asf: 'Auditoría Superior de la Federación (ficticia)',
  iffeResponsabilidades:
    'Área de Responsabilidades del OIC en el Instituto Federal Ficticio de Equipamiento',
  dfpsResponsabilidades:
    'Área de Responsabilidades del OIC en la Delegación Federal Ficticia de Programas Sociales',
  tfjaSala:
    'Sala Especializada en Responsabilidades Administrativas del Tribunal Federal de Justicia Administrativa (ficticia)',
  tfjaTerceraSeccion:
    'Tercera Sección de la Sala Superior del Tribunal Federal de Justicia Administrativa (ficticia)',
  oicImss: 'Órgano Interno de Control en el Instituto Mexicano del Seguro Social (ficticio)',
  oicSat: 'Órgano Interno de Control en el Servicio de Administración Tributaria (ficticio)',
} as const;

/** Fundamento de que la SABG atienda a un ente federal sin OIC designado. */
const SABG_BASIS = 'LOAPF, art. 37, fr. XXIX; LGRA, art. 9, fr. I';

/**
 * Competencia por dependencia del nodo federal: los dos entes ficticios del escenario con su OIC
 * (con llaves), dos entes reales con su OIC nombrado sin alta, la oficina ficticia de aduanas «sin
 * OIC designado → la SABG» (sin llaves en la demostración) y dos autónomos pendientes.
 */
export function federalEntityAssignments(): EntityAssignment[] {
  const basis = 'LGRA, arts. 3, fr. XXI, y 10';
  return [
    {
      entityId: 'VE-INSTITUTO',
      status: 'assigned',
      holder: { kind: 'authority', authorityId: 'authority.oic-iffe' },
      legalBasis: basis,
    },
    {
      entityId: 'VE-PROGRAMAS',
      status: 'assigned',
      holder: { kind: 'authority', authorityId: 'authority.oic-dfps' },
      legalBasis: basis,
    },
    {
      entityId: 'VE-ADUANA',
      status: 'without_oic',
      holder: { kind: 'institution', name: FEDERAL_NAMES.sabg },
      legalBasis: SABG_BASIS,
    },
    {
      entityId: 'PDN-00-196',
      status: 'assigned',
      holder: { kind: 'institution', name: FEDERAL_NAMES.oicImss },
      legalBasis: basis,
    },
    {
      entityId: 'PDN-00-285',
      status: 'assigned',
      holder: { kind: 'institution', name: FEDERAL_NAMES.oicSat },
      legalBasis: basis,
    },
    { entityId: 'PDN-00-317', status: 'pending' },
    { entityId: 'PDN-00-324', status: 'pending' },
  ].sort((left, right) => left.entityId.localeCompare(right.entityId)) as EntityAssignment[];
}
