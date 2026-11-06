// Casos sintéticos de docs/demo-escenario.md (Marta, Luis y el atacante) para las pruebas y la
// demostración de la corroboración. Datos ficticios; no corresponden a personas ni contratos reales.
import type { CorroborationEntry } from '@sigilo/contracts';
import type { CorroborationIdentifier } from './identifier.ts';

/** Una denuncia del escenario, tal como la vería el navegador y después el nodo. */
export interface DemoCorroborationCase {
  key: string;
  identifier: CorroborationIdentifier;
  nodeId: string;
  entry: CorroborationEntry;
  /** Hora de recepción redondeada a 10 minutos. */
  receivedAt: string;
  /** Relato ya revisado con Huella Cero. */
  narrative: string;
}

/** Contrato ficticio de la adjudicación de Marta (sección 4.1). */
export const DEMO_OCID = 'ocds-fict00-IFFE-AD-2026-0042';

/** Persona denunciada por el atacante: el director honesto de la Delegación (sección 4.3). */
export const DEMO_HONEST_DIRECTOR: CorroborationIdentifier = {
  kind: 'servidor',
  name: 'Servidor Ficticio Tres',
  entityId: 'VE-PROGRAMAS',
};

export const DEMO_CASES: readonly DemoCorroborationCase[] = [
  {
    key: 'case.marta',
    identifier: { kind: 'ocid', ocid: DEMO_OCID },
    nodeId: 'node.federal',
    entry: 'relay',
    receivedAt: '2026-11-09T16:00Z',
    narrative:
      'En marzo de 2026 el Departamento de Compras del Instituto Federal Ficticio de Equipamiento adjudicó de forma directa el contrato IFFE-AD-2026-0042 (ocds-fict00-IFFE-AD-2026-0042) a Comercializadora Ficticia Ejemplo, S.A. de C.V., por 1,480,000 pesos, para comprar equipo de cómputo. La adjudicación se justificó como urgente, pero la compra estaba en el programa anual desde enero y había tiempo para licitar. La empresa aparece en la lista pública de contribuyentes con operaciones presuntamente inexistentes. Lo sé porque varias personas del área revisan las requisiciones. A principios de marzo de 2026, por la tarde, la persona titular del área pidió cambiar la fecha de la requisición para que pareciera urgente. Adjunto la foto de la cotización que se usó para justificar el precio.',
  },
  {
    key: 'case.attack-1',
    identifier: DEMO_HONEST_DIRECTOR,
    nodeId: 'node.federal',
    entry: 'relay',
    receivedAt: '2026-11-11T17:00Z',
    narrative:
      'El director de la Delegación Federal Ficticia de Programas Sociales cobra comisiones a los proveedores y reparte los apoyos entre sus conocidos. Todos en la delegación lo saben y nadie hace nada.',
  },
  {
    key: 'case.attack-2',
    identifier: DEMO_HONEST_DIRECTOR,
    nodeId: 'node.federal',
    entry: 'relay',
    receivedAt: '2026-11-11T17:20Z',
    narrative:
      'El director de la Delegación Federal Ficticia de Programas Sociales cobra comisiones a proveedores y reparte apoyos entre conocidos suyos. En la delegación todos lo saben y nadie hace nada.',
  },
  {
    key: 'case.attack-3',
    identifier: DEMO_HONEST_DIRECTOR,
    nodeId: 'node.federal',
    entry: 'relay',
    receivedAt: '2026-11-11T17:40Z',
    narrative:
      'El director de la Delegación Federal Ficticia de Programas Sociales adjudicó directamente el contrato ocds-fict00-DFPS-LP-2026-0007 a una empresa de su cuñado y cobra comisiones a los proveedores. Todos lo saben.',
  },
  {
    key: 'case.luis',
    identifier: { kind: 'ocid', ocid: DEMO_OCID },
    nodeId: 'node.federal',
    entry: 'direct',
    receivedAt: '2026-11-12T16:20Z',
    narrative:
      'El contrato ocds-fict00-IFFE-AD-2026-0042 del Instituto Federal Ficticio de Equipamiento se pagó completo aunque el equipo de cómputo llegó incompleto. La empresa proveedora no tenía bodega en el domicilio que registró.',
  },
];

/** Caso del escenario por su clave. Lanza error si no existe. */
export function demoCase(key: string): DemoCorroborationCase {
  const found = DEMO_CASES.find((item) => item.key === key);
  if (found === undefined) throw new Error(`Caso desconocido: ${key}.`);
  return found;
}
