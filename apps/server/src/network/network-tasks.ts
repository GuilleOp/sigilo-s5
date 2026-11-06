// Tareas de red del nodo en la tarea periódica: registrarse ante el enrutador (acepta sobres),
// publicar la cabeza firmada de su bitácora en la bitácora nacional y, si el directorio lo nombra
// testigo, cofirmar la cabeza nacional después de verificarla.
import { STANDARD_VERSION } from '@sigilo/contracts/standard';
import { createNodeNetworkClient } from '@sigilo/red';
import { runWitnessOnce } from '@sigilo/red/witness';
import type { WitnessOutcome } from '@sigilo/red/witness';
import type { AppContext } from '../context.ts';
import type { NodeNetwork } from './network-context.ts';

/** Resultado de una vuelta de las tareas de red (para registros y pruebas). */
export interface NetworkRound {
  registered: boolean;
  publishedSeq: number | null;
  witness: WitnessOutcome | null;
}

/** Tareas de red con su estado en memoria (registro hecho y última cabeza publicada). */
export interface NetworkTasks {
  run(): Promise<NetworkRound>;
}

/**
 * Crea las tareas de red. El registro se reintenta en cada vuelta hasta que el enrutador lo acepta
 * (por ejemplo, si el nodo arrancó antes que él); la cabeza se publica cuando cambia.
 * `witnessStatePath` es el archivo de estado del testigo; sin él, el nodo no cofirma aunque el
 * directorio lo nombre testigo.
 * Seguridad: el registro, la cabeza y la cofirma se firman con la llave del nodo en el directorio
 * (la misma de `keys.json`); ningún mensaje lleva datos de denuncias.
 */
export function createNetworkTasks(
  ctx: AppContext,
  network: NodeNetwork,
  witnessStatePath: string | null,
): NetworkTasks {
  const routerUrl = network.routerUrl;
  const signingPrivateKey = ctx.deps.keys.serverSigningPrivateKey;
  const client =
    routerUrl === null
      ? null
      : createNodeNetworkClient({
          routerUrl,
          nodeId: network.nodeId,
          signingPrivateKey,
          fetch: network.fetch,
        });
  const isWitness = network.directory.witnessPolicy.witnessIds.includes(network.nodeId);
  let isRegistered = false;
  let lastPublished: string | null = null;
  return {
    async run() {
      const round: NetworkRound = { registered: isRegistered, publishedSeq: null, witness: null };
      if (client === null || routerUrl === null) return round;
      if (!isRegistered) {
        await client.register({
          // Crece en cada registro: segundos Unix del reloj del nodo.
          sequence: Math.floor(ctx.deps.now().getTime() / 1000),
          standardVersion: STANDARD_VERSION,
          acceptsRelay: true,
        });
        isRegistered = true;
        round.registered = true;
      }
      const head = ctx.ledger.head();
      const key = `${head.seq}:${head.hash}`;
      if (head.seq > 0 && key !== lastPublished) {
        await client.publishHead(head);
        lastPublished = key;
        round.publishedSeq = head.seq;
      }
      if (isWitness && witnessStatePath !== null) {
        round.witness = await runWitnessOnce({
          routerUrl,
          witnessId: network.nodeId,
          signingPrivateKey,
          trust: network.trust,
          statePath: witnessStatePath,
          fetch: network.fetch,
        });
      }
      return round;
    },
  };
}
