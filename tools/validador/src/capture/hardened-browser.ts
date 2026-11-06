// Chromium endurecido para el validador: cada petición HTTP pasa por la política (también cada
// salto de una redirección), los WebSocket a terceros se cierran, WebRTC queda deshabilitado y
// todo intento se registra como evidencia.
import { chromium } from '@playwright/test';
import type { Browser, BrowserContext, Page, Route, WebSocketRoute } from '@playwright/test';
import type { CapturedRequest, StorageEntry } from '../types.ts';
import { USER_AGENT } from '../version.ts';
import { classifyUrl } from './party.ts';
import type { createRequestPolicy } from './policy.ts';

type RequestPolicy = ReturnType<typeof createRequestPolicy>;

/** Recurso de texto recibido (para el análisis estático). */
export interface ReceivedText {
  url: string;
  contentType: string;
  body: string;
  isTruncated: boolean;
}

/** Opciones del navegador endurecido. */
export interface HardenedBrowserOptions {
  target: URL;
  policy: RequestPolicy;
  /** Página en curso, para etiquetar las peticiones. */
  currentLabel: () => string;
  /** Recibe cada petición registrada (HTTP, WebSocket o intento de WebRTC). */
  onRequest: (request: CapturedRequest) => void;
  /** Recibe los cuerpos de texto de las respuestas 2xx del propio sitio. */
  onText?: (text: ReceivedText) => void;
  maxResourceBytes: number;
  timeoutMs: number;
  /** Solo pruebas: reglas de resolución de nombres de Chromium. */
  hostResolverRules?: string;
}

const TEXT_CONTENT_TYPE = /(text\/|javascript|json|xml|x-component|svg)/i;
/** Saltos de redirección que el validador sigue por petición del navegador. */
const MAX_BROWSER_REDIRECTS = 5;

/**
 * Banderas de Chromium: WebRTC sin UDP directo (no revela IP aunque una página evada el script
 * que lo deshabilita) y sin descubrimiento de dispositivos locales.
 */
const HARDENING_ARGS = [
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
  '--webrtc-ip-handling-policy=disable_non_proxied_udp',
  '--disable-features=WebRtcHideLocalIpsWithMdns,MediaRouter,DialMediaRouteProvider',
];

/**
 * Script que reemplaza los constructores de WebRTC antes de que cargue cualquier código de la
 * página: registra el intento con sus servidores ICE y lanza un error.
 */
const DISABLE_WEBRTC_SCRIPT = `(() => {
  const report = (config) => {
    try {
      const servers = (config && Array.isArray(config.iceServers) ? config.iceServers : [])
        .flatMap((server) => (Array.isArray(server.urls) ? server.urls : [server.urls]))
        .filter((url) => typeof url === 'string');
      window.__sigiloWebRtc(JSON.stringify(servers));
    } catch (error) {}
  };
  for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection']) {
    const Blocked = function (config) {
      report(config);
      throw new DOMException('WebRTC deshabilitado por sigilo-validar.', 'NotSupportedError');
    };
    try {
      Object.defineProperty(window, name, { value: Blocked, writable: false, configurable: false });
    } catch (error) {}
  }
})();`;

