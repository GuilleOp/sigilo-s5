// Todo lo que se publica en `estandar/`: las operaciones del nodo, el grupo «Red» (enrutador y
// buzón de red) y el grupo «Corroboración» (evaluador OPRF e índice), con sus componentes,
// ejemplos y secciones. Une los grupos en un solo lugar.
import type { z } from 'zod';
import {
  CORROBORATION_COMPONENTS,
  CORROBORATION_EXAMPLES,
  CORROBORATION_OPERATIONS,
  CORROBORATION_TAG,
  NETWORK_COMPONENTS,
  NETWORK_EXAMPLES,
  NETWORK_EXTRA_EXAMPLES,
  NETWORK_OPERATIONS,
  NETWORK_TAG,
  PDN_COMPONENTS,
  PDN_EXAMPLES,
  PDN_EXTRA_EXAMPLES,
  PDN_OPERATIONS,
  PDN_TAG,
  STANDARD_COMPONENTS,
  STANDARD_EXAMPLES,
  STANDARD_OPERATIONS,
  STANDARD_TAGS,
} from '@sigilo/contracts/standard';
import type {
  CorroborationOperation,
  NetworkOperation,
  PdnOperation,
  StandardOperation,
} from '@sigilo/contracts/standard';

/** Operación publicada: del nodo, del grupo «Red», del grupo «PDN» o del grupo «Corroboración». */
export type PublishedOperation =
  StandardOperation | NetworkOperation | PdnOperation | CorroborationOperation;

/** Esquemas con nombre: primero los del nodo y después los de la red. */
export const PUBLISHED_COMPONENTS: Readonly<Record<string, z.ZodType>> = {
  ...STANDARD_COMPONENTS,
  ...NETWORK_COMPONENTS,
  ...PDN_COMPONENTS,
  ...CORROBORATION_COMPONENTS,
};

/** Ejemplos sintéticos de ambos grupos, por nombre de archivo. */
export const PUBLISHED_EXAMPLES: Readonly<Record<string, unknown>> = {
  ...STANDARD_EXAMPLES,
  ...NETWORK_EXAMPLES,
  ...PDN_EXAMPLES,
  ...CORROBORATION_EXAMPLES,
};

/** Ejemplos de componentes que no son cuerpo de ninguna operación. */
export const PUBLISHED_EXTRA_EXAMPLES: Readonly<Record<string, string>> = {
  IdentityBlock: 'sealed-identity.content',
  ApiError: 'error',
  ...NETWORK_EXTRA_EXAMPLES,
  ...PDN_EXTRA_EXAMPLES,
};

/** Operaciones en el orden del documento. */
export const PUBLISHED_OPERATIONS: readonly PublishedOperation[] = [
  ...STANDARD_OPERATIONS,
  ...NETWORK_OPERATIONS,
  ...PDN_OPERATIONS,
  ...CORROBORATION_OPERATIONS,
];

/** Secciones en el orden en que se muestran. */
export const PUBLISHED_TAGS: readonly { name: string; description: string }[] = [
  ...STANDARD_TAGS,
  NETWORK_TAG,
  PDN_TAG,
  CORROBORATION_TAG,
];

/** Servidores de las operaciones que sirve el enrutador (las del nodo usan los del documento). */
export const ROUTER_SERVERS: readonly { url: string; description: string }[] = [
  {
    url: 'http://127.0.0.1:8790',
    description: 'Enrutador en local (`npm run dev:enrutador` o `docker compose up`).',
  },
  {
    url: 'https://red.example.org',
    description: 'Ejemplo de un enrutador publicado (dominio reservado para ejemplos).',
  },
];

/** Servidores del evaluador OPRF de la corroboración. */
export const EVALUATOR_SERVERS: readonly { url: string; description: string }[] = [
  {
    url: 'http://127.0.0.1:8791',
    description: 'Evaluador OPRF en local (`npm run dev:evaluador`).',
  },
  {
    url: 'https://evaluador.example.org',
    description: 'Ejemplo de un evaluador publicado (dominio reservado para ejemplos).',
  },
];

/** Servidores del índice de coincidencias de la corroboración. */
export const INDEX_SERVERS: readonly { url: string; description: string }[] = [
  {
    url: 'http://127.0.0.1:8792',
    description: 'Índice de coincidencias en local (`npm run dev:indice`).',
  },
  {
    url: 'https://indice.example.org',
    description: 'Ejemplo de un índice publicado (dominio reservado para ejemplos).',
  },
];

/** Servidores que se declaran en la ruta según quién sirve la operación (null: los del nodo). */
export function operationServers(
  operation: PublishedOperation,
): readonly { url: string; description: string }[] | null {
  if (!('servedBy' in operation)) return null;
  switch (operation.servedBy) {
    case 'router':
      return ROUTER_SERVERS;
    case 'evaluator':
      return EVALUATOR_SERVERS;
    case 'index':
      return INDEX_SERVERS;
    case 'node':
      return null;
  }
}
