// Una prueba por cada hallazgo corregido de la auditoría de accesibilidad de la Etapa 5 (H1 a H18).
// Cada prueba nombra su hallazgo; todo con datos sintéticos.
import type { Page } from '@playwright/test';
import { expectNoAccessibilityViolations } from './support/accessibility.ts';
import {
  applyProcedure,
  prepareSealedComplaint,
  routeToInvestigation,
  seedAnonymousComplaint,
  seedPreparedComplaint,
  syntheticFacts,
} from './support/api.ts';
import { loginAsAuthority, openComplaint } from './support/authority.ts';
import { advanceServerClockTo, serverNow } from './support/clock.ts';
import { E2E_ACCOUNTS, E2E_AUTHORITY, e2ePassword } from './support/environment.ts';
import { expect, test } from './support/fixtures.ts';
import {
  continueTo,
  expectStep,
  fillFacts,
  reachSubmitStep,
  readReceipt,
  startReport,
} from './support/report-wizard.ts';
import { openTracking } from './support/tracking.ts';
import { openAccessibilityMenu, turnOnEasyReading } from './support/accessibility-menu.ts';

const SCRATCH = process.env['SIGILO_SCREENSHOTS_DIR'] ?? '';

/** Persona denunciada del escenario: el S1 sintético la une a la titular del OIC (conflicto). */
const CONFLICT_FACTS = syntheticFacts({
  entityId: 'VE-INSTITUTO',
  offenseCode: 'LGRA-59',
  accused: 'Servidor Ficticio Uno, Jefe del Departamento de Compras',
});

async function submitAndShowReceipt(page: Page) {
  await reachSubmitStep(page, 'anonymous');
  await page.getByTestId('submit-report').click();
  await expect(page.getByTestId('submit-success')).toBeVisible({ timeout: 20_000 });
}

test('H1: las 8 palabras no se ven ni se anuncian antes de «Mostrar», y luego se leen una vez', async ({
  page,
}) => {
  await submitAndShowReceipt(page);
  const card = page.getByTestId('receipt-card');
  const before = await card.ariaSnapshot();
  await expect(card.getByTestId('toggle-receipt')).toHaveAttribute('aria-expanded', 'false');
  // Ninguna palabra visible: ni la lista de pantalla (no existe) ni la de impresión.
  await expect(card.getByTestId('receipt-word')).toHaveCount(0);
  for (const item of await card.locator('.print-only li').all()) await expect(item).toBeHidden();
  const { words } = await readReceipt(page);
  // Se compara por estructura y no por subcadenas: una palabra del recibo (por ejemplo «leer»)
  // puede aparecer dentro del texto de la tarjeta («leerlas») sin que el recibo esté expuesto.
  expect(before).not.toMatch(/Palabra \d+:/u);
  // Mostradas, cada palabra aparece una sola vez como elemento numerado del árbol de accesibilidad.
  const after = await card.ariaSnapshot();
  words.forEach((word, index) => {
    const item = new RegExp(`Palabra ${index + 1}:\\s+${word}(?![\\p{L}])`, 'gu');
    expect(after.match(item)?.length ?? 0).toBe(1);
  });
  // Y no hay una segunda lista expuesta: exactamente 8 palabras numeradas.
  expect(after.match(/Palabra \d+:/gu)?.length ?? 0).toBe(words.length);
  await expect(card.getByTestId('toggle-receipt')).toHaveAttribute('aria-expanded', 'true');
});

test('H4: el talón impreso numera las palabras en una columna de cuatro y el folio cabe', async ({
  page,
}) => {
  await submitAndShowReceipt(page);
  await page.emulateMedia({ media: 'print' });
  const list = page.locator('.stub .receipt-words.print-only');
  await expect(list).toBeVisible();
  const layout = await list.evaluate((element) => {
    const style = getComputedStyle(element);
    const first = element.querySelector('li');
    return {
      flow: style.gridAutoFlow,
      rows: style.gridTemplateRows.split(' ').length,
      marker: first === null ? '' : getComputedStyle(first, '::before').content,
    };
  });
  expect(layout.flow).toBe('column');
  expect(layout.rows).toBe(4);
  expect(layout.marker).toContain('.');
  const folio = page.locator('.stub__folio');
  const fits = await folio.evaluate(
    (element) =>
      element.scrollWidth <= element.clientWidth + 1 &&
      element.getBoundingClientRect().right <=
        (element.parentElement?.getBoundingClientRect().right ?? 0) + 1,
  );
  expect(fits).toBe(true);
  if (SCRATCH !== '') await page.pdf({ path: `${SCRATCH}/talon-impreso.pdf`, format: 'Letter' });
  await page.emulateMedia({ media: 'screen' });
});

