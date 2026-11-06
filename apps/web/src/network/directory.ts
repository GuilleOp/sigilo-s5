// Directorio de la red en el navegador: se descarga del mismo origen y se verifica contra la raíz
// fijada en el bundle. Sin raíz fijada, la web trabaja con un solo nodo.
import { NETWORK_ROUTES } from '@sigilo/contracts';
import type { AuthorityDirectory, NetworkTrustAnchor } from '@sigilo/contracts';
import { toDayDate } from '@sigilo/core';
import { verifySignedDirectory } from '@sigilo/red';
import type { DirectoryFailureReason } from '@sigilo/red';
import { NETWORK_TRUST } from '../config/network-trust.ts';
import { createApiClient } from '../services/api-client.ts';
import type { ApiClient } from '../services/api-client.ts';

/**
 * Estado de la red para esta web: `single-node` (no participa en la red), `verified` (directorio
 * firmado y cofirmado por los testigos fijados), `invalid` (el directorio no verifica: no se usa)
 * o `unavailable` (no se pudo descargar).
 */
export type NetworkState =
  | { kind: 'single-node' }
  | { kind: 'verified'; directory: AuthorityDirectory }
  | { kind: 'invalid'; reason: DirectoryFailureReason }
  | { kind: 'unavailable' };

/** Validador que acepta cualquier JSON: la verificación real la hace `verifySignedDirectory`. */
const ANY_JSON = { safeParse: (value: unknown) => ({ success: true as const, data: value }) };

/**
 * Descarga el directorio del mismo origen y lo verifica con la raíz fijada, con el día de hoy.
 * Seguridad (H10): nunca se usa un directorio que no verifica, ni las llaves que no vengan de él;
 * tampoco uno anterior al `minDirectorySerial` de la raíz, vencido o más viejo que
 * `maxDirectoryAgeDays` (un directorio viejo firmado no sirve para revertir llaves).
 */
export async function loadNetworkState(
  trust: NetworkTrustAnchor | null = NETWORK_TRUST,
  client: ApiClient = createApiClient(),
  now: () => Date = () => new Date(),
): Promise<NetworkState> {
  if (trust === null) return { kind: 'single-node' };
  let signed: unknown;
  try {
    signed = await client.json(NETWORK_ROUTES.directory, ANY_JSON);
  } catch {
    return { kind: 'unavailable' };
  }
  const result = verifySignedDirectory(signed, trust, { today: toDayDate(now()) });
  return result.valid
    ? { kind: 'verified', directory: result.directory }
    : { kind: 'invalid', reason: result.reason };
}

let cached: Promise<NetworkState> | null = null;

/**
 * Estado de la red de esta pestaña, descargado una sola vez. Un fallo de descarga no se recuerda:
 * la siguiente llamada lo vuelve a intentar.
 */
export function networkState(): Promise<NetworkState> {
  cached ??= loadNetworkState().then((state) => {
    if (state.kind === 'unavailable') cached = null;
    return state;
  });
  return cached;
}
