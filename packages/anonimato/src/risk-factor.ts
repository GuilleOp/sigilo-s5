// Integra el grupo de anonimato al semáforo de Huella Cero (assessRisk) como un factor más.
// No cambia la API de @sigilo/huella: recibe su resultado y devuelve uno del mismo tipo.

import { THRESHOLD_HIGH, THRESHOLD_MEDIUM } from '@sigilo/huella/risk';
import type { RiskAssessment, RiskReason } from '@sigilo/huella/risk';
import type { AnonymityAssessment, AnonymityRisk } from './assess.ts';

/**
 * Pesos del factor en la escala de 0 a 100 de `assessRisk`. Un grupo pequeño solo no basta para
 * llegar a riesgo alto: sumado a un relato con datos identificables, sí. Sin datos se suma lo
 * suficiente para llegar a riesgo medio: no se supone seguridad.
 */
export const WEIGHT_ANONYMITY_HIGH = 35;
export const WEIGHT_ANONYMITY_MEDIUM = 15;
export const WEIGHT_ANONYMITY_UNKNOWN = THRESHOLD_MEDIUM;
export const WEIGHT_ANONYMITY_LOW = 0;

const WEIGHTS: Readonly<Record<AnonymityRisk, number>> = {
  high: WEIGHT_ANONYMITY_HIGH,
  medium: WEIGHT_ANONYMITY_MEDIUM,
  unknown: WEIGHT_ANONYMITY_UNKNOWN,
  low: WEIGHT_ANONYMITY_LOW,
};

/** Razón para el semáforo (mismo tipo que las de `assessRisk`) o `null` si no suma. */
export function anonymityRiskReason(assessment: AnonymityAssessment): RiskReason | null {
  const weight = WEIGHTS[assessment.risk];
  if (weight <= 0) return null;
  const text =
    assessment.risk === 'unknown'
      ? 'No tenemos datos para saber cuántas personas comparten tu ente o tu área. Por precaución, cuenta los hechos sin detalles que pocas personas conocen.'
      : assessment.risk === 'high'
        ? 'Pocas personas comparten tu ente o tu área: un detalle del relato puede bastar para saber quién denunció.'
        : 'Tu área o tu ente es un grupo mediano: los detalles del relato pueden reducirlo.';
  return { text, weight };
}

/**
 * Suma el factor del grupo de anonimato a una evaluación de `assessRisk` y vuelve a clasificar con
 * los mismos umbrales (`THRESHOLD_MEDIUM`, `THRESHOLD_HIGH`). Las razones quedan ordenadas por peso.
 */
export function withAnonymityFactor(
  risk: RiskAssessment,
  assessment: AnonymityAssessment,
): RiskAssessment {
  const reason = anonymityRiskReason(assessment);
  if (reason === null) return risk;
  const reasons = [...risk.reasons, reason].sort((a, b) => b.weight - a.weight);
  const score = Math.min(
    100,
    reasons.reduce((total, item) => total + item.weight, 0),
  );
  const level = score < THRESHOLD_MEDIUM ? 'low' : score < THRESHOLD_HIGH ? 'medium' : 'high';
  return { level, score, reasons };
}