test('H6: el texto marcado por el revisor cumple 4.5:1 en alto contraste', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('sigilo-tema', 'contrast'));
  await startReport(page, 'anonymous');
  await continueTo(page, 'facts');
  await fillFacts(page, {
    accused: 'La persona titular del área',
    description: 'Lo sé porque soy la única que captura las requisiciones del área.',
  });
  const mark = page.locator('.review-text mark').first();
  await expect(mark).toBeVisible();
  const ratio = await mark.evaluate((element) => {
    const channel = (value: number) => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (color: string) => {
      const [r = 0, g = 0, b = 0] = (color.match(/\d+/gu) ?? []).map(Number);
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const style = getComputedStyle(element);
    const a = luminance(style.color);
    const b = luminance(style.backgroundColor);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});

test('H5/H11: a 320 px las tablas se desplazan en una región enfocable y no parten palabras', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/observatorio');
  await page.getByText('Ver la tabla de las 32 entidades').click();
  const region = page.getByRole('region', { name: 'Periodos con datos por entidad y sistema' });
  await expect(region).toBeVisible();
  await expect(region).toHaveAttribute('tabindex', '0');
  await region.focus();
  await page.keyboard.press('ArrowRight');
  const cell = page.getByTestId('coverage-matrix').locator('th').first();
  expect(await cell.evaluate((element) => getComputedStyle(element).overflowWrap)).toBe('normal');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  // El botón «Continuar» del asistente no se parte letra por letra.
  await page.goto('/denunciar');
  const next = page.getByTestId('step-next');
  const height = await next.evaluate((element) => element.getBoundingClientRect().height);
  expect(height).toBeLessThan(60);
});

