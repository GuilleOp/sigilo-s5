// Aplicación Hono del enrutador: directorio, reenvío ciego, registro y cabezas de nodos, y
// bitácora nacional con cofirmas e inclusión. Sin registro de peticiones.
import { createHash, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
  NATIONAL_LEDGER_MAX_PAGE,
  NETWORK_ROUTES,
  NationalCosignatureRequestSchema,
  NodeIdSchema,
  NodeRegistrationSchema,
  RELAY_MAX_BODY_BYTES,
  RELAY_QUEUE_MAX_BUCKET,
  RELAY_V1_REJECTION_MESSAGE,
  RelayRequestSchema,
  Sha256HexSchema,
  SignedLedgerHeadSchema,
} from '@sigilo/contracts';
import { envelopePlaintextLength, randomBytes, toDayDate, toHex } from '@sigilo/core';
import {
  findNode,
  hasRelayBucketSize,
  isLegacyRelayRequest,
  relayDecoyResponse,
  verifyNodeRegistration,
} from '@sigilo/red';
import type { DirectoryStore } from './directory-store.ts';
import { ApiFailure, errorResponse, readJson, readRawJson, securityHeaders } from './http.ts';
import { NationalLedgerRejection } from './national-ledger-service.ts';
import type { NationalLedgerService } from './national-ledger-service.ts';
import { networkHealthHtml } from './node-health.ts';
import type { NodeHealthMonitor } from './node-health.ts';
import { nationalOpenDataCsv } from './open-data-aggregator.ts';
import type { OpenDataAggregator } from './open-data-aggregator.ts';
import type { NodeStatisticsAggregator } from './node-statistics.ts';
import type { QueuePow } from './queue-pow.ts';
import type { RelayQueue } from './relay-queue.ts';
import type { RelayService } from './relay-service.ts';
import { registerVentanilla } from './web.ts';
import type { VentanillaDeps } from './web.ts';

/** Dependencias de la aplicación. */
export interface RouterAppDeps {
  directory: DirectoryStore;
  national: NationalLedgerService;
  relay: RelayService;
  /**
   * Cola de entrega y su prueba de trabajo. Sin ellas, un sobre con `deferral` se rechaza (`400`)
   * y `queueChallenge` responde `404`.
   */
  queue?: { store: RelayQueue; pow: QueuePow };
  /** Salud de los nodos; sin ella, sus rutas responden `404`. */
  health?: Pick<NodeHealthMonitor, 'snapshot'>;
  /**
   * SHA-256 del token de la operación (`SIGILO_ROUTER_OPERATION_TOKEN`): con él, la salud incluye
   * los conteos de la cola por nodo. Sin él, nadie los ve.
   */
  operationTokenDigest?: Uint8Array | null;
  /** Corte nacional de datos abiertos; sin él, sus rutas responden `404`. */
  openData?: Pick<OpenDataAggregator, 'latest'>;
  /** Corte nacional de la estadística que la SESNA consulta a cada nodo; sin él, `404`. */
  statistics?: Pick<NodeStatisticsAggregator, 'latest'>;
  now: () => Date;
  hstsMaxAgeSeconds?: number | null;
  /** Reenvíos simultáneos permitidos; los que excedan reciben `429`. */
  maxConcurrentRelays?: number;
  /**
   * Bytes de cuerpos de relevo en vuelo a la vez (256 MiB por omisión); lo que exceda recibe `429`
   * antes de leer el cuerpo. Un cuerpo sin `Content-Length` reserva el tope completo.
   */
  maxRelayBytesInFlight?: number;
  /** Ventanilla única en el mismo origen (`web.ts`); sin ella, el enrutador no sirve web. */
  ventanilla?: VentanillaDeps;
}

