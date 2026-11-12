// Configuración en tiempo de ejecución (ADR 0011): antes de montar React, la web descarga
// `/config/sigilo.json` de su mismo origen con las llaves públicas del nodo, la raíz de confianza
// de la red y el origen de la ventanilla. Así una sola imagen sirve a todos los estados. Si el
// archivo no existe (404), sigue con lo que trae el bundle: la demostración y las pruebas no
// cambian.
import { WEB_CONFIG_PATH, WebRuntimeConfigSchema } from '@sigilo/contracts';
import { setVentanillaUrl } from './app-config.ts';
import { setNetworkTrust } from './network-trust.ts';
import { hasPinnedKeys, setPinnedKeys } from './pinned-keys.ts';

/** Resultado de leer la configuración. */
export type RuntimeConfigStatus =
  /** Se aplicó `/config/sigilo.json`. */
  | 'runtime'
  /** No hay archivo y el bundle trae llaves: se usan las del bundle. */
  | 'bundle'
  /** No hay archivo ni llaves en el bundle (imagen genérica sin configurar). */
  | 'missing'
  /** El archivo existe pero no es válido: la web no debe montarse. */
  | 'invalid';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Descarga y aplica la configuración. Nunca lanza error: devuelve el estado.
 * Seguridad: misma fuente de confianza que el bundle (el mismo servidor sirve los dos); sin
 * caché, sin credenciales y sin seguir redirecciones. Un archivo presente pero inválido no cae al
 * bundle: la web se detiene, para no cifrar hacia llaves que alguien quiso cambiar.
 */
export async function initRuntimeConfig(
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
): Promise<RuntimeConfigStatus> {
  let response: Response;
  try {
    response = await fetchImpl(WEB_CONFIG_PATH, {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
    });
  } catch {
    return hasPinnedKeys ? 'bundle' : 'missing';
  }
  if (response.status === 404) return hasPinnedKeys ? 'bundle' : 'missing';
  if (!response.ok) return 'invalid';
  try {
    const config = WebRuntimeConfigSchema.parse(await response.json());
    setPinnedKeys(config.pinnedKeys);
    setNetworkTrust(config.networkTrust);
    setVentanillaUrl(config.ventanillaUrl);
    return 'runtime';
  } catch {
    return 'invalid';
  }
}
