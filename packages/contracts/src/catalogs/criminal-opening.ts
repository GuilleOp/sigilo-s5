// Fundamento de la apertura de identidad en la vía penal. En el proceso penal el resguardo de la
// identidad de la víctima u ofendido es la excepción que decide la ley o el Órgano jurisdiccional
// (CNPP, art. 109 fr. XXVI); en SIGILO es la regla. Para no estorbar a la defensa sin abrir por
// costumbre, una apertura en la vía penal exige elegir un fundamento de esta lista y citar el
// número de la resolución jurisdiccional o del requerimiento ministerial. El texto resultante es
// el `legalBasis` de siempre (la persona denunciante lo lee tal cual y queda en la bitácora), así
// que el contrato de la API y los eventos no cambian.
import { findLegalStage } from './procedure.ts';

/** Fundamentos admitidos para abrir una identidad en la vía penal. */
export const CRIMINAL_OPENING_GROUNDS = [
  {
    key: 'cnpp_109_xxvi',
    label: 'CNPP art. 109 fr. XXVI / resolución del Órgano jurisdiccional',
    help: 'El Órgano jurisdiccional resolvió sobre el resguardo de la identidad y ordena darla a conocer, salvaguardando los derechos de la defensa.',
  },
  {
    key: 'cnpp_218_220_defensa',
    label: 'CNPP arts. 218 a 220 / resolución del Juez de control sobre el acceso de la defensa',
    help: 'El Juez de control resolvió que la defensa debe conocer el dato y fijó hasta dónde se levanta la reserva.',
  },
  {
    key: 'cnpp_131_ix_ministerio_publico',
    label: 'CNPP art. 131 fr. IX / requerimiento fundado y motivado del Ministerio Público',
    help: 'El Ministerio Público requirió el dato por escrito, con número de carpeta de investigación.',
  },
] as const;

export type CriminalOpeningGroundKey = (typeof CRIMINAL_OPENING_GROUNDS)[number]['key'];

/** Longitud mínima y máxima del número de la resolución o del requerimiento. */
export const MIN_RESOLUTION_REFERENCE = 3;
export const MAX_RESOLUTION_REFERENCE = 80;

/** Longitud mínima del motivo que acompaña al fundamento. */
export const MIN_CRIMINAL_OPENING_REASON = 20;

/** Número de resolución, causa o carpeta: letras, dígitos, espacios y `/ - . _ º°`. */
const REFERENCE_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} /.\-_º°]*$/u;

const PREFIX = 'Vía penal. Fundamento: ';
const REFERENCE_MARK = '. Resolución: ';
const REASON_MARK = '. Motivo: ';

/** Datos de una apertura en la vía penal. */
export interface CriminalOpeningBasis {
  ground: CriminalOpeningGroundKey;
  /** Número de la resolución jurisdiccional o del requerimiento ministerial. */
  resolutionReference: string;
  /** Motivo concreto de la apertura. */
  reason: string;
}

/** Indica si la etapa legal es del proceso penal (vía penal: fiscalía y tribunal penal). */
export function isCriminalStage(stage: string | null | undefined): boolean {
  return stage != null && findLegalStage(stage)?.track === 'criminal';
}

/** Fundamento por clave, o `undefined` si no existe. */
export function findCriminalOpeningGround(key: string) {
  return CRIMINAL_OPENING_GROUNDS.find((ground) => ground.key === key);
}

/** Problema de un fundamento en la vía penal: el campo que falla y qué decir. */
export interface CriminalOpeningBasisProblem {
  field: keyof CriminalOpeningBasis;
  message: string;
}

/** Primer problema de un fundamento en la vía penal, o `null` si es válido. */
export function criminalOpeningBasisProblem(
  basis: CriminalOpeningBasis,
): CriminalOpeningBasisProblem | null {
  if (findCriminalOpeningGround(basis.ground) === undefined) {
    return { field: 'ground', message: 'Elige el fundamento de la apertura en la vía penal.' };
  }
  const reference = basis.resolutionReference.trim();
  if (
    reference.length < MIN_RESOLUTION_REFERENCE ||
    reference.length > MAX_RESOLUTION_REFERENCE ||
    !REFERENCE_PATTERN.test(reference)
  ) {
    return {
      field: 'resolutionReference',
      message: `Escribe el número de la resolución o del requerimiento (de ${MIN_RESOLUTION_REFERENCE} a ${MAX_RESOLUTION_REFERENCE} caracteres; letras, números, espacios y / - .).`,
    };
  }
  if (basis.reason.trim().length < MIN_CRIMINAL_OPENING_REASON) {
    return {
      field: 'reason',
      message: `Escribe el motivo (al menos ${MIN_CRIMINAL_OPENING_REASON} caracteres).`,
    };
  }
  return null;
}

/** Mensaje del primer problema de un fundamento en la vía penal, o `null` si es válido. */
export function criminalOpeningBasisError(basis: CriminalOpeningBasis): string | null {
  return criminalOpeningBasisProblem(basis)?.message ?? null;
}

/**
 * Texto del fundamento (`legalBasis`) de una apertura en la vía penal. Lanza si los datos no son
 * válidos (ver `criminalOpeningBasisError`).
 */
export function formatCriminalOpeningBasis(basis: CriminalOpeningBasis): string {
  const error = criminalOpeningBasisError(basis);
  const ground = findCriminalOpeningGround(basis.ground);
  if (error !== null || ground === undefined) throw new Error(error ?? 'Fundamento inválido.');
  return `${PREFIX}${ground.label}${REFERENCE_MARK}${basis.resolutionReference.trim()}${REASON_MARK}${basis.reason.trim()}`;
}

/**
 * Lee un `legalBasis` con la forma de `formatCriminalOpeningBasis`. Devuelve `null` si no la tiene
 * o si sus partes no son válidas. Seguridad: el nodo lo exige para solicitar una apertura cuando
 * la denuncia está en la vía penal.
 */
export function parseCriminalOpeningBasis(text: string): CriminalOpeningBasis | null {
  if (!text.startsWith(PREFIX)) return null;
  const rest = text.slice(PREFIX.length);
  const ground = CRIMINAL_OPENING_GROUNDS.find((item) =>
    rest.startsWith(`${item.label}${REFERENCE_MARK}`),
  );
  if (ground === undefined) return null;
  const afterGround = rest.slice(ground.label.length + REFERENCE_MARK.length);
  const reasonAt = afterGround.indexOf(REASON_MARK);
  if (reasonAt < 0) return null;
  const basis: CriminalOpeningBasis = {
    ground: ground.key,
    resolutionReference: afterGround.slice(0, reasonAt),
    reason: afterGround.slice(reasonAt + REASON_MARK.length),
  };
  const isCanonical =
    basis.resolutionReference === basis.resolutionReference.trim() &&
    basis.reason === basis.reason.trim();
  return isCanonical && criminalOpeningBasisError(basis) === null ? basis : null;
}
