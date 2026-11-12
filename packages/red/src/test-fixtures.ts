// Red de demostración lista para las pruebas: llaves nuevas, directorio firmado y cofirmado por los
// tres testigos y raíz de confianza. Solo para pruebas; no se exporta desde el paquete.
import type { NetworkTrustAnchor, SignedAuthorityDirectory } from '@sigilo/contracts';
import { cosignDirectory, signDirectory, trustAnchorFromDirectory } from './directory.ts';
import {
  DEMO_WITNESS_IDS,
  buildDemoDirectory,
  demoWitnessPrivateKey,
  generateDemoNetworkKeys,
} from './demo-network.ts';
import type { DemoNetworkKeys } from './demo-network.ts';

/** Día 0 de referencia del escenario. */
export const FIXTURE_DAY = '2026-11-09';

/** Red de prueba completa. */
export interface NetworkFixture {
  keys: DemoNetworkKeys;
  signed: SignedAuthorityDirectory;
  trust: NetworkTrustAnchor;
}

/** Crea una red de prueba con el directorio cofirmado por los testigos indicados (todos por omisión). */
export function createNetworkFixture(
  witnessIds: readonly string[] = DEMO_WITNESS_IDS,
): NetworkFixture {
  const keys = generateDemoNetworkKeys();
  const directory = buildDemoDirectory(keys, {
    issuedOn: FIXTURE_DAY,
    baseUrls: {
      'node.queretaro': 'http://nodo-queretaro.invalid',
      'node.federal': 'http://nodo-federal.invalid',
      'node.oaxaca': 'http://nodo-oaxaca.invalid',
    },
  });
  let signed = signDirectory(directory, keys.operator.privateKey);
  for (const id of witnessIds) {
    signed = cosignDirectory(signed, id, demoWitnessPrivateKey(keys, id));
  }
  return { keys, signed, trust: trustAnchorFromDirectory(directory) };
}
