// Arnés de pruebas: red sintética con la llave del evaluador en el directorio, evaluador e índice
// con bases en archivos temporales (para inspeccionarlas) y un cliente que hace lo que harían el
// navegador y el nodo.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Hono } from 'hono';
import {
  CORROBORATION_ROUTES,
  CorroborationEvaluationResponseSchema,
  CorroborationStatusSchema,
  POW_HEADER,
  PowChallengeSchema,
} from '@sigilo/contracts';
import type {
  AuthorityDirectory,
  CorroborationEvaluatorKey,
  CorroborationStatus,
} from '@sigilo/contracts';
import { formatPowHeader, solvePow, toBase64Url } from '@sigilo/core';
import {
  blindCorroboration,
  buildEvaluatorKey,
  deriveEvaluatorKeyPair,
  finalizeCorroboration,
  folioDigestFor,
  signIndexConfirmation,
  signIndexRegistration,
  signIndexWithdrawal,
  similarityDigest,
} from '@sigilo/corroboracion';
import type {
  CorroborationIdentifier,
  CorroborationKeys,
  EvaluatorKeyPair,
} from '@sigilo/corroboracion';
import type { DemoCorroborationCase } from '@sigilo/corroboracion/demo';
import { buildDemoDirectory, generateDemoNetworkKeys } from '@sigilo/red';
import type { DemoNetworkKeys, DemoNodeId } from '@sigilo/red';
import { EVALUATOR_SCHEMA, INDEX_SCHEMA, openDatabase } from './database.ts';
import { createEvaluatorApp } from './evaluator-app.ts';
import { createEvaluatorService } from './evaluator-service.ts';
import { createIndexApp } from './index-app.ts';
import { createIndexService } from './index-service.ts';

export const TEST_DAY = '2026-11-09';
/** Bits de la prueba de trabajo en las pruebas: bajos para que sean rápidas. */
export const TEST_POW_BITS = 4;

/** Reloj de prueba que se puede mover. */
export interface TestClock {
  now: () => Date;
  set(iso: string): void;
}

export function createClock(iso = `${TEST_DAY}T12:00:00Z`): TestClock {
  let current = new Date(iso);
  return {
    now: () => new Date(current.getTime()),
    set(value) {
      current = new Date(value);
    },
  };
}

/** Servicios de corroboración de prueba con sus piezas expuestas. */
export interface TestCorroboration {
  clock: TestClock;
  network: DemoNetworkKeys;
  directory: AuthorityDirectory;
  evaluatorKeyPair: EvaluatorKeyPair;
  evaluatorKey: CorroborationEvaluatorKey;
  evaluatorSigningKey: Uint8Array;
  evaluatorApp: Hono;
  evaluatorDb: DatabaseSync;
  evaluatorDbPath: string;
  indexApp: Hono;
  indexDb: DatabaseSync;
  indexDbPath: string;
  /** Secreto de cada nodo para el folio opaco. */
  nodeSecrets: Record<DemoNodeId, Uint8Array>;
}

/**
 * Crea la red sintética, el evaluador (llave derivada de una semilla fija, para que el escenario
 * sea reproducible) y el índice, cada uno con su base en un archivo temporal distinto.
 */
export function createTestCorroboration(
  options: {
    maxDailyEvaluations?: number;
    /**
     * Regla de confirmación del índice. Por omisión `false` para el arnés del nodo, que todavía no
     * confirma; las pruebas de este paquete la piden en `true`, como el servicio real.
     */
    requireConfirmation?: boolean;
  } = {},
) {
  const clock = createClock();
  const network = generateDemoNetworkKeys();
  const evaluatorKeyPair = deriveEvaluatorKeyPair(
    new Uint8Array(32).fill(0x5a),
    new TextEncoder().encode('sigilo/demo/evaluador'),
  );
  const evaluatorSigningKey = new Uint8Array(32).fill(0x2b);
  const evaluatorKey = buildEvaluatorKey({
    keyPair: evaluatorKeyPair,
    epoch: 1,
    signingPrivateKey: evaluatorSigningKey,
    validFrom: TEST_DAY,
  });
  const directory: AuthorityDirectory = {
    ...buildDemoDirectory(network, {
      issuedOn: TEST_DAY,
      baseUrls: {
        'node.queretaro': 'http://nodo-queretaro.invalid',
        'node.federal': 'http://nodo-federal.invalid',
        'node.ejemplo': 'http://nodo-ejemplo.invalid',
      },
    }),
    corroboration: {
      evaluator: evaluatorKey,
      evaluatorUrl: 'http://evaluador.invalid',
      indexUrl: 'http://indice.invalid',
    },
  };
  const evaluatorDbPath = join(mkdtempSync(join(tmpdir(), 'sigilo-evaluador-')), 'evaluador.db');
  const evaluatorDb = openDatabase(evaluatorDbPath, EVALUATOR_SCHEMA);
  const evaluator = createEvaluatorService({
    db: evaluatorDb,
    keyPair: evaluatorKeyPair,
    signingPrivateKey: evaluatorSigningKey,
    key: evaluatorKey,
    powBits: TEST_POW_BITS,
    now: clock.now,
    ...(options.maxDailyEvaluations === undefined
      ? {}
      : { maxDailyEvaluations: options.maxDailyEvaluations }),
  });
  const indexDbPath = join(mkdtempSync(join(tmpdir(), 'sigilo-indice-')), 'indice.db');
  const indexDb = openDatabase(indexDbPath, INDEX_SCHEMA);
  const index = createIndexService({
    db: indexDb,
    directory: () => directory,
    now: clock.now,
    requireConfirmation: options.requireConfirmation ?? false,
  });
  return {
    clock,
    network,
    directory,
    evaluatorKeyPair,
    evaluatorKey,
    evaluatorSigningKey,
    evaluatorApp: createEvaluatorApp({ evaluator }),
    evaluatorDb,
    evaluatorDbPath,
    indexApp: createIndexApp({ index }),
    indexDb,
    indexDbPath,
    nodeSecrets: {
      'node.queretaro': new Uint8Array(32).fill(0x11),
      'node.federal': new Uint8Array(32).fill(0x22),
      'node.ejemplo': new Uint8Array(32).fill(0x33),
    },
  } satisfies TestCorroboration;
}

