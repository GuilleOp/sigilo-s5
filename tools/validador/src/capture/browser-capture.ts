// Captura pasiva: carga el inicio y el formulario en el Chromium endurecido, registra cada
// petición de red (HTTP, WebSocket y WebRTC), guarda los recursos de texto para el análisis
// estático y lee cookies y almacenamiento local. Las cabeceras del documento se piden aparte con
// `fetch`, siguiendo a mano solo las redirecciones del propio sitio.
import type {
  CapturedCookie,
  CapturedPage,
  CapturedRequest,
  CapturedResource,
  PassiveCapture,
  StorageEntry,
} from '../types.ts';
import { USER_AGENT } from '../version.ts';
import { launchHardenedBrowser, readBrowserStorage } from './hardened-browser.ts';
import { readLimitedText } from './limited-body.ts';
import { classifyUrl } from './party.ts';
import { createRequestPolicy } from './policy.ts';
import type { RequestBudget } from './policy.ts';

/** Página a visitar. */
export interface PageTarget {
  label: string;
  url: string;
}

/** Opciones de la captura. */
export interface CaptureOptions {
  targetUrl: string;
  pages: readonly PageTarget[];
  /** Contador único de la corrida (compartido con el modo conformidad). */
  budget: RequestBudget;
  navigationTimeoutMs: number;
  maxResourceBytes: number;
  allowThirdParty: boolean;
  /**
   * Solo pruebas: reglas `--host-resolver-rules` de Chromium para simular dominios externos en
   * 127.0.0.1 sin salir a internet.
   */
  hostResolverRules?: string;
  /** Espera adicional tras la carga para dejar que lleguen los fragmentos diferidos. */
  settleMs?: number;
}

/** Máximo de caracteres por valor de almacenamiento en la captura. */
export const MAX_STORAGE_VALUE_CHARS = 2000;
/** Máximo de saltos de redirección que sigue `fetch`. */
export const MAX_REDIRECTS = 5;
const DEFAULT_SETTLE_MS = 1500;

type Policy = ReturnType<typeof createRequestPolicy>;

/**
 * Pide el documento con `fetch` sin redirecciones automáticas. Cada salto debe ir al propio sitio
 * (o al mismo dominio registrable), pasar la política y contar en el tope; si no, se detiene y la
 * página queda sin cabeceras evaluables (`status: null`).
 */
async function fetchDocument(
  url: string,
  target: URL,
  policy: Policy,
  timeoutMs: number,
  maxBytes: number,
): Promise<Omit<CapturedPage, 'label' | 'storage'>> {
  const redirects: string[] = [];
  let current = url;
  const failed = (error: string): Omit<CapturedPage, 'label' | 'storage'> => ({
    url,
    finalUrl: current,
    status: null,
    headers: {},
    setCookies: [],
    html: '',
    redirects,
    error,
  });
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const party = classifyUrl(current, target);
      if (party === 'tercero') {
        return failed(
          `${url} redirige a un tercero (${new URL(current).host}); no se siguió y sus cabeceras no se atribuyen al sitio.`,
        );
      }
      const decision = policy.decide({
        method: 'GET',
        url: current,
        resourceType: 'document',
        party,
        isNavigation: hop > 0,
      });
      if (!decision.isAllowed) return failed(`No se pidió ${current}: ${decision.reason}.`);
      const response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*;q=0.8' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location !== null) {
        await response.body?.cancel();
        current = new URL(location, current).href;
        redirects.push(current);
        continue;
      }
      const headers: Record<string, string> = {};
      response.headers.forEach((value, name) => {
        if (name !== 'set-cookie') headers[name.toLowerCase()] = value;
      });
      const { text } = await readLimitedText(response, maxBytes);
      return {
        url,
        finalUrl: current,
        status: response.status,
        headers,
        setCookies: response.headers.getSetCookie(),
        html: text,
        redirects,
      };
    }
    return failed(`${url} supera ${MAX_REDIRECTS} redirecciones.`);
  } catch (error) {
    return failed(
      `No se pudo obtener el documento: ${error instanceof Error ? error.message : 'error desconocido'}.`,
    );
  }
}

