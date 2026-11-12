// Buzón de red del nodo (`POST /api/v1/red/inbox`): abre los sobres que entrega el enrutador ciego,
// pasa la operación a las propias rutas v1 del nodo y cifra la respuesta hacia el navegador. Además,
// para la web servida en el mismo origen: copia del directorio firmado, paso de sobres al enrutador,
// paso del corte nacional de datos abiertos y paso de evaluaciones al evaluador OPRF (la web no hace
// peticiones a otros orígenes).
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
  CORROBORATION_ROUTES,
  CorroborationEvaluationRequestSchema,
  NETWORK_ROUTES,
  NationalOpenDataSchema,
  POW_HEADER,
  RELAY_V1_REJECTION_MESSAGE,
  RelayRequestSchema,
} from '@sigilo/contracts';
import { toDayDate } from '@sigilo/core';
import {
  createNodeInboxHandler,
  isAuthorityValidOn,
  isLegacyRelayRequest,
  responseToRoutedReply,
  routedRequestToFetch,
} from '@sigilo/red';
import type { NodeHealthReport } from '@sigilo/contracts';
import { STANDARD_VERSION } from '@sigilo/contracts/standard';
import type { AppContext } from '../context.ts';
import { SERVER_SOFTWARE_VERSION } from '../version.ts';
import { errorResponse } from '../http/errors.ts';
import { hostedAuthorities } from '../network/network-context.ts';
import { createSlidingCounter } from '../security/proof-of-work.ts';

/** Mayor sobre de red (tramo de 16 MiB en Base64 con su JSON), como el enrutador. */
export const MAX_INBOX_BODY_BYTES = 23 * 1024 * 1024;

/** Mayor petición de evaluación OPRF que se pasa al evaluador. */
const MAX_EVALUATION_BODY_BYTES = 1024;

/**
 * Autoridad destino de cada petición que llegó por el buzón de red. Solo la escribe este módulo,
 * sobre objetos `Request` que él mismo crea: una petición directa nunca está aquí, así que nadie
 * puede elegir su autoridad con una cabecera.
 */
const ROUTED_TARGETS = new WeakMap<Request, string>();

/** Autoridad destino si la petición llegó por el enrutador ciego, o `undefined`. */
export function routedTargetOf(request: Request): string | undefined {
  return ROUTED_TARGETS.get(request);
}

/** Folio que eligió el navegador y si la entrega es diferida (desde la cola del enrutador). */
export interface RoutedSubmission {
  folio: string;
  deferred: boolean;
}

/** Igual que `ROUTED_TARGETS`: solo este módulo lo escribe, sobre peticiones que él crea. */
const ROUTED_SUBMISSIONS = new WeakMap<Request, RoutedSubmission>();

/**
 * Folio elegido por el navegador y tipo de entrega de una denuncia que llegó por el buzón de red,
 * o `undefined` si llegó directo o sin folio.
 */
export function routedSubmissionOf(request: Request): RoutedSubmission | undefined {
  return ROUTED_SUBMISSIONS.get(request);
}

/**
 * Entregas diferidas que el nodo admite por hora. Seguridad: el enrutador cobra la prueba de
 * trabajo de la cola con su propio reto; este tope acota lo que un enrutador comprometido podría
 * meter sin trabajo. Lo que exceda responde `503` y se queda en la cola del enrutador.
 */
export const MAX_DEFERRED_PER_HOUR = 300;

async function readJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

/**
 * Reenvía la respuesta de otro servicio sin sus cabeceras: solo el estatus y el cuerpo JSON. Si el
 * servicio no responde o no responde JSON, se contesta `internal` sin detalles.
 */
async function relayResponse(c: Context, response: Response): Promise<Response> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return errorResponse(c, 'internal');
  }
  return c.json(body as object, response.status as 200);
}

/**
 * Registra el buzón de red y los pasos del mismo origen. Sin red configurada todas responden `404`,
 * igual que una ruta inexistente.
 * Seguridad: el nodo no recibe ninguna cabecera de quien envía (el enrutador arma la petición desde
 * cero) y la operación se ejecuta con las mismas validaciones y pruebas de trabajo que una directa.
 * En los pasos al enrutador y al evaluador el nodo arma la petición desde cero, con solo el tipo de
 * contenido (y la prueba de trabajo del evaluador): no reenvía cookies, agente de usuario ni IP.
 */
