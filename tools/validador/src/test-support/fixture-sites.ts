// Sitios de prueba locales para el validador: uno «bueno» con todas las protecciones, uno «malo»
// con cabeceras faltantes, scripts de un tercero simulado, borrador en localStorage, dictado,
// Mapbox, analítica y cookies débiles, y el tercero simulado. Todo escucha en 127.0.0.1.
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';

/** Sitio levantado para una prueba. */
export interface FixtureSite {
  url: string;
  port: number;
  /** Peticiones recibidas (método y ruta), para comprobar lo que hizo el validador. */
  hits: string[];
  close(): Promise<void>;
}

/** Nombre del tercero simulado; Chromium lo resuelve a 127.0.0.1 con `hostResolverRules`. */
export const THIRD_PARTY_HOST = 'rastreo.tercero.example';

/**
 * Reglas de resolución de Chromium para las pruebas: el tercero simulado va a 127.0.0.1 y
 * cualquier otro nombre falla, así nada sale a internet aunque una página lo intente.
 */
export const TEST_HOST_RULES = `MAP ${THIRD_PARTY_HOST} 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`;

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

async function listen(handler: Handler): Promise<FixtureSite> {
  const hits: string[] = [];
  const server: Server = createServer((request, response) => {
    hits.push(`${request.method ?? '?'} ${request.url ?? '/'}`);
    handler(request, response);
  });
  // WebSocket mínimo: completa el saludo y registra la conexión y los mensajes recibidos.
  server.on('upgrade', (request: IncomingMessage, socket: Socket) => {
    hits.push(`UPGRADE ${request.url ?? '/'}`);
    const key = String(request.headers['sec-websocket-key'] ?? '');
    const accept = createHash('sha1')
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64');
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    socket.on('data', () => hits.push(`FRAME ${request.url ?? '/'}`));
    socket.on('error', () => undefined);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/`,
    port,
    hits,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

const GOOD_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'X-Content-Type-Options': 'nosniff',
};

const GOOD_PAGE = `<!doctype html>
<html lang="es-MX"><head><meta charset="utf-8"><title>Sitio bueno</title>
<link rel="stylesheet" href="/estilos.css"><script type="module" src="/app.js"></script></head>
<body><h1>Denuncia</h1><form><label>Hechos <textarea name="hechos"></textarea></label>
<button type="button">Continuar</button></form></body></html>`;

/** Código del sitio bueno: guarda en memoria y no usa almacenamiento persistente. */
const GOOD_SCRIPT = `const memoria = new Map();
document.addEventListener('input', (evento) => memoria.set(evento.target.name, evento.target.value));
fetch('/api/estado').catch(() => undefined);`;

/** Sitio que cumple todas las verificaciones pasivas (salvo HSTS, que no aplica en HTTP local). */
export function startGoodSite(): Promise<FixtureSite> {
  return listen((request, response) => {
    const path = new URL(request.url ?? '/', 'http://local').pathname;
    if (path === '/app.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      response.end(GOOD_SCRIPT);
      return;
    }
    if (path === '/estilos.css') {
      response.writeHead(200, { 'Content-Type': 'text/css' });
      response.end('body { font-family: system-ui; }');
      return;
    }
    if (path === '/api/estado') {
      response.writeHead(200, { ...GOOD_HEADERS, 'Content-Type': 'application/json' });
      response.end('{"estado":"ok"}');
      return;
    }
    if (path === '/favicon.ico') {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, {
      ...GOOD_HEADERS,
      'Content-Type': 'text/html; charset=utf-8',
      'Set-Cookie': 'sesion=abc123; Path=/; Secure; HttpOnly; SameSite=Strict',
    });
    response.end(GOOD_PAGE);
  });
}

/** Código del sitio malo: borrador, dictado, Mapbox, analítica y folio con año y consecutivo. */
function badScript(thirdPartyOrigin: string): string {
  return `const formData = { hechos: 'Texto sintético del borrador de la denuncia en claro', paso: 2 };
localStorage.setItem('borrador-denuncia', JSON.stringify(formData));
const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;
async function geocodificar(texto) {
  return fetch("https://api.mapbox.com/geocoding/v5/mapbox.places/" + texto + ".json?access_token=pk.sintetico");
}
window.dataLayer = window.dataLayer || [];
function gtag(){ dataLayer.push(arguments); }
gtag('config', 'G-SINTETICO');
const FOLIO = /^QJA-\\d{4}\\d{6}$/;
fetch('/api/enviar', { method: 'POST', body: '{}' }).catch(() => undefined);
fetch('/api/auth/session').catch(() => undefined);
fetch('${thirdPartyOrigin}/collect?evento=carga').catch(() => undefined);`;
}

function badPage(thirdPartyOrigin: string): string {
  return `<!doctype html>
<html lang="es-MX"><head><meta charset="utf-8"><title>Sitio malo</title>
<meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval'">
<link rel="stylesheet" href="${thirdPartyOrigin}/fuentes.css">
<script src="${thirdPartyOrigin}/rastreador.js"></script>
<script src="/app.js"></script></head>
<body><h1>Presentar denuncia</h1><p>Tu avance se guarda sólo en este dispositivo.</p>
<p>Ejemplo de folio: QJA-2031000123</p>
<form><textarea name="hechos"></textarea><button type="button">Siguiente</button></form></body></html>`;
}

/** Sitio que incumple: sin cabeceras, con terceros y con un borrador en localStorage. */
export function startBadSite(thirdPartyOrigin: string): Promise<FixtureSite> {
  return listen((request, response) => {
    const path = new URL(request.url ?? '/', 'http://local').pathname;
    if (path === '/app.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' });
      response.end(badScript(thirdPartyOrigin));
      return;
    }
    if (path.startsWith('/api/')) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{}');
      return;
    }
    if (path === '/favicon.ico') {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Powered-By': 'MarcoSintetico 1.0',
      'Set-Cookie': ['_ga=GA1.1.123.456; Path=/', 'preferencia=oscuro; Path=/'],
    });
    response.end(badPage(thirdPartyOrigin));
  });
}

/** Tercero simulado: sirve un script, una hoja de estilos y acepta WebSocket (registrados). */
export function startThirdParty(): Promise<FixtureSite> {
  return listen((request, response) => {
    const path = new URL(request.url ?? '/', 'http://local').pathname;
    response.writeHead(200, {
      'Content-Type': path.endsWith('.css') ? 'text/css' : 'text/javascript',
    });
    response.end(path.endsWith('.css') ? 'body{}' : 'window.rastreado = true;');
  });
}

/**
 * Sitio hostil: abre WebSocket al tercero y al propio origen, intenta WebRTC con un servidor STUN
 * local, enmarca una página que redirige a `/admin/panel` y su formulario redirige al tercero.
 */
export function startHostileSite(thirdPartyOrigin: string, stunPort: number): Promise<FixtureSite> {
  const wsThird = thirdPartyOrigin.replace(/^http/, 'ws');
  const script = `try { const w = new WebSocket('${wsThird}/ws'); w.onopen = () => w.send('fuga'); } catch (e) {}
try { const p = new WebSocket('ws://' + location.host + '/ws-propio'); p.onopen = () => p.send('propio'); } catch (e) {}
try { const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:127.0.0.1:${stunPort}' }] }); pc.createDataChannel('x'); pc.createOffer().then((o) => pc.setLocalDescription(o)); } catch (e) {}`;
  return listen((request, response) => {
    const path = new URL(request.url ?? '/', 'http://local').pathname;
    if (path === '/hostil.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' });
      response.end(script);
      return;
    }
    if (path === '/salto') {
      response.writeHead(302, { Location: '/admin/panel' });
      response.end();
      return;
    }
    if (path === '/presentar-denuncia') {
      response.writeHead(302, { Location: `${thirdPartyOrigin}/redir-tercero` });
      response.end();
      return;
    }
    if (path === '/') {
      // Sin CSP a propósito: así es el validador, no el navegador, quien bloquea.
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(
        '<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><title>Hostil</title><script src="/hostil.js"></script></head><body><iframe src="/salto"></iframe></body></html>',
      );
      return;
    }
    response.writeHead(404);
    response.end();
  });
}
