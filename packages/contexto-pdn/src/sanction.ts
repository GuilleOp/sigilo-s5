// Verificación de sanciones declaradas por la autoridad contra S3 y regla de «sanción no verificable».
// Solo lo confirmado cuenta como verificado; la ausencia en S3 nunca contradice a la autoridad.

import { noCoverage } from './alternatives.ts';
import { citeSource, daysBetween, formatDataDate } from './citation.ts';
import { assessCoverage } from './coverage.ts';
import type { CoverageMatrix } from './coverage.ts';
import { institutionRefKey, personNameKey, SANCTION_LABELS, sanctionKindsOf } from './names.ts';
import type {
  Difference,
  Evidence,
  SanctionRecord,
  SanctionsSource,
  Verification,
} from './types.ts';

/** Sanción que la autoridad declaró en un cierre o informe. */
export interface SanctionClaim {
  fileNumber: string;
  personName: string;
  /** Sanción en texto libre («suspensión de 30 días»). */
  sanction: string;
  /** Institución de la persona sancionada (la que debe estar conectada a S3). */
  institution: string;
  stateCode: string;
  /** Fecha en que la autoridad declaró la sanción (AAAA-MM-DD). */
  declaredOn: string;
}

function labelKinds(kinds: readonly string[]): string {
  return kinds.map((kind) => SANCTION_LABELS[kind] ?? kind.toLowerCase()).join(', ');
}

function sanctionEvidence(record: SanctionRecord, source: SanctionsSource): Evidence[] {
  const citation = citeSource(source.info);
  return [
    { label: 'Expediente', value: record.fileNumber, citation },
    {
      label: 'Sanción registrada',
      value: record.sanctionText || labelKinds(record.sanctions),
      citation,
    },
    ...(record.resolutionDate === null
      ? []
      : [{ label: 'Resolución', value: formatDataDate(record.resolutionDate), citation }]),
    ...(record.authority === ''
      ? []
      : [{ label: 'Autoridad que resolvió', value: record.authority, citation }]),
  ];
}

/**
 * Verifica una sanción declarada contra S3. `confirmed` si el expediente coincide en persona y tipo
 * de sanción; `contradicted` si el expediente existe y dice otra cosa; `no_coverage` si la fuente
 * no cubre la entidad o la institución, o si el expediente no aparece.
 */
export function verifySanction(input: {
  source: SanctionsSource;
  matrix: CoverageMatrix;
  claim: SanctionClaim;
}): Verification {
  const { source, matrix, claim } = input;
  const coverage = assessCoverage({
    matrix,
    source,
    stateCode: claim.stateCode,
    institution: claim.institution,
  });
  if (!coverage.isCovered) {
    return noCoverage(
      'sanction',
      source.info,
      coverage.reason,
      coverage.detail,
      'No podemos comprobarlo. Que no aparezca no significa que la sanción no exista.',
    );
  }
  // Solo cuentan los expedientes de la misma entidad y, cuando el registro trae la clave de su
  // institución, de la misma institución: los números de expediente se repiten entre entes.
  const claimKey = institutionRefKey(claim.institution, claim.stateCode);
  const inState = source
    .findByFileNumber(claim.fileNumber, claim.stateCode)
    .filter((record) => record.stateCode === claim.stateCode);
  const records = inState.some((record) => record.institutionKey)
    ? inState.filter((record) => !record.institutionKey || record.institutionKey === claimKey)
    : inState;
  const unverifiableTitle =
    'No podemos comprobarlo. Que no aparezca no significa que la sanción no exista.';
  if (records.length === 0) {
    return noCoverage(
      'sanction',
      source.info,
      'record-not-found',
      inState.length === 0
        ? `No encontramos el expediente ${claim.fileNumber} en esta entidad.`
        : `El expediente ${claim.fileNumber} existe en la entidad, pero es de otra institución.`,
      unverifiableTitle,
    );
  }
  const citation = citeSource(source.info);
  const claimedKinds = sanctionKindsOf(claim.sanction);
  const person = personNameKey(claim.personName);
  const samePerson = records.filter((record) => personNameKey(record.fullName) === person);
  const match = samePerson.find((record) =>
    claimedKinds.every((kind) => record.sanctions.includes(kind)),
  );
  if (match !== undefined) {
    return {
      check: 'sanction',
      outcome: 'confirmed',
      title: 'Confirmada en el registro público de sanciones',
      explanation: `El expediente ${match.fileNumber} registra ${labelKinds(match.sanctions)} para la persona señalada (${citation.text}). Por posibles homónimos, revisa el expediente.`,
      evidence: sanctionEvidence(match, source),
      citations: [citation],
    };
  }
  if (samePerson.length === 0 && records.length > 1) {
    // Varios registros de otras personas con el mismo número: no se elige uno a ciegas.
    return noCoverage(
      'sanction',
      source.info,
      'ambiguous-record',
      `Encontramos ${records.length} registros con el expediente ${claim.fileNumber}.`,
      unverifiableTitle,
    );
  }
  const compared = samePerson.length > 0 ? samePerson : records;
  const record = compared[0] as SanctionRecord;
  const differences: Difference[] = [];
  if (samePerson.length === 0) {
    differences.push({
      field: 'person',
      claimed: claim.personName,
      recorded: 'otra persona',
      text: 'el expediente corresponde a otra persona',
    });
  }
  const recordedKinds = [...new Set(compared.flatMap((item) => item.sanctions))];
  const recordedText =
    compared
      .map((item) => item.sanctionText)
      .filter(Boolean)
      .join('; ') || labelKinds(recordedKinds);
  if (!claimedKinds.every((kind) => recordedKinds.includes(kind))) {
    differences.push({
      field: 'sanction',
      claimed: claim.sanction,
      recorded: recordedText,
      text: `la autoridad declaró ${claim.sanction} y el registro dice ${recordedText}`,
    });
  }
  return {
    check: 'sanction',
    outcome: 'contradicted',
    title: 'El registro público de sanciones dice otra cosa',
    explanation: `En el expediente ${record.fileNumber}, ${differences.map((item) => item.text).join('; ')} (${citation.text}).`,
    differences,
    evidence: sanctionEvidence(record, source),
    citations: [citation],
  };
}