/** Lista de servidores ICE que reportó el script de la página. */
function parseServers(payload: unknown): string[] {
  try {
    const parsed: unknown = JSON.parse(String(payload));
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

/** Host de una URL de servidor ICE (`stun:host:puerto`, `turn:host?transport=udp`). */
function iceHost(url: string): string {
  const rest = url.replace(/^(?:stuns?|turns?):/i, '').split('?')[0] ?? '';
  return rest.startsWith('[') ? rest.slice(0, rest.indexOf(']') + 1) : (rest.split(':')[0] ?? '');
}

async function handleRoute(route: Route, options: HardenedBrowserOptions): Promise<void> {
  const request = route.request();
  const url = request.url();
  // El saludo de un WebSocket ya lo decidió (y lo contó) `handleWebSocket`.
  if (request.resourceType() === 'websocket' || /^wss?:/i.test(url)) {
    await route.continue();
    return;
  }
  const party = classifyUrl(url, options.target);
  const decision = options.policy.decide({
    method: request.method(),
    url,
    resourceType: request.resourceType(),
    party,
    isNavigation: request.isNavigationRequest(),
  });
  const record: CapturedRequest = {
    url,
    method: request.method(),
    resourceType: request.resourceType(),
    page: options.currentLabel(),
    party,
    status: null,
    isBlocked: !decision.isAllowed,
    ...(decision.isAllowed ? {} : { blockReason: decision.reason }),
  };
  if (party !== 'incrustado') options.onRequest(record);
  if (!decision.isAllowed) {
    await route.abort('blockedbyclient');
    return;
  }
  if (party === 'incrustado') {
    await route.continue();
    return;
  }
  try {
    // Seguridad: Chromium sigue por su cuenta las redirecciones de una respuesta entregada con
    // `fulfill`, sin volver a pasar por la ruta. Por eso el validador sigue cada salto aquí,
    // decide con la política (y lo cuenta en el tope) y entrega al navegador solo la respuesta
    // final. Limitación: la página queda con la URL original.
    let response = await route.fetch({ maxRedirects: 0, timeout: options.timeoutMs });
    record.status = response.status();
    let finalUrl = url;
    for (let hop = 0; hop < MAX_BROWSER_REDIRECTS; hop += 1) {
      const location = response.headers()['location'];
      if (response.status() < 300 || response.status() >= 400 || location === undefined) break;
      const next = new URL(location, finalUrl).href;
      const nextParty = classifyUrl(next, options.target);
      const hopDecision = options.policy.decide({
        method: 'GET',
        url: next,
        resourceType: request.resourceType(),
        party: nextParty,
        isNavigation: request.isNavigationRequest(),
      });
      const hopRecord: CapturedRequest = {
        url: next,
        method: 'GET',
        resourceType: request.resourceType(),
        page: options.currentLabel(),
        party: nextParty,
        status: null,
        isBlocked: !hopDecision.isAllowed,
        ...(hopDecision.isAllowed ? {} : { blockReason: hopDecision.reason }),
      };
      options.onRequest(hopRecord);
      if (!hopDecision.isAllowed) {
        await route.fulfill({
          status: 403,
          contentType: 'text/plain; charset=utf-8',
          body: 'Redirección bloqueada por sigilo-validar.',
        });
        return;
      }
      response = await route.fetch({ url: next, maxRedirects: 0, timeout: options.timeoutMs });
      hopRecord.status = response.status();
      finalUrl = next;
    }
    if (response.status() >= 300 && response.status() < 400) {
      await route.fulfill({ status: 508, body: 'Demasiadas redirecciones.' });
      return;
    }
    const headers = response.headers();
    const contentType = headers['content-type'] ?? '';
    const declaredLength = Number(headers['content-length'] ?? '0');
    const body = await response.body();
    if (
      options.onText !== undefined &&
      TEXT_CONTENT_TYPE.test(contentType) &&
      response.status() < 300 &&
      classifyUrl(finalUrl, options.target) !== 'tercero'
    ) {
      options.onText({
        url: finalUrl,
        contentType,
        body: body.subarray(0, options.maxResourceBytes).toString('utf8'),
        isTruncated: body.length > options.maxResourceBytes || declaredLength > body.length,
      });
    }
    await route.fulfill({ response, body });
  } catch {
    await route.abort('failed').catch(() => undefined);
  }
}

/**
 * WebSocket: ninguno se abre. A un tercero se cierra por la política; al propio sitio también, por
 * dos razones: el modo pasivo no abre canales persistentes y, como el validador entrega los
 * documentos con `route.fulfill` para controlar las redirecciones, Playwright no puede conectar el
 * WebSocket con el servidor real (`connectToServer` no llega a abrirse en esas páginas).
 */
function handleWebSocket(ws: WebSocketRoute, options: HardenedBrowserOptions): void {
  const url = ws.url();
  const httpUrl = url.replace(/^ws/i, 'http');
  const party = classifyUrl(httpUrl, options.target);
  const reason =
    party === 'tercero'
      ? 'WebSocket a un tercero: se registra y no se abre'
      : 'WebSocket del propio sitio: el validador no abre canales persistentes';
  options.onRequest({
    url,
    method: 'GET',
    resourceType: 'websocket',
    page: options.currentLabel(),
    party,
    status: null,
    isBlocked: true,
    blockReason: reason,
  });
  void ws.close({ code: 1008, reason: 'Bloqueado por sigilo-validar' });
}

/**
 * Abre Chromium con el User-Agent del validador, sin trabajadores de servicio ni permisos, con la
 * política aplicada a HTTP y WebSocket y con WebRTC deshabilitado.
 */
export async function launchHardenedBrowser(
  options: HardenedBrowserOptions,
): Promise<{ browser: Browser; context: BrowserContext }> {
  const args = [...HARDENING_ARGS];
  if (options.hostResolverRules !== undefined) {
    args.push(`--host-resolver-rules=${options.hostResolverRules}`);
  }
  const browser = await chromium.launch({ headless: true, args });
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    locale: 'es-MX',
    serviceWorkers: 'block',
    // Seguridad: ninguna credencial ni permiso se concede a la página.
    permissions: [],
  });
  await context.exposeBinding('__sigiloWebRtc', (_source, payload: unknown) => {
    const servers = parseServers(payload);
    const first = servers[0];
    const host = first === undefined ? '' : iceHost(first);
    options.onRequest({
      url: first ?? 'webrtc:sin-servidores-ice',
      method: 'WEBRTC',
      resourceType: 'webrtc',
      page: options.currentLabel(),
      party: host === '' ? 'propio' : classifyUrl(`http://${host}/`, options.target),
      status: null,
      isBlocked: true,
      blockReason:
        'WebRTC deshabilitado: una conexión WebRTC puede revelar la IP de quien denuncia',
    });
  });
  await context.addInitScript(DISABLE_WEBRTC_SCRIPT);
  await context.route('**/*', (route) => handleRoute(route, options));
  await context.routeWebSocket(/.*/, (ws) => handleWebSocket(ws, options));
  return { browser, context };
}

