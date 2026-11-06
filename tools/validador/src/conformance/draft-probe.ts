// PRV-10 (conformidad): escribe una marca sintética en los campos del formulario, avanza los pasos
// sin enviar y busca la marca en localStorage, sessionStorage, IndexedDB y cookies.
import type { Page } from '@playwright/test';
import { result } from '../catalog.ts';
import { MAX_STORAGE_VALUE_CHARS } from '../capture/browser-capture.ts';
import { launchHardenedBrowser, readBrowserStorage } from '../capture/hardened-browser.ts';
import { createRequestPolicy } from '../capture/policy.ts';
import type { RequestBudget } from '../capture/policy.ts';
import type { CheckResult, Evidence, StorageEntry } from '../types.ts';

/** Rondas de llenado y avance: cubre asistentes de varios pasos. */
const FILL_ROUNDS = 4;

/** Botones que avanzan sin enviar. */
const ADVANCE_BUTTON = /^\s*(continuar|siguiente|next|avanzar)\b/i;
/** Botones que nunca se pulsan: envían o confirman. */
const FORBIDDEN_BUTTON = /enviar|presentar|confirmar|firmar|submit|registrar/i;

/**
 * Llena los campos visibles de texto con la marca, elige la primera opción de cada grupo de
 * radios y de cada lista sin valor, y pulsa «Continuar» si existe. Heurística genérica: no conoce
 * el formulario; si un paso exige datos con formato, el recorrido se detiene ahí.
 */
async function fillVisibleFields(page: Page, marker: string): Promise<number> {
  return page.evaluate((text: string) => {
    let filled = 0;
    const isVisible = (element: Element): boolean => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    };
    const setValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string): void => {
      const prototype = Object.getPrototypeOf(element) as object;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (setter === undefined) element.value = value;
      else setter.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="email"]',
    );
    for (const field of Array.from(fields)) {
      if (field.disabled || field.readOnly || !isVisible(field) || field.value.includes(text))
        continue;
      setValue(
        field,
        field.type === 'email'
          ? `${text.toLowerCase()}@ejemplo.invalid`
          : `${text} texto sintético de prueba del validador`,
      );
      filled += 1;
    }
    const groups = new Set<string>();
    for (const radio of Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    )) {
      if (radio.name === '' || groups.has(radio.name)) continue;
      groups.add(radio.name);
      const group = document.querySelectorAll<HTMLInputElement>(
        `input[type="radio"][name="${CSS.escape(radio.name)}"]`,
      );
      if (!Array.from(group).some((option) => option.checked)) radio.click();
    }
    for (const select of Array.from(document.querySelectorAll<HTMLSelectElement>('select'))) {
      if (select.disabled || select.value !== '' || select.options.length < 2) continue;
      select.selectedIndex = 1;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return filled;
  }, marker);
}

async function clickAdvance(page: Page): Promise<boolean> {
  const buttons = page.getByRole('button');
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    const label = ((await button.textContent()) ?? '').trim();
    if (!ADVANCE_BUTTON.test(label) || FORBIDDEN_BUTTON.test(label)) continue;
    if (!(await button.isVisible()) || !(await button.isEnabled())) continue;
    await button.click({ timeout: 5000 }).catch(() => undefined);
    return true;
  }
  return false;
}

/** Opciones de la sonda. */
export interface DraftProbeOptions {
  formUrl: string;
  marker: string;
  navigationTimeoutMs: number;
  /** Contador único de la corrida. */
  budget: RequestBudget;
  hostResolverRules?: string;
}

/** Ejecuta la sonda y produce el resultado de PRV-10 en modo conformidad. */
export async function probeDraftStorage(options: DraftProbeOptions): Promise<CheckResult> {
  const target = new URL(options.formUrl);
  // Lo escrito es sintético, pero igual no sale nada a terceros (HTTP, WebSocket ni WebRTC).
  const policy = createRequestPolicy({
    budget: options.budget,
    target,
    targetPages: [options.formUrl],
    allowNonGet: true,
    allowThirdParty: false,
  });
  const { browser, context } = await launchHardenedBrowser({
    target,
    policy,
    currentLabel: () => 'formulario',
    onRequest: () => undefined,
    maxResourceBytes: 1024 * 1024,
    timeoutMs: options.navigationTimeoutMs,
    ...(options.hostResolverRules === undefined
      ? {}
      : { hostResolverRules: options.hostResolverRules }),
  });
  try {
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(options.navigationTimeoutMs);
    await page.goto(options.formUrl, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    let filled = 0;
    for (let round = 0; round < FILL_ROUNDS; round += 1) {
      filled += await fillVisibleFields(page, options.marker);
      await page.waitForTimeout(400);
      if (!(await clickAdvance(page))) break;
      await page.waitForTimeout(600);
    }
    // Margen para guardados diferidos (p. ej. autoguardado con retardo).
    await page.waitForTimeout(1500);
    // La marca se busca en el valor completo, antes de recortarlo para la evidencia.
    const storage: StorageEntry[] = await readBrowserStorage(
      page,
      MAX_STORAGE_VALUE_CHARS,
      options.marker,
    );
    const cookies = await context.cookies();
    const leaked = storage.filter((entry) => entry.containsMarker === true);
    const leakedCookies = cookies.filter((cookie) => cookie.value.includes(options.marker));
    const evidence: Evidence[] = [
      {
        kind: 'nota',
        description: `Se escribió una marca sintética en ${filled} campo(s) del formulario, sin enviarlo. Entradas de almacenamiento al terminar: ${storage.length}.`,
        url: options.formUrl,
      },
      ...leaked.map((entry) => ({
        kind: 'almacenamiento' as const,
        description: `La marca aparece en claro en ${entry.area}.`,
        name: entry.key,
        value: entry.value.slice(0, 300),
      })),
      ...leakedCookies.map((cookie) => ({
        kind: 'cookie' as const,
        description: 'La marca aparece en una cookie.',
        name: cookie.name,
      })),
    ];
    if (filled === 0) {
      return result('PRV-10', {
        status: 'advertencia',
        summary:
          'No se encontró ningún campo de texto que llenar; no se pudo comprobar el borrador.',
        evidence,
      });
    }
    if (leaked.length > 0 || leakedCookies.length > 0) {
      return result('PRV-10', {
        status: 'no_cumple',
        summary: 'Lo escrito en el formulario queda en claro en el almacenamiento del navegador.',
        evidence,
      });
    }
    return result('PRV-10', {
      status: 'cumple',
      summary:
        'Lo escrito en el formulario no aparece en localStorage, sessionStorage, IndexedDB ni cookies.',
      evidence,
    });
  } catch (error) {
    return result('PRV-10', {
      status: 'advertencia',
      summary: `No se pudo completar la sonda del formulario: ${error instanceof Error ? error.message.split('\n')[0] : 'error desconocido'}.`,
    });
  } finally {
    await browser.close();
  }
}