function sameSiteOf(value: string | undefined): CapturedCookie['sameSite'] {
  if (value === 'Strict' || value === 'Lax' || value === 'None') return value;
  return 'sin_valor';
}

/**
 * Ejecuta la captura completa. Nunca lanza por fallas de red del sitio: las registra en `errors`.
 * Ética: una sola pasada por página, solo GET, terceros bloqueados (salvo `allowThirdParty`) y
 * tope compartido de peticiones contando las de `fetch`.
 */
export async function capturePassive(options: CaptureOptions): Promise<PassiveCapture> {
  const target = new URL(options.targetUrl);
  const policy = createRequestPolicy({
    budget: options.budget,
    target,
    targetPages: options.pages.map((page) => page.url),
    allowNonGet: false,
    allowThirdParty: options.allowThirdParty,
  });
  const requests: CapturedRequest[] = [];
  const resources: CapturedResource[] = [];
  const pages: CapturedPage[] = [];
  const errors: string[] = [];
  let currentLabel = options.pages[0]?.label ?? 'inicio';

  const { browser, context } = await launchHardenedBrowser({
    target,
    policy,
    currentLabel: () => currentLabel,
    onRequest: (request) => requests.push(request),
    onText: (text) => resources.push({ ...text, page: currentLabel }),
    maxResourceBytes: options.maxResourceBytes,
    timeoutMs: options.navigationTimeoutMs,
    ...(options.hostResolverRules === undefined
      ? {}
      : { hostResolverRules: options.hostResolverRules }),
  });
  try {
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(options.navigationTimeoutMs);
    for (const pageTarget of options.pages) {
      currentLabel = pageTarget.label;
      const documentResult = await fetchDocument(
        pageTarget.url,
        target,
        policy,
        options.navigationTimeoutMs,
        options.maxResourceBytes,
      );
      if (documentResult.error !== undefined) errors.push(documentResult.error);
      if (documentResult.status === null) {
        pages.push({ label: pageTarget.label, ...documentResult, storage: [] });
        continue;
      }
      try {
        await page.goto(pageTarget.url, { waitUntil: 'load' });
        await page
          .waitForLoadState('networkidle', {
            timeout: Math.min(options.navigationTimeoutMs, 15_000),
          })
          .catch(() => undefined);
        await page.waitForTimeout(options.settleMs ?? DEFAULT_SETTLE_MS);
      } catch (error) {
        errors.push(
          `No se pudo cargar ${pageTarget.url} en el navegador: ${error instanceof Error ? error.message.split('\n')[0] : 'error desconocido'}.`,
        );
      }
      let storage: StorageEntry[] = [];
      // Seguridad: si el documento terminó fuera del sitio, su almacenamiento no es del sitio.
      if (classifyUrl(page.url(), target) === 'tercero') {
        errors.push(`${pageTarget.url} terminó en un tercero (${new URL(page.url()).host}).`);
      } else {
        try {
          storage = await readBrowserStorage(page, MAX_STORAGE_VALUE_CHARS);
        } catch {
          errors.push(`No se pudo leer el almacenamiento de ${pageTarget.url}.`);
        }
      }
      pages.push({ label: pageTarget.label, ...documentResult, storage });
    }

    const cookies: CapturedCookie[] = (await context.cookies()).map((cookie) => ({
      name: cookie.name,
      domain: cookie.domain,
      isSecure: cookie.secure,
      isHttpOnly: cookie.httpOnly,
      sameSite: sameSiteOf(cookie.sameSite),
      source: 'navegador',
    }));
    return {
      targetUrl: target.href,
      pages,
      requests,
      resources,
      cookies,
      requestCount: options.budget.count(),
      isRequestLimitReached: options.budget.isLimitReached(),
      errors,
    };
  } finally {
    await browser.close();
  }
}