/** Cuerpo máximo de un sobre de red: el tramo mayor en Base64URL más el encabezado. */
export const MAX_RELAY_BODY_BYTES = RELAY_MAX_BODY_BYTES;
const MAX_SMALL_BODY_BYTES = 16 * 1024;
const DEFAULT_MAX_CONCURRENT_RELAYS = 64;
/** Presupuesto de bytes de relevo en vuelo por omisión: unos 11 sobres del tramo mayor. */
export const DEFAULT_MAX_RELAY_BYTES_IN_FLIGHT = 256 * 1024 * 1024;
const CONTENT_LENGTH_PATTERN = /^\d{1,10}$/u;
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
  const maxBytesInFlight = deps.maxRelayBytesInFlight ?? DEFAULT_MAX_RELAY_BYTES_IN_FLIGHT;
  let inFlight = 0;
  let bytesInFlight = 0;

  // Seguridad (H02): el cupo de reenvíos y el presupuesto de bytes se reservan ANTES de leer el
  // cuerpo, con lo que declara `Content-Length` (o el tope completo si no viene). Así unas decenas de
  // peticiones de 22 MB sin autenticar no llenan la memoria: las que no caben reciben `429` sin
  // que se lea un byte, y `bodyLimit` corta el flujo si el cuerpo real excede lo declarado.
  const relayGate: MiddlewareHandler = async (c, next) => {
    const declared = c.req.header('Content-Length');
    let reserved = MAX_RELAY_BODY_BYTES;
    if (declared !== undefined) {
      if (!CONTENT_LENGTH_PATTERN.test(declared)) throw new ApiFailure('bad_request');
      reserved = Number(declared);
      if (reserved > MAX_RELAY_BODY_BYTES) throw new ApiFailure('payload_too_large');
    }
    if (inFlight >= maxRelays || bytesInFlight + reserved > maxBytesInFlight) {
      throw new ApiFailure('rate_limited');
    }
    inFlight += 1;
    bytesInFlight += reserved;
    try {
      await next();
    } finally {
      inFlight -= 1;
      bytesInFlight -= reserved;
    }
  };

  registerVentanilla(app, deps.ventanilla);
  app.use('*', securityHeaders(deps.hstsMaxAgeSeconds ?? null));

  app.get(NETWORK_ROUTES.directory, (c) => c.json(deps.directory.signed()));

  // Seguridad: el manejador no lee la dirección del socket ni cabeceras de quien envía; solo el
  // nodo destino y el sobre (v2: la autoridad va cifrada adentro). La respuesta tiene el mismo
  // estatus y forma para cualquier destino.
  app.post(NETWORK_ROUTES.relay, relayGate, limitBody(MAX_RELAY_BODY_BYTES), async (c) => {
    const raw = await readRawJson(c);
    if (isLegacyRelayRequest(raw)) {
      return c.json({ error: { code: 'bad_request', message: RELAY_V1_REJECTION_MESSAGE } }, 400);
    }
    const parsed = RelayRequestSchema.safeParse(raw);
    if (!parsed.success) throw new ApiFailure('bad_request');
    const relay = parsed.data;
    const node = findNode(deps.directory.directory(), relay.node);
    if (
      node === undefined ||
      relay.sealed.keyId !== node.boxKeyId ||
      !hasRelayBucketSize(relay.sealed)
    ) {
      throw new ApiFailure('bad_request');
    }
    const queue = deps.queue;
    if (relay.deferral !== undefined) {
      if (queue === undefined) throw new ApiFailure('bad_request');
      // La cola solo guarda denuncias sin pruebas adjuntas: tramos de hasta 1 MiB.
      if ((envelopePlaintextLength(relay.sealed) ?? Infinity) > RELAY_QUEUE_MAX_BUCKET) {
        throw new ApiFailure('payload_too_large');
      }
      // Seguridad: el nodo caído no puede cobrar su reto; el enrutador cobra el suyo antes de
      // aceptar guardar nada.
      if (!queue.pow.spend(relay.deferral.proof)) throw new ApiFailure('proof_required');
    }
    const onUnavailable =
      relay.deferral === undefined || queue === undefined
        ? undefined
        : () => {
            const receipt = queue.store.enqueue(node, relay);
            if (receipt === null) throw new ApiFailure('rate_limited');
            // Mismo relleno que un sobre no entregado, con el acuse firmado de la cola.
            return { ...relayDecoyResponse(toHex(randomBytes(8))), queued: receipt };
          };
    // Seguridad (H07): la marca de entrega diferida solo viaja desde la cola. El primer intento va
    // sin ella: si el nodo está arriba cobra su propia prueba de trabajo (la adaptativa) y la marca
    // no sirve para saltársela ni para gastar el cupo de diferidas del nodo. Solo si el nodo no está
    // disponible se guarda el sobre completo, con la marca, para los reintentos.
    const immediate: typeof relay =
      relay.deferral === undefined ? relay : { v: relay.v, node: relay.node, sealed: relay.sealed };
    return c.json(await deps.relay.forward(node, immediate, onUnavailable));
  });

  app.get(NETWORK_ROUTES.queueChallenge, (c) => {
    if (deps.queue === undefined) throw new ApiFailure('not_found');
    return c.json(deps.queue.pow.issue());
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

  // Salud de los nodos: nodos y versiones, sin denuncias. Seguridad (H08): el conteo de la cola por
  // nodo es un canal lateral (dice cuándo alguien denunció ante un nodo caído), así que solo lo ve
  // la operación con su token (`Authorization: Bearer`); la vista pública lo publica como `null`.
  const health = (c: Context) => {
    if (deps.health === undefined) throw new ApiFailure('not_found');
    return deps.health.snapshot({ includeQueue: isOperation(c) });
  };
  const isOperation = (c: Context): boolean => {
    const digest = deps.operationTokenDigest;
    if (digest === undefined || digest === null) return false;
    const match = /^Bearer ([\x21-\x7e]{1,512})$/u.exec(c.req.header('Authorization') ?? '');
    if (match === null) return false;
    const actual = createHash('sha256')
      .update(match[1] ?? '', 'utf8')
      .digest();
    return actual.length === digest.length && timingSafeEqual(actual, digest);
  };
  app.get(NETWORK_ROUTES.networkHealth, (c) => c.json(health(c)));
  app.get(NETWORK_ROUTES.networkHealthView, (c) => c.html(networkHealthHtml(health(c))));

  // Corte nacional de datos abiertos: solo números ya publicados por cada nodo.
  const latestOpenData = () => {
    const latest = deps.openData?.latest() ?? null;
    if (latest === null) throw new ApiFailure('not_found');
    return latest;
  };
  app.get(NETWORK_ROUTES.nationalOpenData, (c) => c.json(latestOpenData()));
  app.get(NETWORK_ROUTES.nationalOpenDataCsv, (c) => {
    const csv = nationalOpenDataCsv(latestOpenData());
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', 'attachment; filename="denuncias-nacional.csv"');
    return c.body(csv);
  });

  // Estadística para el portal de la PDN (art. 61): las filas que cada nodo ya publicó.
  app.get(NETWORK_ROUTES.nationalStatistics, (c) => {
    const latest = deps.statistics?.latest() ?? null;
    if (latest === null) throw new ApiFailure('not_found');
    return c.json(latest);
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
