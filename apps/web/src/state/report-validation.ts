// Validación por paso del borrador y conversión a los hechos del contrato.
import { ComplaintFactsSchema, MAX_EVIDENCE_ITEMS } from '@sigilo/contracts';
import type { ComplaintFacts } from '@sigilo/contracts';
import type { ReportDraft } from './report-draft.ts';

/** Errores por campo: identificador del campo y mensaje en español. */
export type FieldErrors = Record<string, string>;

/** Máximo de testigos en el bloque de identidad. */
export const MAX_WITNESSES = 10;

/** Testigos escritos uno por línea. */
export function witnessLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Paso "Modo": elegir modo y, si es sellado, el nombre. */
export function validateModeStep(draft: ReportDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (draft.mode === null) errors['mode'] = 'Elige cómo quieres denunciar.';
  if (draft.mode === 'sealed') {
    const name = draft.identity.fullName.trim();
    if (name === '') errors['fullName'] = 'Escribe tu nombre. Viajará cifrado.';
    else if (name.length > 200) errors['fullName'] = 'El nombre no puede pasar de 200 caracteres.';
    if (draft.identity.contact.length > 200) {
      errors['contact'] = 'El medio de contacto no puede pasar de 200 caracteres.';
    }
    const witnesses = witnessLines(draft.identity.witnesses);
    if (witnesses.length > MAX_WITNESSES) {
      errors['witnesses'] = `Puedes indicar hasta ${MAX_WITNESSES} testigos.`;
    } else if (witnesses.some((line) => line.length > 500)) {
      errors['witnesses'] = 'Cada testigo puede ocupar hasta 500 caracteres.';
    }
  }
  return errors;
}

/** Paso "Hechos". `now` permite rechazar periodos futuros. */
export function validateFactsStep(draft: ReportDraft, now: Date = new Date()): FieldErrors {
  const errors: FieldErrors = {};
  const { facts } = draft;
  if (facts.stateCode === '') errors['stateCode'] = 'Elige la entidad federativa.';
  if (facts.entityId === '') errors['entityId'] = 'Elige el ente público.';
  if (facts.offenseCode === '') errors['offenseCode'] = 'Elige la conducta que más se parece.';
  if (facts.periodMonth === '' || facts.periodYear === '') {
    errors['period'] = 'Elige el mes y el año aproximados.';
  } else {
    const period = Number(facts.periodYear) * 12 + Number(facts.periodMonth);
    if (period > now.getFullYear() * 12 + now.getMonth() + 1) {
      errors['period'] = 'El periodo no puede ser posterior al mes actual.';
    }
  }
  const accused = facts.accused.trim();
  if (accused === '') errors['accused'] = 'Escribe el nombre o el cargo de la persona denunciada.';
  else if (accused.length > 2000)
    errors['accused'] = 'Este campo no puede pasar de 2000 caracteres.';
  const description = facts.description.trim();
  if (description.length < 20) {
    errors['description'] = 'Describe los hechos con al menos 20 caracteres.';
  } else if (description.length > 10000) {
    errors['description'] = 'La descripción no puede pasar de 10 000 caracteres.';
  }
  return errors;
}

/** Imágenes limpias que se enviarán. */
export function cleanImageCount(draft: ReportDraft): number {
  return draft.evidence.reduce((total, item) => total + item.clean.length, 0);
}

/** Paso "Pruebas": todas limpias y dentro del máximo. */
export function validateEvidenceStep(draft: ReportDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (draft.evidence.some((item) => item.status !== 'clean')) {
    errors['evidence'] = 'Limpia o quita todas las pruebas antes de continuar.';
  } else if (cleanImageCount(draft) > MAX_EVIDENCE_ITEMS) {
    errors['evidence'] =
      `Puedes enviar hasta ${MAX_EVIDENCE_ITEMS} imágenes (cada página de un PDF cuenta).`;
  }
  return errors;
}

/** Convierte los hechos al contrato; `null` si aún no son válidos. */
export function toComplaintFacts(draft: ReportDraft): ComplaintFacts | null {
  const { facts } = draft;
  const candidate = {
    stateCode: facts.stateCode,
    ...(facts.municipalityCode === '' ? {} : { municipalityCode: facts.municipalityCode }),
    entityId: facts.entityId,
    offenseCode: facts.offenseCode,
    occurredPeriod: `${facts.periodYear}-${facts.periodMonth}`,
    accused: facts.accused.trim(),
    description: facts.description.trim(),
  };
  const parsed = ComplaintFactsSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
