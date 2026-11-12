// Raíz de confianza de la red federada fijada en el bundle. El archivo JSON lo escribe
// `npm run red:demo` (`.red-demo/nodos/<nodo>/web/network-trust.json`) al construir la web de un
// nodo; con `null` la web trabaja con un solo nodo, como antes. `/config/sigilo.json` lo sustituye.
import { NetworkTrustAnchorSchema } from '@sigilo/contracts';
import type { NetworkTrustAnchor } from '@sigilo/contracts';
import rawTrust from './network-trust.json';

/**
 * Valida la raíz fijada: `null` (sin red) o una raíz con la llave de la operación y los testigos.
 * Seguridad: una raíz mal formada no se usa; la web no cae a «cualquier directorio sirve».
 */
export function parseNetworkTrust(raw: unknown): NetworkTrustAnchor | null {
  if (raw === null) return null;
  return NetworkTrustAnchorSchema.parse(raw);
}

/**
 * Raíz de confianza de la red, o `null` si esta web no participa en la red. Enlace vivo:
 * `setNetworkTrust` lo cambia con `/config/sigilo.json` antes de montar la aplicación.
 */
export let NETWORK_TRUST: NetworkTrustAnchor | null = parseNetworkTrust(rawTrust);

/** Fija la raíz de la configuración en tiempo de ejecución. Lanza error si no es válida. */
export function setNetworkTrust(raw: unknown): void {
  NETWORK_TRUST = parseNetworkTrust(raw);
}