/** Configuración de la regla de rendición de cuentas (parámetro del prototipo, publicado). */
export interface UnverifiableSanctionConfig {
  /** Días naturales que se esperan entre la declaración y su publicación en S3. */
  publicationDeadlineDays: number;
}

export const DEFAULT_UNVERIFIABLE_SANCTION_CONFIG: UnverifiableSanctionConfig = {
  publicationDeadlineDays: 30,
};

/** Resultado de la regla «sanción no verificable». */
export interface UnverifiableSanctionFlag {
  isFlagged: boolean;
  /** Clave estable de la señal, para la bitácora y el escalamiento. */
  signal: 'accountability.sanction-unverifiable';
  explanation: string;
}

/**
 * Marca «sanción no verificable» SOLO si la autoridad declaró una sanción, la fuente cubre a esa
 * institución (el resultado es `record-not-found`, no otro motivo) y ya pasó el plazo de
 * publicación. No dice que la sanción no exista: dice que no se puede verificar.
 */
export function checkUnverifiableSanction(input: {
  claim: SanctionClaim | null;
  verification: Verification;
  today: string;
  config?: UnverifiableSanctionConfig;
}): UnverifiableSanctionFlag {
  const { claim, verification, today } = input;
  const deadline = (input.config ?? DEFAULT_UNVERIFIABLE_SANCTION_CONFIG).publicationDeadlineDays;
  const signal = 'accountability.sanction-unverifiable';
  if (claim === null || claim.sanction.trim() === '') {
    return { isFlagged: false, signal, explanation: 'La autoridad no declaró una sanción.' };
  }
  if (verification.outcome !== 'no_coverage' || verification.reason !== 'record-not-found') {
    return {
      isFlagged: false,
      signal,
      explanation:
        verification.outcome === 'no_coverage'
          ? 'La fuente no cubre a esta institución o entidad: no se puede exigir que la sanción aparezca.'
          : 'La sanción tiene un registro en la fuente.',
    };
  }
  const elapsed = daysBetween(claim.declaredOn, today);
  if (elapsed <= deadline) {
    return {
      isFlagged: false,
      signal,
      explanation: `Han pasado ${elapsed} días de los ${deadline} que se esperan para su publicación.`,
    };
  }
  return {
    isFlagged: true,
    signal,
    explanation: `Sanción no verificable: la autoridad la declaró el ${formatDataDate(claim.declaredOn)}, la fuente cubre a ${claim.institution} y, ${elapsed} días después (plazo de ${deadline}), el expediente ${claim.fileNumber} no aparece (${verification.citations.map((item) => item.text).join('; ')}). No significa que la sanción no exista.`,
  };
}