test('H3, H8 y H16: el conflicto pide elegir, confirma antes de registrar y deja el foco en el resultado', async ({
  page,
  request,
}) => {
  const { folio } = await seedAnonymousComplaint(request, CONFLICT_FACTS);
  await applyProcedure(request, E2E_ACCOUNTS.inboxIntake, folio, {
    action: 'route',
    authorityId: E2E_AUTHORITY,
    note: 'Se turna a la autoridad competente para el ente (motivo sintético).',
  });
  await loginAsAuthority(page, E2E_ACCOUNTS.iffeIntake);
  await openComplaint(page, folio);
  const conflict = page.getByTestId('conflict-panel');
  // H12: las etiquetas del grafo caben en su lienzo.
  const clipped = await conflict.locator('.conflict-graph').evaluate((svg) => {
    const box = (svg as SVGSVGElement).viewBox.baseVal;
    return [...svg.querySelectorAll('text')].filter((text) => {
      const b = (text as SVGTextElement).getBBox();
      return b.x < box.x || b.x + b.width > box.x + box.width;
    }).length;
  });
  expect(clipped).toBe(0);
  // H16: ninguna opción preseleccionada.
  await expect(conflict.getByTestId('conflict-response-excuse')).not.toBeChecked();
  await expect(conflict.getByTestId('conflict-response-justification')).not.toBeChecked();
  // H8: sin elegir ni escribir, los errores van con su campo y el foco al primero.
  await conflict.getByTestId('conflict-submit').click();
  await expect(conflict.getByTestId('conflict-response-excuse')).toBeFocused();
  await expect(conflict.getByTestId('conflict-response-excuse')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(conflict.getByTestId('conflict-note')).toHaveAttribute('aria-invalid', 'true');
  await conflict.getByTestId('conflict-response-justification').check();
  await conflict.getByTestId('conflict-note').fill('Nota sintética de justificación.');
  await conflict.getByTestId('conflict-submit').click();
  // H16: paso de confirmación antes de registrar en la bitácora.
  await expect(conflict.getByTestId('conflict-confirm')).toBeVisible();
  await expect(page.locator('#conflict-confirm-title')).toBeFocused();
  await expectNoAccessibilityViolations(page, 'conflicto: confirmación');
  await conflict.getByTestId('conflict-confirm-submit').click();
  // H3: el foco va al resultado, no al cuerpo.
  await expect(page.getByTestId('conflict-message')).toBeFocused();
  await expect(page.getByTestId('conflict-message')).toContainText('quedó registrada');
});

test('H3 y H8: el trámite marca sus errores, enfoca el primero y tras aplicar lleva el foco al panel', async ({
  page,
  request,
}) => {
  const { folio } = await seedAnonymousComplaint(request);
  await applyProcedure(request, E2E_ACCOUNTS.inboxIntake, folio, {
    action: 'route',
    authorityId: E2E_AUTHORITY,
    note: 'Se turna a la autoridad competente para el ente (motivo sintético).',
  });
  await applyProcedure(request, E2E_ACCOUNTS.iffeIntake, folio, { action: 'accept' });
  await loginAsAuthority(page, E2E_ACCOUNTS.iffeInvestigator);
  await openComplaint(page, folio);
  const detail = page.getByTestId('complaint-detail');
  await detail.getByTestId('procedure-action').selectOption('close');
  await detail.getByTestId('apply-procedure').click();
  await expect(detail.getByTestId('procedure-legal-basis')).toBeFocused();
  await expect(detail.getByTestId('procedure-legal-basis')).toHaveAttribute('aria-invalid', 'true');
  await expect(detail.getByTestId('procedure-agreement')).toHaveAttribute('aria-invalid', 'true');
  await expectNoAccessibilityViolations(page, 'trámite con errores');
  await detail.getByTestId('procedure-action').selectOption('advance_stage');
  await detail.getByTestId('procedure-stage').selectOption('investigation');
  await detail.getByTestId('apply-procedure').click();
  await expect(page.locator('#procedure-title')).toBeFocused();
});

test('H8: la inconformidad marca sus campos con error y enfoca el primero', async ({
  page,
  request,
}) => {
  const prepared = await prepareSealedComplaint(
    request,
    'Persona Ficticia Errores',
    CONFLICT_FACTS,
  );
  const { folio, words } = await seedPreparedComplaint(request, prepared);
  await routeToInvestigation(request, folio);
  await applyProcedure(request, E2E_ACCOUNTS.iffeInvestigator, folio, {
    action: 'advance_stage',
    stage: 'investigation',
  });
  await applyProcedure(request, E2E_ACCOUNTS.iffeInvestigator, folio, {
    action: 'advance_stage',
    stage: 'qualification',
    qualification: {
      severity: 'non_serious',
      legalBasis: 'LGRA, art. 100: calificación sintética de prueba.',
      agreement:
        'Con fundamento en el artículo 100 de la LGRA se califica la conducta como falta no grave (sintético).',
    },
  });
  // La notificación por el buzón abre el plazo de 5 días hábiles para inconformarse.
  await loginAsAuthority(page, E2E_ACCOUNTS.iffeInvestigator);
  await openComplaint(page, folio);
  await page.getByTestId('authority-question').fill('Te notificamos la calificación (sintético).');
  await page.getByTestId('send-question').click();
  await expect(page.getByTestId('authority-mailbox')).toContainText('Te notificamos');
  await openTracking(page, folio, words);
  const form = page.getByTestId('appeal-form');
  await form.getByTestId('appeal-submit').click();
  await expect(form.getByTestId('appeal-reasons')).toBeFocused();
  await expect(form.getByTestId('appeal-reasons')).toHaveAttribute('aria-invalid', 'true');
  await expect(form.getByTestId('appeal-consent')).toHaveAttribute('aria-invalid', 'true');
  await expect(form.getByTestId('appeal-consent')).toHaveAccessibleDescription(/aceptar/u);
  await expectNoAccessibilityViolations(page, 'inconformidad con errores');
});

test('H2: avisa antes de cerrar la sesión, la renueva y, si vence, pide entrar sin perder lo escrito', async ({
  page,
  request,
}) => {
  const { folio } = await seedAnonymousComplaint(request);
  await applyProcedure(request, E2E_ACCOUNTS.inboxIntake, folio, {
    action: 'route',
    authorityId: E2E_AUTHORITY,
    note: 'Se turna a la autoridad competente para el ente (motivo sintético).',
  });
  await applyProcedure(request, E2E_ACCOUNTS.iffeIntake, folio, { action: 'accept' });
  await page.clock.install();
  await loginAsAuthority(page, E2E_ACCOUNTS.iffeInvestigator);
  await openComplaint(page, folio);
  const detail = page.getByTestId('complaint-detail');
  await detail.getByTestId('procedure-note').fill('Nota sintética que no debe perderse.');

  // Minuto 13: aviso con «Seguir conectada», que renueva la sesión.
  await page.clock.fastForward('13:05');
  const warning = page.getByRole('alertdialog', { name: 'Tu sesión está por cerrarse' });
  await expect(warning).toBeVisible();
  await expectNoAccessibilityViolations(page, 'aviso de sesión por vencer');
  await warning.getByTestId('session-stay').click();
  await expect(warning).toBeHidden();

  // La sesión vence en el servidor: la siguiente acción lo dice y lleva el foco al acceso.
  advanceServerClockTo(new Date(serverNow().getTime() + 16 * 60 * 1000));
  await detail.getByTestId('apply-procedure').click();
  const expired = page.getByTestId('session-expired');
  await expect(expired).toBeVisible();
  await expect(page.locator('#session-expired-title')).toBeFocused();
  await expect(expired).toContainText('Lo que escribiste sigue aquí');
  await expect(detail.getByTestId('procedure-note')).toHaveValue(
    'Nota sintética que no debe perderse.',
  );
  await expectNoAccessibilityViolations(page, 'sesión vencida');
  await expired.getByTestId('relogin-username').fill(E2E_ACCOUNTS.iffeInvestigator);
  await expired.getByTestId('relogin-password').fill(e2ePassword(E2E_ACCOUNTS.iffeInvestigator));
  await expired.getByTestId('relogin-submit').click();
  await expect(expired).toBeHidden();
  await expect(detail.getByTestId('procedure-note')).toHaveValue(
    'Nota sintética que no debe perderse.',
  );
});

test('H7: el navegador de pasos no tapa el campo enfocado y en 320 px no es fijo', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.addInitScript(() => window.localStorage.setItem('sigilo-tema', 'light'));
  await startReport(page, 'anonymous');
  await turnOnEasyReading(page);
  await page.keyboard.press('Escape');
  await continueTo(page, 'facts');
  const margin = await page.evaluate(() => {
    const stepper = document.querySelector('.stepper');
    const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom);
    return { padding, height: stepper?.getBoundingClientRect().height ?? 0 };
  });
  expect(margin.padding).toBeGreaterThanOrEqual(margin.height);
  await page.getByTestId('description-input').focus();
  const covered = await page.evaluate(() => {
    const field = document.querySelector('#description');
    const stepper = document.querySelector('.stepper');
    if (field === null || stepper === null) return false;
    return field.getBoundingClientRect().top >= stepper.getBoundingClientRect().top;
  });
  expect(covered).toBe(false);
  await page.setViewportSize({ width: 320, height: 568 });
  const position = await page
    .locator('.stepper')
    .evaluate((element) => getComputedStyle(element).position);
  expect(position).not.toBe('sticky');
});

