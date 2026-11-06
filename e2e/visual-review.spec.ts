// Revisión visual contra las maquetas aprobadas (última ronda): una prueba por corrección. Todo con
// datos sintéticos; las correcciones de accesibilidad siguen cubiertas en a11y-audit.spec.ts.
import { expectNoAccessibilityViolations } from './support/accessibility.ts';
import { applyProcedure, seedAnonymousComplaint, syntheticFacts } from './support/api.ts';
import { loginAsAuthority, openComplaint } from './support/authority.ts';
import { E2E_ACCOUNTS, E2E_AUTHORITY } from './support/environment.ts';
import { expect, test } from './support/fixtures.ts';
import { openTracking } from './support/tracking.ts';

/** Persona denunciada del escenario: el S1 sintético la une a la titular del OIC (conflicto). */
const CONFLICT_FACTS = syntheticFacts({
  entityId: 'VE-INSTITUTO',
  offenseCode: 'LGRA-59',
  accused: 'Servidor Ficticio Uno, Jefe del Departamento de Compras',
});

async function routedComplaint(request: Parameters<typeof seedAnonymousComplaint>[0]) {
  const seeded = await seedAnonymousComplaint(request, CONFLICT_FACTS);
  await applyProcedure(request, E2E_ACCOUNTS.inboxIntake, seeded.folio, {
    action: 'route',
    authorityId: E2E_AUTHORITY,
  });
  return seeded;
}

test('1 y 8: el grafo del conflicto se lee completo y el texto del art. 58 sale una vez', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { folio } = await routedComplaint(request);
  await loginAsAuthority(page, E2E_ACCOUNTS.iffeIntake);
  await openComplaint(page, folio);
  const conflict = page.getByTestId('conflict-panel');
  const graph = conflict.locator('.conflict-graph');
  await graph.scrollIntoViewIfNeeded();
  // Ocupa el ancho de la tarjeta hasta 40rem (640 px), no ~350 px.
  const width = await graph.evaluate((svg) => svg.getBoundingClientRect().width);
  expect(width).toBeGreaterThan(600);
  const layout = await graph.evaluate((svg) => {
    const box = (svg as SVGSVGElement).viewBox.baseVal;
    const pills = [...svg.querySelectorAll('.conflict-graph__org')].map((rect) =>
      (rect as SVGRectElement).getBBox(),
    );
    const people = [...svg.querySelectorAll('.conflict-graph__person')].map((circle) =>
      (circle as SVGCircleElement).getBBox(),
    );
    const labels = [...svg.querySelectorAll('.conflict-graph__label')].map((text) =>
      (text as SVGTextElement).getBBox(),
    );
    const texts = [...svg.querySelectorAll('text')].map((text) => {
      const b = (text as SVGTextElement).getBBox();
      return { inside: b.x >= box.x && b.x + b.width <= box.x + box.width, text: text.textContent };
    });
    const overlaps = labels.some((label) =>
      pills.some(
        (pill) =>
          label.x < pill.x + pill.width &&
          pill.x < label.x + label.width &&
          label.y < pill.y + pill.height &&
          pill.y < label.y + label.height,
      ),
    );
    const gaps = pills.slice(1).map((pill, index) => {
      const previous = pills[index];
      return previous === undefined ? 0 : pill.y - (previous.y + previous.height);
    });
    const below = labels.map((label, index) => {
      const person = people[index];
      return person === undefined ? 0 : label.y - (person.y + person.height);
    });
    return { texts, overlaps, gaps, below };
  });
  expect(layout.texts.every((text) => text.inside)).toBe(true);
  // Nombres completos, sin «…».
  const allText = layout.texts.map((text) => text.text).join(' ');
  expect(allText).toContain('Inmobiliaria Ficticia');
  expect(allText).not.toContain('…');
  expect(layout.overlaps).toBe(false);
  for (const gap of layout.gaps) expect(gap).toBeGreaterThanOrEqual(24);
  for (const distance of layout.below) expect(distance).toBeGreaterThanOrEqual(12);

  // 8: una sola frase con el art. 58 a la vista; el detalle del superior, plegado.
  const visible = await conflict.evaluate((section) => (section as HTMLElement).innerText);
  expect(visible.split('art. 58').length - 1).toBe(1);
  expect(visible.split('Posible conflicto de interés').length - 1).toBe(1);
  await expect(conflict.getByTestId('conflict-lead')).toContainText(
    'Excúsate o justifica antes de aceptar; si resuelves sin hacerlo, se escala.',
  );
  const law = conflict.locator('details.conflict__law');
  await expect(law).not.toHaveAttribute('open');
  await law.locator('summary').click();
  await expect(law).toContainText('superior inmediato');
  await expectNoAccessibilityViolations(page, 'conflicto con grafo y detalle plegado');
});

test('2: en la cobertura, «sin cobertura» es un círculo punteado y vacío', async ({ page }) => {
  await page.goto('/observatorio');
  const matrix = page.getByTestId('coverage-matrix');
  const none = matrix.locator(".coverage-cell[data-covered='false'] .coverage-cell__icon").first();
  const yes = matrix.locator(".coverage-cell[data-covered='true'] .coverage-cell__icon").first();
  const style = (handle: typeof none) =>
    handle.evaluate((icon) => {
      const computed = getComputedStyle(icon);
      return { border: computed.borderTopStyle, background: computed.backgroundColor };
    });
  const noneStyle = await style(none);
  const yesStyle = await style(yes);
  expect(noneStyle.border).toBe('dotted');
  expect(noneStyle.background).toBe('rgba(0, 0, 0, 0)');
  expect(yesStyle.border).toBe('solid');
  expect(yesStyle.background).not.toBe(noneStyle.background);
});

