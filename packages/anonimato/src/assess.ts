// Evaluación del grupo de anonimato: cubeta, nivel en que se encontró, marca de contratación,
// riesgo y explicación en lenguaje sencillo. Nunca supone seguridad cuando faltan datos.

import { SPANISH_MONTHS } from '@sigilo/huella/months';
import { areaKey, institutionNameKey } from './normalize.ts';
import type { AnonymityData } from './loader.ts';
import type { AnonymityFragment, AreaRecord, BucketLabel, EnteRecord } from './fragment.ts';

/** Nivel en que se encontró el grupo que protege a la persona. */
export type AnonymityLevel = 'area' | 'ente' | 'government-order' | 'none';

/** Riesgo de que el grupo sea tan chico que el relato identifique a la persona. */
export type AnonymityRisk = 'high' | 'medium' | 'low' | 'unknown';

/** Acción sugerida. */
export type SuggestedActionKind = 'generalize-narrative' | 'defer-submission' | 'consider-custody';

export interface SuggestedAction {
  kind: SuggestedActionKind;
  text: string;
}

/** Datos que declara la persona. El área es opcional, en texto libre o elegida de `listAreas`. */
export interface AnonymityQuery {
  ente: string;
  area?: string;
}

/** Resultado de `assessAnonymityGroup`. */
export interface AnonymityAssessment {
  stateCode: string;
  stateName: string;
  bucket: BucketLabel | null;
  level: AnonymityLevel;
  /** Nombre publicado del grupo que protege (área, ente u «Otros entes…»); `null` sin datos. */
  groupName: string | null;
  /** El área (o, si no se encontró el área, el ente) aparece en S2; `null` sin datos. */
  isContracting: boolean | null;
  /** Se dio un área y no aparece entre las publicadas (k < 10, nombre suprimido o escrito distinto). */
  isAreaUnlisted: boolean;
  risk: AnonymityRisk;
  title: string;
  reasons: readonly string[];
  actions: readonly SuggestedAction[];
  /** Fecha de corte de los datos (AAAA-MM-DD) o `null`. */
  cutoffDate: string | null;
}

/** Etiqueta en español de cada riesgo, para la interfaz. */
export const ANONYMITY_RISK_LABELS: Readonly<Record<AnonymityRisk, string>> = {
  high: 'Alto',
  medium: 'Medio',
  low: 'Bajo',
  unknown: 'Desconocido',
};

/** Etiqueta en español de cada nivel. */
export const ANONYMITY_LEVEL_LABELS: Readonly<Record<AnonymityLevel, string>> = {
  area: 'Área',
  ente: 'Ente',
  'government-order': 'Orden de gobierno',
  none: 'Sin datos',
};

const BUCKET_TEXT: Readonly<Record<BucketLabel, string>> = {
  '1-4': 'menos de 5 personas',
  '5-9': 'entre 5 y 9 personas',
  '10-49': 'entre 10 y 49 personas',
  '50+': '50 personas o más',
};

const ACTIONS: Readonly<Record<SuggestedActionKind, string>> = {
  'generalize-narrative':
    'Cuenta los hechos sin detalles que pocas personas conocen: tu puesto, fechas u horas exactas o frases como «soy la única persona que…».',
  'defer-submission':
    'Si los hechos son recientes y pocas personas los vieron, puedes esperar unos días antes de enviar para que el envío no coincida con ellos.',
  'consider-custody':
    'Puedes considerar la custodia: la denuncia se guarda cifrada y se envía cuando más personas denuncian lo mismo.',
};

const ACTIONS_BY_RISK: Readonly<Record<AnonymityRisk, readonly SuggestedActionKind[]>> = {
  low: ['generalize-narrative'],
  medium: ['generalize-narrative', 'defer-submission'],
  high: ['generalize-narrative', 'defer-submission', 'consider-custody'],
  unknown: ['generalize-narrative', 'defer-submission', 'consider-custody'],
};

const TITLES: Readonly<Record<AnonymityRisk, string>> = {
  low: 'Tu grupo es amplio',
  medium: 'Tu grupo es mediano',
  high: 'Tu grupo es pequeño',
  unknown: 'No sabemos qué tan grande es tu grupo',
};

