// Datos del escenario de la demostración (docs/demo-escenario.md, secciones 4.4, 6.2 y 6.4): los
// 31 acuerdos con plantilla, el archivo de case.marta y los 5 acuerdos de control. Todo ficticio.
import {
  addDays,
  checkContractSuppliers,
  extractContractClaims,
  verifyCitedContract,
} from '@sigilo/contexto-pdn';
import type { Verification } from '@sigilo/contexto-pdn';
import { createSyntheticSources, SCENARIO_DAY_ZERO } from '@sigilo/contexto-pdn/synthetic';
import { DEFAULT_BUSINESS_CALENDAR, isBusinessDay } from '@sigilo/core';
import type { CaseRecord, ClosureAct } from '../types.ts';

/** Día N del escenario como fecha. */
export function scenarioDay(offset: number): string {
  return addDays(SCENARIO_DAY_ZERO, offset);
}

/** Recorre al día hábil anterior si cae en inhábil (sección 4.4). */
function previousBusinessDay(day: string): string {
  let current = day;
  while (!isBusinessDay(current, DEFAULT_BUSINESS_CALENDAR)) current = addDays(current, -1);
  return current;
}

const VARIANTS = [
  'no se cuenta con elementos suficientes',
  'no se advierten elementos suficientes',
  'no existen elementos suficientes',
] as const;

/** Texto base de la plantilla de `authority.oic-iffe`. */
export function templateText(fileNumber: string, variant: number): string {
  return (
    'Con fundamento en el artículo 100 de la Ley General de Responsabilidades Administrativas, se ' +
    `determina la conclusión y archivo del expediente ${fileNumber}, toda vez que ${VARIANTS[(variant - 1) % 3] ?? VARIANTS[0]} ` +
    'para acreditar la existencia de la infracción y la presunta responsabilidad. Notifíquese.'
  );
}

/**
 * Acuerdo de calificación con la misma plantilla: solo cambia «conclusión y archivo» por
 * «calificación como no grave». Similitud de 0.77 con la variante 1 (umbral 0.75); con más
 * cambios, AUD-01 ya no lo detectaría. La semilla de la demostración debe usar este texto.
 */
export function templateQualificationText(fileNumber: string): string {
  return (
    'Con fundamento en el artículo 100 de la Ley General de Responsabilidades Administrativas, se ' +
    `determina la calificación como no grave del expediente ${fileNumber}, toda vez que ${VARIANTS[0]} ` +
    'para acreditar la existencia de la infracción y la presunta responsabilidad. Notifíquese.'
  );
}

/** Los 31 acuerdos importados: `case.template-archive-01` a `-31`. */
export function templateArchives(): ClosureAct[] {
  return Array.from({ length: 31 }, (_, index) => {
    const i = index + 1;
    const fileNumber = `OIC-IFFE-INV-${String(i).padStart(4, '0')}`;
    return {
      id: `case.template-archive-${String(i).padStart(2, '0')}`,
      authorityId: 'authority.oic-iffe',
      fileNumber,
      issuedOn: previousBusinessDay(scenarioDay(-330 + 10 * (i - 1))),
      reason: 'insufficient_information',
      text: templateText(fileNumber, ((i - 1) % 3) + 1),
      qualification: null,
      caseRef: null,
    };
  });
}

/** Los 5 acuerdos de control de `authority.comptroller-queretaro` (no deben señalarse). */
export function controlClosures(): ClosureAct[] {
  const texts: readonly [string, ClosureAct['reason']][] = [
    [
      'Se archiva porque el contrato señalado fue revisado en la auditoría ficticia AF-01 y se comprobó la entrega completa de los bienes.',
      'insufficient_information',
    ],
    [
      'Se canaliza a la autoridad municipal de Villa Ejemplo, competente para el trámite de licencias descrito.',
      'channeled',
    ],
    [
      'Se acumula al expediente CEF-INV-0012, que investiga los mismos hechos del pago de viáticos.',
      'joined',
    ],
    [
      'Se concluye con informe de presunta responsabilidad por falta no grave; se turna a la autoridad substanciadora ficticia.',
      'attended',
    ],
    [
      'Se archiva tras requerir información en dos ocasiones sin respuesta del buzón; se reabrirá si llegan nuevos indicios (art. 100).',
      'insufficient_information',
    ],
  ];
  return texts.map(([text, reason], index) => ({
    id: `case.queretaro-control-0${index + 1}`,
    authorityId: 'authority.comptroller-queretaro',
    fileNumber: `CEF-INV-00${20 + index}`,
    issuedOn: scenarioDay(-200 + 30 * index),
    reason,
    text,
    qualification: null,
    caseRef: null,
  }));
}