test('3 y 9: el asesor está plegado y los botones del titular van lado a lado', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const report = await page.getByTestId('cta-report').boundingBox();
  const tracking = await page.getByTestId('cta-tracking').boundingBox();
  expect(Math.abs((report?.y ?? 0) - (tracking?.y ?? 100))).toBeLessThan(2);
  const advisor = page.getByTestId('advisor');
  await expect(advisor.getByTestId('advisor-open')).toHaveText(
    '¿Quieres consejos antes de denunciar? (5 preguntas, nada se envía)',
  );
  await expect(advisor.getByTestId('advisor-submit')).toBeHidden();
  const height = await advisor.evaluate((section) => section.getBoundingClientRect().height);
  expect(height).toBeLessThan(400);
  await advisor.getByTestId('advisor-open').click();
  await expect(advisor.getByTestId('advisor-submit')).toBeVisible();
  await expectNoAccessibilityViolations(page, 'inicio con el asesor abierto');
});

test('4 y 5: el estado dice lo que sigue, los sellos no repiten la etapa y la regla llena la tarjeta', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { folio, words } = await routedComplaint(request);
  await applyProcedure(request, E2E_ACCOUNTS.iffeIntake, folio, { action: 'accept' });
  await openTracking(page, folio, words);
  const headline = page.getByTestId('tracking-headline');
  await expect(headline).toContainText('Lo que sigue:');
  await expect(headline).toContainText('Órgano Interno de Control');
  await expect(headline).toContainText('iniciar ante una posible falta grave');
  const steps = page.getByTestId('procedure-steps');
  await expect(steps.locator('.route__title')).toHaveCount(1);
  await expect(steps.locator('.route__title')).toContainText('Turnada a');
  await expect(steps).not.toContainText('Aceptada por');

  const deadline = page.getByTestId('deadline-serious_offense_start');
  const ruler = deadline.locator('svg.ruler');
  const sizes = await ruler.evaluate((svg) => {
    const card = svg.closest('li, article, section, div.deadline') ?? svg.parentElement;
    const own = svg.getBoundingClientRect();
    const label = svg.querySelector('.ruler__label')?.getBoundingClientRect();
    const firstTick = svg.querySelector('.ruler__tick')?.getBoundingClientRect();
    return {
      width: own.width,
      parent: card?.getBoundingClientRect().width ?? 0,
      labelHeight: label?.height ?? 0,
      tickOffset: (firstTick?.left ?? 0) - own.left,
    };
  });
  // La regla empieza a la izquierda (no centrada) y crece con la tarjeta (hasta 36rem).
  expect(sizes.width).toBeGreaterThanOrEqual(Math.min(576, sizes.parent - 40));
  expect(sizes.tickOffset).toBeLessThan(20);
  // Etiquetas de al menos 11 px.
  expect(sizes.labelHeight).toBeGreaterThanOrEqual(11);
  await expectNoAccessibilityViolations(page, 'seguimiento con lo que sigue');
});

test('6: el panel dice el mismo estado en «Estado» y en «Trámite»', async ({ page, request }) => {
  const { folio } = await routedComplaint(request);
  await applyProcedure(request, E2E_ACCOUNTS.iffeIntake, folio, { action: 'accept' });
  await loginAsAuthority(page, E2E_ACCOUNTS.iffeIntake);
  await openComplaint(page, folio);
  const detail = page.getByTestId('complaint-detail');
  const state = (await detail.getByTestId('procedure-state').textContent())?.trim() ?? '';
  expect(state).toContain('Aceptada');
  await expect(detail.getByTestId('detail-status')).toHaveText(state);
});

test('7: en alto contraste, la barra de «Tu escudo» es sólida y del color de protección', async ({
  page,
}) => {
  const readBar = () =>
    page.locator('.shield').evaluate((shield) => {
      const before = getComputedStyle(shield, '::before');
      return { image: before.backgroundImage, color: before.backgroundColor };
    });
  const protectColor = () =>
    page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--color-protect)';
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
  await page.goto('/');
  // Con el selector de tema (data-theme) y con la preferencia del sistema (prefers-contrast).
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'contrast'));
  expect(await readBar()).toEqual({ image: 'none', color: await protectColor() });
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  await page.emulateMedia({ contrast: 'more' });
  expect(await readBar()).toEqual({ image: 'none', color: await protectColor() });
});

test('9: en celular, los factores de la prioridad son tarjetas (y la tabla, en pantallas anchas)', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { folio } = await routedComplaint(request);
  await loginAsAuthority(page, E2E_ACCOUNTS.iffeIntake);
  await openComplaint(page, folio);
  const sheet = page.getByTestId('context-sheet');
  await expect(sheet.getByTestId('priority-factor-cards')).toBeVisible();
  await expect(sheet.getByTestId('priority-factors')).toBeHidden();
  await expect(sheet.locator('.factor-card').first()).toContainText(/puntos|Solo informa/u);
  await expectNoAccessibilityViolations(page, 'factores en tarjetas');
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(sheet.getByTestId('priority-factors')).toBeVisible();
  await expect(sheet.getByTestId('priority-factor-cards')).toBeHidden();
});