/** Fecha AAAA-MM-DD en español («7 de octubre de 2026»). */
export function formatSpanishDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(isoDate);
  if (match === null) return isoDate;
  const month = SPANISH_MONTHS[Number(match[2]) - 1];
  return month === undefined ? isoDate : `${Number(match[3])} de ${month} de ${match[1]}`;
}

/** Nombres de los entes publicados de la entidad, en orden alfabético, para elegir de una lista. */
export function listEntes(fragment: AnonymityFragment): string[] {
  return fragment.entes.map((ente) => ente.name).sort((a, b) => a.localeCompare(b, 'es'));
}

/** Áreas publicadas (k de al menos 10) de un ente; vacío si el ente no aparece. */
export function listAreas(fragment: AnonymityFragment, ente: string): string[] {
  return (findEnte(fragment, ente)?.areas ?? [])
    .map((area) => area.name)
    .sort((a, b) => a.localeCompare(b, 'es'));
}

const BUCKET_ORDER: readonly BucketLabel[] = ['1-4', '5-9', '10-49', '50+'];

/**
 * Busca un ente por su nombre normalizado igual que en datos/proceso. Si dos entes publicados
 * normalizan igual, se toma el de cubeta menor: subestimar el grupo es más seguro que inflarlo.
 */
export function findEnte(fragment: AnonymityFragment, name: string): EnteRecord | null {
  const key = institutionNameKey(name, fragment.stateCode);
  if (key === '') return null;
  let found: EnteRecord | null = null;
  for (const ente of fragment.entes) {
    if (institutionNameKey(ente.name, fragment.stateCode) !== key) continue;
    if (found === null || BUCKET_ORDER.indexOf(ente.bucket) < BUCKET_ORDER.indexOf(found.bucket))
      found = ente;
  }
  return found;
}

function findArea(ente: EnteRecord, name: string): AreaRecord | null {
  const key = areaKey(name);
  if (key === '') return null;
  let found: AreaRecord | null = null;
  for (const area of ente.areas) {
    if (areaKey(area.name) !== key) continue;
    if (found === null || BUCKET_ORDER.indexOf(area.bucket) < BUCKET_ORDER.indexOf(found.bucket))
      found = area;
  }
  return found;
}

function sizeRisk(bucket: BucketLabel): AnonymityRisk {
  return bucket === '50+' ? 'low' : bucket === '10-49' ? 'medium' : 'high';
}

function dataSentence(cutoffDate: string | null): string {
  return cutoffDate === null
    ? 'Contamos personas con declaración pública reciente (S1); no es un padrón exacto del personal.'
    : `Contamos personas con declaración pública reciente (S1), con datos al ${formatSpanishDate(cutoffDate)}; no es un padrón exacto del personal.`;
}

const CONTRACTING_REASON =
  'Aparece en el registro público de personas que intervienen en contrataciones (S2), donde se publican nombres y puestos: quien conoce el área puede saber quiénes trabajan en ella.';

function build(
  base: Pick<AnonymityAssessment, 'stateCode' | 'stateName' | 'cutoffDate'>,
  fields: Omit<AnonymityAssessment, 'stateCode' | 'stateName' | 'cutoffDate' | 'title' | 'actions'>,
): AnonymityAssessment {
  return {
    ...base,
    ...fields,
    title: TITLES[fields.risk],
    actions: ACTIONS_BY_RISK[fields.risk].map((kind) => ({ kind, text: ACTIONS[kind] })),
  };
}

/**
 * Evalúa el grupo de anonimato de quien trabaja (o trabajó) en un ente. Regla del fragmento: si el
 * área aparece, el grupo es el área; si no, el ente (si protege por sí mismo); si no, el grupo de
 * otros entes del mismo orden de gobierno. Sin datos de la entidad o sin el ente, el riesgo es
 * `unknown` y el texto lo dice; nunca se supone un grupo grande.
 */
