// Pruebas de los recorridos: frases cortas (una idea por paso) y un recorrido por cada función.
import { describe, expect, it } from 'vitest';
import { authorityTour, REPORTER_TOUR } from './tours.ts';

const words = (text: string): number => text.trim().split(/\s+/u).length;

describe('recorridos guiados', () => {
  it('cada paso dice una sola idea en pocas palabras', () => {
    const tours = [
      REPORTER_TOUR,
      authorityTour('intake'),
      authorityTour('investigation'),
      authorityTour('supervision'),
    ];
    for (const tour of tours) {
      expect(tour.steps.length).toBeGreaterThanOrEqual(4);
      expect(tour.steps.length).toBeLessThanOrEqual(8);
      for (const step of tour.steps) {
        expect(words(step.title)).toBeLessThanOrEqual(6);
        expect(words(step.text)).toBeLessThanOrEqual(30);
      }
    }
  });

  it('el recorrido de quien denuncia empieza por la salida rápida', () => {
    expect(REPORTER_TOUR.steps[1]?.target).toBe('quick-exit');
    expect(REPORTER_TOUR.steps[1]?.text).toMatch(/Esc dos veces/u);
  });

  it('solo la supervisión explica los escalamientos', () => {
    const has = (role: 'intake' | 'investigation' | 'supervision') =>
      authorityTour(role).steps.some((step) => step.target === 'escalations');
    expect(has('supervision')).toBe(true);
    expect(has('intake')).toBe(false);
  });
});
