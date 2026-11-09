// Pruebas de los recorridos: frases cortas (una idea por paso) y un recorrido por cada función.
import { describe, expect, it } from 'vitest';
import { authorityRoleOf } from './authority-role.ts';
import type { AuthorityRole } from './authority-role.ts';
import { authorityTour, REPORTER_TOUR } from './tours.ts';

const words = (text: string): number => text.trim().split(/\s+/u).length;

describe('recorridos guiados', () => {
  it('cada paso dice una sola idea en pocas palabras', () => {
    const tours = [
      REPORTER_TOUR,
      authorityTour('intake'),
      authorityTour('investigation'),
      authorityTour('intake_investigation'),
      authorityTour('substantiation'),
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
    const has = (role: AuthorityRole) =>
      authorityTour(role).steps.some((step) => step.target === 'escalations');
    expect(has('supervision')).toBe(true);
    expect(has('intake')).toBe(false);
    expect(has('substantiation')).toBe(false);
  });

  it('una cuenta de recepción e investigación tiene su propio perfil', () => {
    expect(authorityRoleOf(['intake', 'investigation'])).toBe('intake_investigation');
    expect(authorityRoleOf(['investigation', 'intake'])).toBe('intake_investigation');
    expect(authorityRoleOf(['intake'])).toBe('intake');
    expect(authorityRoleOf(['substantiation'])).toBe('substantiation');
    expect(authorityTour('intake_investigation').steps[0]?.title).toMatch(
      /recepción e investigación/u,
    );
  });
});
