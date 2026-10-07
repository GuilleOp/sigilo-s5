// Revisión automática de accesibilidad con axe-core (WCAG 2.0 A y AA).
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect } from './fixtures.ts';

/** Etiquetas de axe que se exigen en todas las pantallas. */
const WCAG_TAGS = ['wcag2a', 'wcag2aa'];

/** Analiza la página y falla con un resumen legible si hay alguna violación. */
export async function expectNoAccessibilityViolations(page: Page, screen: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const summary = results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? 'sin impacto'}): ${violation.help} en ` +
      violation.nodes.map((node) => node.target.join(' ')).join(', '),
  );
  expect(summary, `Violaciones de accesibilidad en «${screen}»`).toEqual([]);
}