export function assessAnonymityGroup(
  data: AnonymityData,
  query: AnonymityQuery,
): AnonymityAssessment {
  if (data.kind === 'no-data') {
    return build(
      { stateCode: data.stateCode, stateName: data.stateName, cutoffDate: data.cutoffDate },
      {
        bucket: null,
        level: 'none',
        groupName: null,
        isContracting: null,
        isAreaUnlisted: false,
        risk: 'unknown',
        reasons: [
          `No tenemos datos de declaraciones públicas de ${data.stateName}, así que no podemos estimar cuántas personas comparten tu ente o tu área.`,
          'Por precaución, escribe como si tu grupo fuera pequeño.',
        ],
      },
    );
  }
  const { fragment, cutoffDate } = data;
  const base = { stateCode: fragment.stateCode, stateName: fragment.stateName, cutoffDate };
  const ente = findEnte(fragment, query.ente);
  if (ente === null) {
    return build(base, {
      bucket: null,
      level: 'none',
      groupName: null,
      isContracting: null,
      isAreaUnlisted: false,
      risk: 'unknown',
      reasons: [
        `No encontramos ese ente en los datos de ${fragment.stateName}. Puede estar escrito de otra forma o no tener declaraciones publicadas.`,
        'Por precaución, escribe como si tu grupo fuera pequeño.',
      ],
    });
  }

  const areaText = query.area?.trim() ?? '';
  const isAreaGiven = areaKey(areaText) !== '';
  const area = isAreaGiven ? findArea(ente, areaText) : null;
  if (area !== null) {
    const risk = sizeRisk(area.bucket);
    return build(base, {
      bucket: area.bucket,
      level: 'area',
      groupName: area.name,
      isContracting: area.isContracting,
      isAreaUnlisted: false,
      risk,
      reasons: [
        `En «${area.name}» hay ${BUCKET_TEXT[area.bucket]}.`,
        risk === 'low'
          ? 'Es un grupo amplio, pero un detalle que pocas personas conocen puede reducirlo.'
          : 'Un detalle que pocas personas conocen puede reducir mucho ese grupo.',
        ...(area.isContracting ? [CONTRACTING_REASON] : []),
        dataSentence(cutoffDate),
      ],
    });
  }

  const isAreaUnlisted = isAreaGiven;
  const unlistedReason =
    'Tu área no aparece entre las que tienen al menos 10 personas: puede ser un área pequeña o estar escrita de otra forma. Si el relato deja ver tu área, el grupo real puede ser chico.';
  if (ente.poolIndex === null) {
    const risk: AnonymityRisk = isAreaUnlisted
      ? ente.bucket === '50+'
        ? 'medium'
        : 'high'
      : sizeRisk(ente.bucket);
    return build(base, {
      bucket: ente.bucket,
      level: 'ente',
      groupName: ente.name,
      isContracting: ente.isContracting,
      isAreaUnlisted,
      risk,
      reasons: [
        ...(isAreaUnlisted ? [unlistedReason] : []),
        `En «${ente.name}» hay ${BUCKET_TEXT[ente.bucket]}.`,
        ...(isAreaGiven
          ? []
          : ['No indicaste tu área: si el relato la deja ver, el grupo puede ser menor.']),
        ...(ente.isContracting ? [CONTRACTING_REASON] : []),
        dataSentence(cutoffDate),
      ],
    });
  }

  const pool = fragment.pools[ente.poolIndex];
  return build(base, {
    bucket: pool?.bucket ?? null,
    level: 'government-order',
    groupName: pool?.name ?? null,
    isContracting: ente.isContracting,
    isAreaUnlisted,
    risk: 'high',
    reasons: [
      `En «${ente.name}» hay ${BUCKET_TEXT[ente.bucket]}. Si el relato deja ver que trabajas ahí, es más fácil saber quién denunció.`,
      pool !== undefined && pool.isProtective
        ? `Solo te protege el grupo más amplio («${pool.name}», ${BUCKET_TEXT[pool.bucket]}) si el relato no menciona tu ente.`
        : 'Incluso el grupo de otros entes parecidos es pequeño.',
      ...(ente.isContracting ? [CONTRACTING_REASON] : []),
      dataSentence(cutoffDate),
    ],
  });
}

/** Texto plano con el título, las razones y las acciones, para leer en voz alta o copiar. */
export function describeAssessment(assessment: AnonymityAssessment): string {
  return [
    `${assessment.title}.`,
    ...assessment.reasons,
    'Qué puedes hacer:',
    ...assessment.actions.map((action) => `- ${action.text}`),
  ].join('\n');
}