/**
 * Lee localStorage, sessionStorage e IndexedDB de la página actual (sin red). Si se da `marker`,
 * busca la marca en el valor completo de cada entrada antes de recortarlo.
 */
export async function readBrowserStorage(
  page: Page,
  maxChars: number,
  marker?: string,
): Promise<StorageEntry[]> {
  return page.evaluate(
    async ({ limit, mark }: { limit: number; mark: string | null }) => {
      const entries: {
        area: 'localStorage' | 'sessionStorage' | 'indexedDB';
        key: string;
        value: string;
        containsMarker?: boolean;
      }[] = [];
      const push = (
        area: 'localStorage' | 'sessionStorage' | 'indexedDB',
        key: string,
        full: string,
      ): void => {
        entries.push({
          area,
          key,
          value: full.slice(0, limit),
          ...(mark === null ? {} : { containsMarker: full.includes(mark) || key.includes(mark) }),
        });
      };
      for (const area of ['localStorage', 'sessionStorage'] as const) {
        try {
          const storage = window[area];
          for (let index = 0; index < storage.length; index += 1) {
            const key = storage.key(index);
            if (key !== null) push(area, key, storage.getItem(key) ?? '');
          }
        } catch {
          // Almacenamiento no disponible en este contexto.
        }
      }
      try {
        const databases = await indexedDB.databases();
        for (const info of databases) {
          if (info.name === undefined) continue;
          const name = info.name;
          const db = await new Promise<IDBDatabase | null>((resolve) => {
            const request = indexedDB.open(name);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
          });
          if (db === null) continue;
          for (const storeName of Array.from(db.objectStoreNames)) {
            const values = await new Promise<unknown[]>((resolve) => {
              try {
                const request = db
                  .transaction(storeName, 'readonly')
                  .objectStore(storeName)
                  .getAll();
                request.onsuccess = () => resolve(request.result as unknown[]);
                request.onerror = () => resolve([]);
              } catch {
                resolve([]);
              }
            });
            let serialized = '';
            try {
              serialized = JSON.stringify(values);
            } catch {
              serialized = '[valor no serializable]';
            }
            push('indexedDB', `${name}/${storeName}`, serialized);
          }
          db.close();
        }
      } catch {
        // IndexedDB no disponible.
      }
      return entries;
    },
    { limit: maxChars, mark: marker ?? null },
  );
}