const MARTA_NARRATIVE =
  'En marzo de 2026 el Departamento de Compras del Instituto Federal Ficticio de Equipamiento adjudicó de forma directa el contrato IFFE-AD-2026-0042 (ocds-fict00-IFFE-AD-2026-0042) a Comercializadora Ficticia Ejemplo, S.A. de C.V., por 1,480,000 pesos, para comprar equipo de cómputo.';

/** Verificaciones de case.marta con las fuentes sintéticas: contrato en S6 y proveedor en la 69-B. */
export function martaVerifications(): Verification[] {
  const sources = createSyntheticSources({ today: scenarioDay(31) });
  const [claim] = extractContractClaims(MARTA_NARRATIVE);
  if (claim === undefined) throw new Error('El relato de Marta debe citar un contrato.');
  const contract = verifyCitedContract({
    source: sources.s6,
    matrix: sources.matrix,
    stateCode: '00',
    claim,
    date: '2026-03',
  });
  const suppliers =
    contract.record === null ? [] : checkContractSuppliers(sources.taxList, contract.record);
  return [contract, ...suppliers];
}

/**
 * case.marta tal como lo ve el OIC el día 31 (sin identidad: solo hechos, pruebas y verificaciones).
 * El día 30 el OIC califica la falta grave como no grave sin haber registrado el inicio del
 * procedimiento; contra esa calificación procede la inconformidad (LGRA, art. 102).
 */
export function martaCase(): CaseRecord {
  return {
    caseRef: 'case.marta',
    authorityId: 'authority.oic-iffe',
    offenseCode: 'LGRA-59',
    receivedOn: scenarioDay(0),
    occurredPeriod: '2026-03',
    attachments: [
      { label: 'Foto de la cotización usada para justificar el precio (copia limpia)' },
    ],
    independentReporters: 2,
    verifications: martaVerifications(),
    accusedKey: 'accused.purchasing-head',
    supplierKeys: ['XAXX260101EJ1'],
    campaignGroupId: null,
    isReporterIdentifiable: true,
    activities: [
      { on: scenarioDay(1), kind: 'accepted', hasContent: true },
      { on: scenarioDay(30), kind: 'qualification', hasContent: true },
    ],
  };
}

/** Calificación de case.marta como no grave (día 30, plantilla, expediente OIC-IFFE-INV-0032). */
export function martaQualification(): ClosureAct {
  return {
    id: 'qualification.marta',
    authorityId: 'authority.oic-iffe',
    fileNumber: 'OIC-IFFE-INV-0032',
    issuedOn: scenarioDay(30),
    reason: null,
    text: templateQualificationText('OIC-IFFE-INV-0032'),
    qualification: 'no-grave',
    caseRef: 'case.marta',
    kind: 'qualification',
  };
}

/** case.queretaro-dormant: aceptada el día 0 sin actuaciones posteriores. */
export function dormantCase(): CaseRecord {
  return {
    caseRef: 'case.queretaro-dormant',
    authorityId: 'authority.comptroller-queretaro',
    offenseCode: 'LGRA-49',
    receivedOn: scenarioDay(0),
    occurredPeriod: '2026-09',
    attachments: [],
    independentReporters: 1,
    verifications: [],
    accusedKey: null,
    supplierKeys: [],
    campaignGroupId: null,
    isReporterIdentifiable: false,
    activities: [{ on: scenarioDay(0), kind: 'accepted', hasContent: true }],
  };
}