test('H9: el resumen de errores se anuncia en el intento y no al corregir cada campo', async ({
  page,
}) => {
  await page.goto('/denunciar');
  await expectStep(page, 'mode');
  await page.getByTestId('step-next').click();
  const summary = page.getByTestId('error-summary');
  await expect(summary).toHaveAttribute('role', 'alert');
  await expect(summary).not.toHaveAttribute('role', 'alert', { timeout: 3_000 });
  // Un intento nuevo vuelve a anunciarse.
  await page.getByTestId('step-next').click();
  await expect(page.getByTestId('error-summary')).toHaveAttribute('role', 'alert');
});

test('H10: la animación del inicio es una sola pulsación de menos de 5 segundos', async ({
  page,
}) => {
  await page.goto('/');
  const animation = await page.locator('.constellation__halo').evaluate((element) => {
    const style = getComputedStyle(element);
    return { count: style.animationIterationCount, duration: style.animationDuration };
  });
  expect(animation.count).toBe('1');
  expect(parseFloat(animation.duration)).toBeLessThan(5);
});

test('H12 y H14: las etiquetas del mapa caben en su lienzo y los periodos se leen claros', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/observatorio');
  const map = page.locator('.coverage-map');
  await expect(map).toBeVisible();
  const outside = await map.evaluate((svg) => {
    const box = (svg as SVGSVGElement).viewBox.baseVal;
    return [...svg.querySelectorAll('text')].filter((text) => {
      const b = (text as SVGTextElement).getBBox();
      return b.x < box.x || b.x + b.width > box.x + box.width;
    }).length;
  });
  expect(outside).toBe(0);
  const matrix = page.getByTestId('coverage-matrix');
  await expect(matrix).not.toContainText('sin_fecha');
  await expect(matrix).not.toContainText(' a total');
});

