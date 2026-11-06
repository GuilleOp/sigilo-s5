// Clasificación de URLs respecto del sitio validado: propio origen, mismo sitio (subdominio del
// mismo dominio registrable), incrustado (data:, blob:) o tercero.
import type { Party } from '../types.ts';

/**
 * Sufijos públicos de varios niveles más comunes en México y en servicios usados por sitios
 * públicos. Heurística: sin la Public Suffix List completa, un dominio registrable es la última
 * etiqueta más una (o dos si el sufijo está en esta lista).
 */
const MULTI_LABEL_SUFFIXES: ReadonlySet<string> = new Set([
  'gob.mx',
  'com.mx',
  'org.mx',
  'edu.mx',
  'net.mx',
  'nom.mx',
  'co.uk',
  'org.uk',
  'gov.uk',
  'com.br',
  'gov.br',
  'com.ar',
  'gob.ar',
  'co.jp',
  'com.au',
]);

const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** Dominio registrable aproximado de un nombre de host (las IP y `localhost` se devuelven tal cual). */
export function registrableDomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (IPV4_PATTERN.test(host) || host.includes(':') || !host.includes('.')) return host;
  const labels = host.split('.');
  const lastTwo = labels.slice(-2).join('.');
  if (MULTI_LABEL_SUFFIXES.has(lastTwo) && labels.length >= 3) return labels.slice(-3).join('.');
  return lastTwo;
}

/** Clasifica `url` respecto de `target`. Una URL que no se puede interpretar cuenta como tercero. */
export function classifyUrl(url: string, target: URL): Party {
  if (/^(data|blob|about|chrome-extension):/i.test(url)) return 'incrustado';
  let parsed: URL;
  try {
    parsed = new URL(url, target);
  } catch {
    return 'tercero';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return parsed.protocol === 'ws:' || parsed.protocol === 'wss:'
      ? classifyHost(parsed, target)
      : 'incrustado';
  }
  return classifyHost(parsed, target);
}

function classifyHost(parsed: URL, target: URL): Party {
  if (parsed.host === target.host) return 'propio';
  if (parsed.hostname === target.hostname) return 'mismo_sitio';
  return registrableDomain(parsed.hostname) === registrableDomain(target.hostname)
    ? 'mismo_sitio'
    : 'tercero';
}

/** Indica si el host es local (pruebas y nodos levantados en la misma máquina). */
export function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '[::1]' || host === '::1' || host.startsWith('127.');
}