/** Pide un reto y lo resuelve como lo haría el navegador. */
export async function solvedPowHeader(app: Hono): Promise<string> {
  const response = await app.request(CORROBORATION_ROUTES.evaluatorChallenge);
  const challenge = PowChallengeSchema.parse(await response.json());
  const counter = solvePow(challenge.token, challenge.bits);
  if (counter === null) throw new Error('No se resolvió el reto.');
  return formatPowHeader(challenge.token, counter);
}

/** POST JSON a una aplicación de prueba. */
export function postJson(
  app: Hono,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return Promise.resolve(
    app.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  );
}

/**
 * Lo que hace el navegador: ciega el identificador, pide la evaluación con prueba de trabajo,
 * verifica la prueba DLEQ contra la llave del directorio y deriva etiqueta y resumen difuso.
 * Devuelve también los mensajes que salieron hacia el evaluador, para inspeccionarlos.
 */
export async function corroborateInBrowser(
  services: TestCorroboration,
  identifier: CorroborationIdentifier,
  narrative: string,
): Promise<{ keys: CorroborationKeys; similarity: string | null; sentToEvaluator: string[] }> {
  const key = services.directory.corroboration?.evaluator;
  if (key === undefined) throw new Error('El directorio no publica la llave del evaluador.');
  const state = blindCorroboration(identifier, key);
  const header = await solvedPowHeader(services.evaluatorApp);
  const body = JSON.stringify(state.request);
  const response = await services.evaluatorApp.request(CORROBORATION_ROUTES.evaluations, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [POW_HEADER]: header },
    body,
  });
  if (response.status !== 200) throw new Error(`El evaluador respondió ${response.status}.`);
  const evaluation = CorroborationEvaluationResponseSchema.parse(await response.json());
  const keys = finalizeCorroboration(state, evaluation, key);
  const digest = similarityDigest(narrative, keys.similarityKey);
  return {
    keys,
    similarity: digest === null ? null : toBase64Url(digest),
    sentToEvaluator: [header, body],
  };
}

/** Lo que hace el nodo al recibir la denuncia: firma y manda el registro al índice. */
export async function registerFromNode(
  services: TestCorroboration,
  item: DemoCorroborationCase,
  folio: string,
  browser: { keys: CorroborationKeys; similarity: string | null },
  options: { custody?: boolean } = {},
): Promise<{ response: Response; status: CorroborationStatus | null; body: string }> {
  const nodeId = item.nodeId as DemoNodeId;
  const registration = signIndexRegistration(
    {
      nodeId,
      epoch: browser.keys.epoch,
      tag: browser.keys.tag,
      folioDigest: folioDigestFor(folio, services.nodeSecrets[nodeId]),
      receivedAt: item.receivedAt,
      entry: item.entry,
      similarity: browser.similarity,
      ...(options.custody === true ? { custody: true } : {}),
    },
    services.network.nodes[nodeId].signing.privateKey,
  );
  const body = JSON.stringify(registration);
  const response = await services.indexApp.request(CORROBORATION_ROUTES.indexRegistrations, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const status =
    response.status === 200 ? CorroborationStatusSchema.parse(await response.clone().json()) : null;
  return { response, status, body };
}

/** Hora de la petición redondeada a 10 minutos según el reloj de prueba. */
export function requestedAtOf(services: TestCorroboration): string {
  return `${services.clock.now().toISOString().slice(0, 15)}0Z`;
}

/** Lo que hace el nodo cuando la autoridad acepta la denuncia: confirma ante el índice. */
export async function confirmFromNode(
  services: TestCorroboration,
  nodeId: DemoNodeId,
  folio: string,
): Promise<{ response: Response; status: CorroborationStatus | null }> {
  const confirmation = signIndexConfirmation(
    {
      nodeId,
      folioDigest: folioDigestFor(folio, services.nodeSecrets[nodeId]),
      requestedAt: requestedAtOf(services),
    },
    services.network.nodes[nodeId].signing.privateKey,
  );
  const response = await postJson(
    services.indexApp,
    CORROBORATION_ROUTES.indexConfirmations,
    confirmation,
  );
  const status =
    response.status === 200 ? CorroborationStatusSchema.parse(await response.clone().json()) : null;
  return { response, status };
}

/** Lo que hace el nodo al cerrar una denuncia como spam o improcedente: la da de baja. */
export function withdrawFromNode(
  services: TestCorroboration,
  nodeId: DemoNodeId,
  folio: string,
  reason: 'spam' | 'inadmissible' | 'duplicate' = 'spam',
): Promise<Response> {
  const withdrawal = signIndexWithdrawal(
    {
      nodeId,
      folioDigest: folioDigestFor(folio, services.nodeSecrets[nodeId]),
      reason,
      requestedAt: requestedAtOf(services),
    },
    services.network.nodes[nodeId].signing.privateKey,
  );
  return postJson(services.indexApp, CORROBORATION_ROUTES.indexWithdrawals, withdrawal);
}