test('H13: el nombre del plazo y su situación, y el sello y su fecha, van separados', async ({
  page,
  request,
}) => {
  const { folio, words } = await seedAnonymousComplaint(request, CONFLICT_FACTS);
  await applyProcedure(request, E2E_ACCOUNTS.inboxIntake, folio, {
    action: 'route',
    authorityId: E2E_AUTHORITY,
    note: 'Se turna a la autoridad competente para el ente (motivo sintético).',
  });
  await page.goto('/seguimiento');
  const form = page.getByTestId('tracking-login');
  await form.getByTestId('tracking-folio').fill(folio);
  await form.getByTestId('receipt-word-1').fill(words.join(' '));
  await form.getByTestId('tracking-submit').click();
  await expect(page.getByTestId('tracking-view')).toBeVisible();
  const deadline = page.getByTestId('deadline-serious_offense_start');
  expect(await deadline.locator('.deadline__head').textContent()).toMatch(/grave En curso/u);
  const stamp = page.locator('.stamp').first();
  expect(await stamp.textContent()).toMatch(/Recibida \d/u);
});

test('H15 y H17: la ayuda de cada modo es su descripción y dice lo que hace', async ({ page }) => {
  await page.goto('/');
  await openAccessibilityMenu(page);
  const lowConnection = page.getByTestId('usage-isLowConnection');
  await expect(lowConnection).toHaveAccessibleName('Tengo poca conexión');
  await expect(lowConnection).toHaveAccessibleDescription(/hasta 4 veces/u);
  const easy = page.getByTestId('usage-isEasyReading');
  await expect(easy).toHaveAccessibleName('Lectura fácil');
  await turnOnEasyReading(page);
  const style = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    return { size: parseFloat(body.fontSize), line: parseFloat(body.lineHeight) };
  });
  expect(style.size).toBeGreaterThan(18);
  expect(style.line / style.size).toBeGreaterThanOrEqual(1.7);
});

test('H18 y confirmación vacía: la franja está en un punto de referencia y el recibo pide cada palabra', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page
      .getByRole('complementary', { name: 'Aviso del prototipo' })
      .getByTestId('prototype-notice'),
  ).toBeVisible();
  await submitAndShowReceipt(page);
  await page.getByTestId('confirm-receipt').click();
  await expect(page.getByTestId('receipt-confirmation')).toContainText(/Escribe la palabra \d/u);
});

test.describe('1.4.12 espaciado de texto (prueba automática, sin revisión visual)', () => {
  // La CSP impide inyectar estilos; solo esta prueba la omite para aplicar el espaciado de la norma.
  test.use({ bypassCSP: true });

  test('con el espaciado de WCAG 2.1 la página no se desborda a lo ancho', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ['/', '/denunciar', '/seguimiento', '/observatorio']) {
      await page.goto(path);
      await page.addStyleTag({
        content:
          '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }',
      });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} se desborda con el espaciado de texto`).toBeLessThanOrEqual(0);
    }
  });
});
