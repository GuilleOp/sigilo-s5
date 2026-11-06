// Hook de React con el estado de la red de esta pestaña (directorio verificado o un solo nodo).
import { useEffect, useState } from 'react';
import { networkState } from './directory.ts';
import type { NetworkState } from './directory.ts';

/** Estado de la red; `loading` mientras se descarga y verifica el directorio. */
export type NetworkStatus = NetworkState | { kind: 'loading' };

/** Descarga y verifica el directorio una sola vez por pestaña. */
export function useNetworkState(): NetworkStatus {
  const [state, setState] = useState<NetworkStatus>({ kind: 'loading' });
  useEffect(() => {
    let isActive = true;
    void networkState().then((loaded) => {
      if (isActive) setState(loaded);
    });
    return () => {
      isActive = false;
    };
  }, []);
  return state;
}
