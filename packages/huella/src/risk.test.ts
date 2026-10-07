// Pruebas de la evaluación de riesgo: pesos, topes, umbrales y aviso de horario laboral.
import { describe, expect, it } from 'vitest';
import {
  assessRisk,
  isWorkHours,
  WEIGHT_INVISIBLE_CHARACTERS,
  WEIGHT_MUNICIPALITY,
  WEIGHT_TEXT_HIGH,
  WEIGHT_UNSANITIZED_DEVICE,
  WEIGHT_UNSANITIZED_GPS,
  WEIGHT_WORK_HOURS,
} from './risk.ts';
import type { RiskSignals } from './risk.ts';
import type { TextFinding } from './text-review.ts';

const base: RiskSignals = {
  mode: 'anonymous',
  evidence: [],
  textFindings: [],
  invisibleCharacters: 0,
  locationPrecision: 'state',
};

const finding = (severity: TextFinding['severity']): TextFinding => ({
  kind: severity === 'high' ? 'email' : severity === 'medium' ? 'exact_date' : 'proper_name',
  start: 0,
  end: 1,
  excerpt: 'x',
  severity,
  suggestion: 'x',
});

// Domingo 4 de octubre de 2026 a las 11:00 y martes 6 a las 10:00, hora local.
const SUNDAY = new Date(2026, 9, 4, 11, 0);
const TUESDAY_MORNING = new Date(2026, 9, 6, 10, 0);
const TUESDAY_NIGHT = new Date(2026, 9, 6, 18, 0);

describe('assessRisk', () => {
  it('sin señales el riesgo es bajo y sin razones', () => {
    expect(assessRisk(base)).toEqual({ level: 'low', score: 0, reasons: [] });
  });

  it('las pruebas limpias no suman aunque hayan tenido GPS', () => {
    const result = assessRisk({
      ...base,
      evidence: [{ hadGps: true, hadDevice: true, sanitized: true }],
    });
    expect(result.score).toBe(0);
  });

  it('una prueba sin limpiar con GPS lleva a riesgo medio', () => {
    const result = assessRisk({
      ...base,
      evidence: [{ hadGps: true, hadDevice: true, sanitized: false }],
    });
    expect(result.score).toBe(WEIGHT_UNSANITIZED_GPS);
    expect(result.level).toBe('medium');
    expect(result.reasons[0]?.text).toMatch(/lugar exacto/u);
  });

  it('suma pruebas con dispositivo y llega a riesgo alto', () => {
    const result = assessRisk({
      ...base,
      evidence: [
        { hadGps: true, hadDevice: false, sanitized: false },
        { hadGps: false, hadDevice: true, sanitized: false },
      ],
    });
    expect(result.score).toBe(WEIGHT_UNSANITIZED_GPS + WEIGHT_UNSANITIZED_DEVICE);
    expect(result.level).toBe('high');
  });

  it('los hallazgos altos del texto pesan mucho y tienen tope', () => {
    expect(assessRisk({ ...base, textFindings: [finding('high')] }).score).toBe(WEIGHT_TEXT_HIGH);
    const many = assessRisk({ ...base, textFindings: Array(10).fill(finding('high')) });
    expect(many.score).toBe(60);
    expect(many.level).toBe('high');
    expect(many.reasons[0]?.text).toMatch(/10 datos/u);
  });

  it('los hallazgos medios y bajos pesan menos', () => {
    const result = assessRisk({
      ...base,
      textFindings: [finding('medium'), finding('medium'), finding('low')],
    });
    expect(result.score).toBe(19);
    expect(result.level).toBe('low');
  });

  it('los caracteres invisibles y el municipio suman', () => {
    const result = assessRisk({
      ...base,
      invisibleCharacters: 3,
      locationPrecision: 'municipality',
    });
    expect(result.score).toBe(WEIGHT_INVISIBLE_CHARACTERS + WEIGHT_MUNICIPALITY);
    expect(result.level).toBe('medium');
    expect(result.reasons.map((reason) => reason.weight)).toEqual([
      WEIGHT_INVISIBLE_CHARACTERS,
      WEIGHT_MUNICIPALITY,
    ]);
  });

  it('avisa del horario laboral de lunes a viernes de 8 a 18 h', () => {
    const work = assessRisk({ ...base, localTime: TUESDAY_MORNING });
    expect(work.score).toBe(WEIGHT_WORK_HOURS);
    expect(work.reasons[0]?.text).toMatch(/^Si usas la red de tu trabajo/u);
    expect(assessRisk({ ...base, localTime: SUNDAY }).reasons).toEqual([]);
    expect(assessRisk({ ...base, localTime: TUESDAY_NIGHT }).reasons).toEqual([]);
  });

  it('respeta los umbrales y el máximo de 100', () => {
    const exactlyMedium = assessRisk({
      ...base,
      textFindings: [finding('high')],
    });
    expect(exactlyMedium.level).toBe('medium');
    const saturated = assessRisk({
      ...base,
      mode: 'sealed',
      evidence: Array(5).fill({ hadGps: true, hadDevice: true, sanitized: false }),
      textFindings: Array(5).fill(finding('high')),
      invisibleCharacters: 9,
      locationPrecision: 'municipality',
      localTime: TUESDAY_MORNING,
    });
    expect(saturated.score).toBe(100);
    expect(saturated.level).toBe('high');
    const weights = saturated.reasons.map((reason) => reason.weight);
    expect(weights).toEqual([...weights].sort((a, b) => b - a));
  });
});

describe('isWorkHours', () => {
  it('es verdadero de lunes a viernes de 8:00 a 17:59', () => {
    expect(isWorkHours(TUESDAY_MORNING)).toBe(true);
    expect(isWorkHours(new Date(2026, 9, 5, 8, 0))).toBe(true);
    expect(isWorkHours(new Date(2026, 9, 9, 17, 59))).toBe(true);
  });

  it('es falso en fin de semana, antes de las 8 y desde las 18', () => {
    expect(isWorkHours(SUNDAY)).toBe(false);
    expect(isWorkHours(new Date(2026, 9, 10, 10, 0))).toBe(false);
    expect(isWorkHours(new Date(2026, 9, 6, 7, 59))).toBe(false);
    expect(isWorkHours(TUESDAY_NIGHT)).toBe(false);
  });
});

describe('textos de las razones', () => {
  it('son frases cortas, sin jerga ni masculino genérico', () => {
    const result = assessRisk({
      ...base,
      evidence: [
        { hadGps: true, hadDevice: false, sanitized: false },
        { hadGps: false, hadDevice: true, sanitized: false },
        { hadGps: false, hadDevice: false, sanitized: false },
      ],
      textFindings: [finding('high'), finding('medium'), finding('low')],
      invisibleCharacters: 1,
      locationPrecision: 'municipality',
      localTime: TUESDAY_MORNING,
    });
    expect(result.reasons).toHaveLength(9);
    for (const { text } of result.reasons) {
      expect(text).not.toMatch(/GPS|metadatos|EXIF|Unicode|usuario/u);
      for (const sentence of text.split(/(?<=\.)\s+/u)) {
        expect(sentence.split(/\s+/u).length).toBeLessThanOrEqual(16);
      }
    }
  });
});