export function registerNetworkRoutes(app: Hono, ctx: AppContext): void {
  const network = ctx.deps.network;
  const deferredLoad = createSlidingCounter(60 * 60 * 1000, ctx.deps.now);
  const inbox =
    network === undefined
      ? null
      : createNodeInboxHandler({
          nodeBoxPrivateKey: network.nodeBoxPrivateKey,
          // Seguridad (H11): solo sobres que pasaron por el enrutador, con su etiqueta HMAC.
          relaySecret: network.relaySecret,
          nodeId: network.nodeId,
          // Seguridad: el sobre v2 no dice la autoridad al enrutador; el nodo solo entrega a una
          // autoridad que el directorio verificado aloja aquí y que está vigente hoy.
          hostsAuthority: (authorityId) =>
            hostedAuthorities(network).some(
              (authority) =>
                authority.id === authorityId &&
                isAuthorityValidOn(authority, toDayDate(ctx.deps.now())),
            ),
          admitDeferred: () => {
            if (deferredLoad.count() >= MAX_DEFERRED_PER_HOUR) return false;
            deferredLoad.record();
            return true;
          },
          handle: async (routed, delivery) => {
            const request = routedRequestToFetch(routed);
            ROUTED_TARGETS.set(request, routed.to);
            if (routed.folio !== undefined) {
              ROUTED_SUBMISSIONS.set(request, { folio: routed.folio, deferred: delivery.deferred });
            }
            return responseToRoutedReply(await app.request(request));
          },
        });
  app.post(
    NETWORK_ROUTES.nodeInbox,
    bodyLimit({
      maxSize: MAX_INBOX_BODY_BYTES,
      onError: (c) => errorResponse(c, 'payload_too_large'),
    }),
    (c) => (inbox === null ? errorResponse(c, 'not_found') : inbox(c.req.raw)),
  );

  // Copia del directorio firmado: la web lo verifica con la raíz que trae fijada, así que el nodo
  // no puede alterarlo sin que se note.
  app.get(NETWORK_ROUTES.directory, (c) =>
    network === undefined ? errorResponse(c, 'not_found') : c.json(network.signedDirectory),
  );

  // Paso al enrutador ciego: el nodo de origen solo ve el nodo destino y el tramo, como el
  // enrutador.
  app.post(
    NETWORK_ROUTES.relay,
    bodyLimit({
      maxSize: MAX_INBOX_BODY_BYTES,
      onError: (c) => errorResponse(c, 'payload_too_large'),
    }),
    async (c) => {
      if (network === undefined || network.routerUrl === null) {
        return errorResponse(c, 'not_found');
      }
      const raw = await readJsonBody(c);
      if (isLegacyRelayRequest(raw)) {
        return c.json({ error: { code: 'bad_request', message: RELAY_V1_REJECTION_MESSAGE } }, 400);
      }
      const parsed = RelayRequestSchema.safeParse(raw);
      if (!parsed.success) return errorResponse(c, 'bad_request');
      try {
        const response = await network.fetch(`${network.routerUrl}${NETWORK_ROUTES.relay}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed.data),
        });
        return await relayResponse(c, response);
      } catch {
        return errorResponse(c, 'internal');
      }
    },
  );

  // Salud del nodo para el enrutador: solo su identificador y sus versiones.
  app.get(NETWORK_ROUTES.nodeHealth, (c) =>
    network === undefined
      ? errorResponse(c, 'not_found')
      : c.json({
          v: 1,
          nodeId: network.nodeId,
          softwareVersion: SERVER_SOFTWARE_VERSION,
          standardVersion: STANDARD_VERSION,
        } satisfies NodeHealthReport),
  );

  // Paso del reto de la cola de entrega del enrutador (si el nodo destino no responde).
  app.get(NETWORK_ROUTES.queueChallenge, async (c) => {
    if (network === undefined || network.routerUrl === null) return errorResponse(c, 'not_found');
    try {
      const response = await network.fetch(`${network.routerUrl}${NETWORK_ROUTES.queueChallenge}`, {
        method: 'GET',
      });
      return await relayResponse(c, response);
    } catch {
      return errorResponse(c, 'internal');
    }
  });

  // Paso del corte nacional de datos abiertos (solo números agregados) para el observatorio.
  app.get(NETWORK_ROUTES.nationalOpenData, async (c) => {
    if (network === undefined || network.routerUrl === null) return errorResponse(c, 'not_found');
    try {
      const response = await network.fetch(
        `${network.routerUrl}${NETWORK_ROUTES.nationalOpenData}`,
        {
          method: 'GET',
        },
      );
      if (response.status === 404) return errorResponse(c, 'not_found');
      const parsed = NationalOpenDataSchema.safeParse(response.ok ? await response.json() : null);
      return parsed.success ? c.json(parsed.data) : errorResponse(c, 'internal');
    } catch {
      return errorResponse(c, 'internal');
    }
  });

  // Paso al evaluador OPRF: el nodo solo ve el elemento cegado, que no revela el identificador.
  const evaluatorUrl = network?.directory.corroboration?.evaluatorUrl ?? null;
  app.get(CORROBORATION_ROUTES.evaluatorChallenge, async (c) => {
    if (network === undefined || evaluatorUrl === null) return errorResponse(c, 'not_found');
    try {
      const response = await network.fetch(
        `${evaluatorUrl}${CORROBORATION_ROUTES.evaluatorChallenge}`,
        { method: 'GET' },
      );
      return await relayResponse(c, response);
    } catch {
      return errorResponse(c, 'internal');
    }
  });
  app.post(
    CORROBORATION_ROUTES.evaluations,
    bodyLimit({
      maxSize: MAX_EVALUATION_BODY_BYTES,
      onError: (c) => errorResponse(c, 'payload_too_large'),
    }),
    async (c) => {
      if (network === undefined || evaluatorUrl === null) return errorResponse(c, 'not_found');
      const parsed = CorroborationEvaluationRequestSchema.safeParse(await readJsonBody(c));
      if (!parsed.success) return errorResponse(c, 'bad_request');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const proof = c.req.header(POW_HEADER);
      if (proof !== undefined) headers[POW_HEADER] = proof;
      try {
        const response = await network.fetch(`${evaluatorUrl}${CORROBORATION_ROUTES.evaluations}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(parsed.data),
        });
        return await relayResponse(c, response);
      } catch {
        return errorResponse(c, 'internal');
      }
    },
  );
}
