// Evaluación del riesgo de reidentificación a partir de las señales que recoge Huella Cero.
// El resultado orienta a la persona; no es una medida exacta ni una garantía.

import type { TextFinding } from './text-review.ts';

/** Estado de una prueba adjunta. */
export interface EvidenceSignal {
  hadGps: boolean;
  hadDevice: boolean;
  sanitized: boolean;
}

/** Señales que alimentan la evaluación. */
export interface RiskSignals {
  mode: 'anonymous' | 'sealed';
  evidence: EvidenceSignal[];
  textFindings: TextFinding[];
  invisibleCharacters: number;
  locationPrecision: 'state' | 'municipality';
  /** Hora local del dispositivo al enviar; si falta, no se evalúa el horario laboral. */
  localTime?: Date;
}

/** Una razón que suma al puntaje, en lenguaje claro para la persona usuaria. */
export interface RiskReason {
  text: string;
  weight: number;
}

/** Resultado de `assessRisk`. Las razones se ordenan de mayor a menor peso. */
export interface RiskAssessment {
  level: 'low' | 'medium' | 'high';
  score: number;
  reasons: RiskReason[];
}

// Pesos. Una sola señal grave basta para llegar a riesgo medio o alto.
/** Prueba sin limpiar que conserva coordenadas GPS: revela dónde se tomó la foto. */
export const WEIGHT_UNSANITIZED_GPS = 45;
/** Prueba sin limpiar que conserva marca, modelo o número de serie del equipo. */
export const WEIGHT_UNSANITIZED_DEVICE = 30;
/** Prueba sin limpiar, aunque no se hayan visto GPS ni equipo (puede haber otros metadatos). */
export const WEIGHT_UNSANITIZED_OTHER = 10;
/** Cada hallazgo de gravedad alta en el texto (correo, CURP, «soy el único», etc.). */
export const WEIGHT_TEXT_HIGH = 25;
/** Cada fecha u hora exacta en el texto. */
export const WEIGHT_TEXT_MEDIUM = 8;
/** Cada posible nombre propio en el texto. */
export const WEIGHT_TEXT_LOW = 3;
/** Tope de la suma por gravedad del texto, para que muchos hallazgos leves no dominen. */
export const CAP_TEXT_HIGH = 60;
export const CAP_TEXT_MEDIUM = 24;
export const CAP_TEXT_LOW = 9;
/** Texto con caracteres invisibles: puede venir de un documento marcado para rastrear filtraciones. */
export const WEIGHT_INVISIBLE_CHARACTERS = 20;
/** Ubicación a nivel municipio en lugar de estado: reduce el universo de posibles denunciantes. */
export const WEIGHT_MUNICIPALITY = 5;
/** Envío en horario laboral: la conexión podría pasar por la red de la dependencia. */
export const WEIGHT_WORK_HOURS = 10;
/** Umbrales: menor que `THRESHOLD_MEDIUM` es bajo; menor que `THRESHOLD_HIGH` es medio. */
export const THRESHOLD_MEDIUM = 25;
export const THRESHOLD_HIGH = 60;

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${pluralForm}`;
}

function isWorkHours(date: Date): boolean {
  const day = date.getDay();
  const hour = date.getHours();
  return day >= 1 && day <= 5 && hour >= 8 && hour < 18;
}

/**
 * Calcula un puntaje de 0 a 100 sumando pesos fijos y lo clasifica en bajo, medio o alto.
 * El modo (`anonymous` o `sealed`) no cambia el puntaje: en ambos casos el texto y las pruebas
 * llegan a quien tramita la denuncia y pueden delatar a la persona.
 */
export function assessRisk(signals: RiskSignals): RiskAssessment {
  const reasons: RiskReason[] = [];
  const add = (text: string, weight: number): void => {
    if (weight > 0) reasons.push({ text, weight });
  };

  const unsanitized = signals.evidence.filter((item) => !item.sanitized);
  const withGps = unsanitized.filter((item) => item.hadGps).length;
  const withDevice = unsanitized.filter((item) => !item.hadGps && item.hadDevice).length;
  const other = unsanitized.length - withGps - withDevice;
  add(
    `${plural(withGps, 'prueba sin limpiar conserva', 'pruebas sin limpiar conservan')} la ubicación GPS de donde se tomó.`,
    withGps * WEIGHT_UNSANITIZED_GPS,
  );
  add(
    `${plural(withDevice, 'prueba sin limpiar conserva', 'pruebas sin limpiar conservan')} la marca o el modelo de tu equipo.`,
    withDevice * WEIGHT_UNSANITIZED_DEVICE,
  );
  add(
    `${plural(other, 'prueba no se ha limpiado', 'pruebas no se han limpiado')} y podría conservar datos ocultos.`,
    other * WEIGHT_UNSANITIZED_OTHER,
  );

  const bySeverity = (severity: TextFinding['severity']): number =>
    signals.textFindings.filter((finding) => finding.severity === severity).length;
  const high = bySeverity('high');
  const medium = bySeverity('medium');
  const low = bySeverity('low');
  add(
    `Tu texto incluye ${plural(high, 'dato que podría identificarte', 'datos que podrían identificarte')} directamente.`,
    Math.min(CAP_TEXT_HIGH, high * WEIGHT_TEXT_HIGH),
  );
  add(
    `Tu texto incluye ${plural(medium, 'fecha u hora exacta', 'fechas u horas exactas')}.`,
    Math.min(CAP_TEXT_MEDIUM, medium * WEIGHT_TEXT_MEDIUM),
  );
  add(
    `Tu texto menciona ${plural(low, 'posible nombre de persona', 'posibles nombres de personas')}.`,
    Math.min(CAP_TEXT_LOW, low * WEIGHT_TEXT_LOW),
  );

  if (signals.invisibleCharacters > 0) {
    add(
      'El texto tenía caracteres invisibles o letras de otro alfabeto; podría venir de un documento marcado para rastrear a quien lo filtra.',
      WEIGHT_INVISIBLE_CHARACTERS,
    );
  }
  if (signals.locationPrecision === 'municipality') {
    add(
      'Indicar el municipio reduce el número de personas que podrían haber denunciado.',
      WEIGHT_MUNICIPALITY,
    );
  }
  if (signals.localTime !== undefined && isWorkHours(signals.localTime)) {
    add(
      'Podrías estar en la red de tu trabajo. Si es así, envía la denuncia desde otra red y fuera del horario laboral.',
      WEIGHT_WORK_HOURS,
    );
  }

  reasons.sort((a, b) => b.weight - a.weight);
  const score = Math.min(
    100,
    reasons.reduce((total, reason) => total + reason.weight, 0),
  );
  const level = score < THRESHOLD_MEDIUM ? 'low' : score < THRESHOLD_HIGH ? 'medium' : 'high';
  return { level, score, reasons };
}
