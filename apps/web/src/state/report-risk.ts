// Señales de riesgo del borrador para el semáforo y acciones concretas para corregirlas.
import { findInvisibleCharacters, isWorkHours, reviewText } from '@sigilo/huella';
import type { RiskSignals } from '@sigilo/huella';
import type { ReportDraft } from './report-draft.ts';

/** Acción que la interfaz ofrece para bajar el riesgo. */
export type RiskActionKind =
  'go-evidence' | 'go-facts' | 'strip-invisible' | 'remove-municipality' | 'advice';

/** Acción con su texto. */
export interface RiskAction {
  kind: RiskActionKind;
  text: string;
}

/**
 * Caracteres invisibles o de otro alfabeto en los campos de texto que llegan a la autoridad.
 * Las comillas y rayas tipográficas (que el teclado del celular pone solas) no cuentan: no marcan
 * a nadie y se normalizan al construir los hechos.
 */
export function invisibleCount(draft: ReportDraft): number {
  const options = { shouldNormalizeTypography: false };
  return (
    findInvisibleCharacters(draft.facts.description, options).count +
    findInvisibleCharacters(draft.facts.accused, options).count
  );
}

/** Construye las señales para `assessRisk`. */
export function buildRiskSignals(draft: ReportDraft, now: Date = new Date()): RiskSignals {
  return {
    mode: draft.mode ?? 'anonymous',
    evidence: draft.evidence.map((item) => ({
      hadGps: item.metadata?.gps !== undefined,
      hadDevice: item.metadata?.device !== undefined,
      sanitized: item.status === 'clean',
    })),
    textFindings: reviewText(draft.facts.description),
    invisibleCharacters: invisibleCount(draft),
    locationPrecision: draft.facts.municipalityCode === '' ? 'state' : 'municipality',
    localTime: now,
  };
}

/** Acciones para corregir cada señal presente. */
export function buildRiskActions(signals: RiskSignals): RiskAction[] {
  const actions: RiskAction[] = [];
  if (signals.evidence.some((item) => !item.sanitized)) {
    actions.push({ kind: 'go-evidence', text: 'Limpia tus pruebas antes de enviarlas.' });
  }
  if (signals.textFindings.length > 0) {
    actions.push({ kind: 'go-facts', text: 'Revisa los datos subrayados en tu descripción.' });
  }
  if (signals.invisibleCharacters > 0) {
    actions.push({
      kind: 'strip-invisible',
      text: 'Eliminar los caracteres invisibles del texto.',
    });
  }
  if (signals.locationPrecision === 'municipality') {
    actions.push({
      kind: 'remove-municipality',
      text: 'Quitar el municipio y dejar solo el estado.',
    });
  }
  if (signals.localTime !== undefined && isWorkHours(signals.localTime)) {
    actions.push({
      kind: 'advice',
      text: 'Si estás conectado a la red de tu trabajo, envía la denuncia más tarde desde otra red.',
    });
  }
  return actions;
}
