// Aplicación Hono del enrutador: directorio, reenvío ciego, registro y cabezas de nodos, y
// bitácora nacional con cofirmas e inclusión. Sin registro de peticiones.
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
  NATIONAL_LEDGER_MAX_PAGE,
  NETWORK_ROUTES,
  NationalCosignatureRequestSchema,
  NodeIdSchema,
  NodeRegistrationSchema,
  RelayRequestSchema,
  Sha256HexSchema,
  SignedLedgerHeadSchema,
} from '@sigilo/contracts';
import { toDayDate } from '@sigilo/core';
import {
  findAuthority,
  findNode,
  hasRelayBucketSize,
  isAuthorityValidOn,
  verifyNodeRegistration,
} from '@sigilo/red';
import type { DirectoryStore } from './directory-store.ts';
import { ApiFailure, errorResponse, readJson, securityHeaders } from './http.ts';
import { NationalLedgerRejection } from './national-ledger-service.ts';
import type { NationalLedgerService } from './national-ledger-service.ts';
import type { RelayService } from './relay-service.ts';

/** Dependencias de la aplicación. */
export interface RouterAppDeps {
  directory: DirectoryStore;
  national: NationalLedgerService;
  relay: RelayService;
  now: () => Date;
  hstsMaxAgeSeconds?: number | null;
  /** Reenvíos simultáneos permitidos; los que excedan reciben `429`. */
  maxConcurrentRelays?: number;
}

/** Cuerpo máximo de un sobre de red: el tramo mayor en Base64URL más el encabezado. */
export const MAX_RELAY_BODY_BYTES = 22_400_000;
const MAX_SMALL_BODY_BYTES = 16 * 1024;
const DEFAULT_MAX_CONCURRENT_RELAYS = 64;
const INTEGER_PATTERN = /^\d{1,15}$/u;

function toHonoPath(path: string): string {
  return path.replace(/\{([A-Za-z]+)\}/gu, ':$1');
}

function parseCount(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!INTEGER_PATTERN.test(value)) throw new ApiFailure('bad_request');
  return Number(value);
}

function limitBody(maxSize: number) {
  return bodyLimit({ maxSize, onError: (c) => errorResponse(c, 'payload_too_large') });
}

/** Crea la aplicación del enrutador. */
export function createRouterApp(deps: RouterAppDeps): Hono {
  const app = new Hono();
  const today = (): string => toDayDate(deps.now());
  const maxRelays = deps.maxConcurrentRelays ?? DEFAULT_MAX_CONCURRENT_RELAYS;
  let inFlight = 0;

  app.use('*', securityHeaders(deps.hstsMaxAgeSeconds ?? null));

  app.get(NETWORK_ROUTES.directory, (c) => c.json(deps.directory.signed()));

  // Seguridad: el manejador no lee la dirección del socket ni cabeceras de quien envía; solo el
  // destino y el sobre. La respuesta tiene el mismo estatus y forma para cualquier destino.
  app.post(NETWORK_ROUTES.relay, limitBody(MAX_RELAY_BODY_BYTES), async (c) => {
    const relay = await readJson(c, RelayRequestSchema);
    const directory = deps.directory.directory();
    const authority = findAuthority(directory, relay.to);
    if (authority === undefined || !isAuthorityValidOn(authority, today())) {
      throw new ApiFailure('bad_request');
    }
    const node = findNode(directory, authority.nodeId);
    if (
      node === undefined ||
      relay.sealed.keyId !== node.boxKeyId ||
      !hasRelayBucketSize(relay.sealed)
    ) {
      throw new ApiFailure('bad_request');
    }
    if (inFlight >= maxRelays) throw new ApiFailure('rate_limited');
    inFlight += 1;
    try {
      return c.json(await deps.relay.forward(node, relay));
    } finally {
      inFlight -= 1;
    }
  });

  const nodeFor = (nodeId: string) => {
    if (!NodeIdSchema.safeParse(nodeId).success) throw new ApiFailure('not_found');
    const node = findNode(deps.directory.directory(), nodeId);
    if (node === undefined) throw new ApiFailure('not_found');
    return node;
  };

  app.post(
    toHonoPath(NETWORK_ROUTES.nodeRegistration('{nodeId}')),
    limitBody(MAX_SMALL_BODY_BYTES),
    async (c) => {
      const node = nodeFor(c.req.param('nodeId') ?? '');
      const registration = await readJson(c, NodeRegistrationSchema);
      if (!verifyNodeRegistration(registration, node)) throw new ApiFailure('bad_request');
      const receipt = deps.relay.register(registration, today());
      if (receipt === null) throw new ApiFailure('bad_request');
      return c.json(receipt);
    },
  );

  app.post(
    toHonoPath(NETWORK_ROUTES.nodeHeads('{nodeId}')),
    limitBody(MAX_SMALL_BODY_BYTES),
    async (c) => {
      const node = nodeFor(c.req.param('nodeId') ?? '');
      const head = await readJson(c, SignedLedgerHeadSchema);
      return c.json(await deps.national.recordNodeHead(node, head, today()));
    },
  );

  app.get(NETWORK_ROUTES.nationalHead, (c) => {
    const head = deps.national.publishedHead(deps.directory.trust());
    if (head === null) throw new ApiFailure('not_found');
    return c.json(head);
  });

  app.get(NETWORK_ROUTES.nationalPending, (c) => {
    const head = deps.national.pendingHead();
    if (head === null) throw new ApiFailure('not_found');
    return c.json(head);
  });

  app.post(NETWORK_ROUTES.nationalCosignatures, limitBody(MAX_SMALL_BODY_BYTES), async (c) => {
    const request = await readJson(c, NationalCosignatureRequestSchema);
    return c.json(deps.national.addCosignature(request, deps.directory.trust()));
  });

  app.get(NETWORK_ROUTES.nationalEntries, (c) => {
    const from = parseCount(c.req.query('from'), 0);
    const limit = parseCount(c.req.query('limit'), 100);
    if (limit < 1) throw new ApiFailure('bad_request');
    return c.json({
      entries: deps.national.entries(from, Math.min(limit, NATIONAL_LEDGER_MAX_PAGE)),
      head: deps.national.publishedHead(deps.directory.trust()),
    });
  });

  app.get(NETWORK_ROUTES.nationalInclusion, (c) => {
    const nodeId = c.req.query('nodeId') ?? '';
    const hash = c.req.query('hash') ?? '';
    const seq = parseCount(c.req.query('seq'), -1);
    if (
      seq < 0 ||
      !NodeIdSchema.safeParse(nodeId).success ||
      !Sha256HexSchema.safeParse(hash).success
    ) {
      throw new ApiFailure('bad_request');
    }
    const proof = deps.national.inclusion({ nodeId, seq, hash }, deps.directory.trust());
    if (proof === 'too-long') throw new ApiFailure('payload_too_large');
    if (proof === null) throw new ApiFailure('not_found');
    return c.json(proof);
  });

  app.notFound((c) => errorResponse(c, 'not_found'));
  // Seguridad: los rechazos de la bitácora se responden como `bad_request` sin el motivo, y los
  // errores inesperados como `internal`, sin detalles.
  app.onError((error, c) => {
    if (error instanceof ApiFailure) return errorResponse(c, error.code);
    if (error instanceof NationalLedgerRejection) return errorResponse(c, 'bad_request');
    return errorResponse(c, 'internal');
  });
  return app;
}
