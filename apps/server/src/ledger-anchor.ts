// Anclaje de la bitácora: toma la cabeza pública firmada (de la API o de la base), recalcula la
// cadena desde el anclaje anterior hasta la nueva cabeza y escribe `anchors/AAAA-MM-DD.json`.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  LEDGER_GENESIS_HASH,
  LedgerAnchorSchema,
  LedgerPageSchema,
  ROUTES,
  SignedLedgerHeadSchema,
} from '@sigilo/contracts';
import type { LedgerAnchor, LedgerEvent, SignedLedgerHead } from '@sigilo/contracts';
import { computeEventHash, toDayDate, verifyChain, verifyLedgerHead } from '@sigilo/core';
import { schemaVersion } from './db/database.ts';
import { createLedgerRepository } from './db/ledger-repository.ts';
import { LATEST_SCHEMA_VERSION } from './db/schema.ts';
import { parseKeysFile } from './keys-file.ts';
import { createLedgerService, MAX_LEDGER_PAGE } from './ledger-service.ts';

/** Origen de la cabeza pública y de los eventos publicados. */
export interface AnchorSource {
  head(): Promise<SignedLedgerHead>;
  /** Página de eventos publicados desde `fromSeq` (a lo más `limit`), en orden. */
  events(fromSeq: number, limit: number): Promise<LedgerEvent[]>;
  close(): void;
}

/** Resultado de un anclaje. */
export interface AnchorResult {
  path: string;
  anchor: LedgerAnchor;
  /** `false` si el archivo del día ya existía con el mismo contenido. */
  created: boolean;
}

/** Opciones del anclaje. */
export interface AnchorOptions {
  source: AnchorSource;
  /** Llave pública Ed25519 del servidor (fijada) con la que se verifica la cabeza. */
  serverPublicKey: Uint8Array;
  anchorsDir: string;
  now: () => Date;
}

const ANCHOR_FILE = /^\d{4}-\d{2}-\d{2}\.json$/;

/** Mensaje cuando la base local no existe (el servidor nunca arrancó o se reinició la demo). */
export const MISSING_DATABASE_MESSAGE =
  'No existe la base local de la bitácora; arranca el servidor al menos una vez o define SIGILO_ANCHOR_URL.';

/**
 * Lee la cabeza pública directamente de la base del servidor (en solo lectura) y la firma con la
 * llave de `keys.json`, igual que la ruta `ledgerHead`. Solo ve lo ya publicado: no cierra días
 * pendientes (para eso, usar la API con `apiAnchorSource`).
 * Lanza error con un mensaje claro si la base no existe o no tiene el esquema vigente.
 */
export function databaseAnchorSource(dataDir: string, now: () => Date): AnchorSource {
  const path = join(dataDir, 'sigilo.db');
  if (!existsSync(path)) throw new Error(MISSING_DATABASE_MESSAGE);
  const keys = parseKeysFile(JSON.parse(readFileSync(join(dataDir, 'keys.json'), 'utf8')));
  const db = new DatabaseSync(path, { readOnly: true });
  if (schemaVersion(db) !== LATEST_SCHEMA_VERSION) {
    db.close();
    throw new Error(
      'La base local no tiene el esquema vigente; arranca el servidor para migrarla.',
    );
  }
  const repository = createLedgerRepository(db);
  const ledger = createLedgerService({
    db,
    repository,
    serverKeyId: keys.publicKeySet.server.keyId,
    serverSigningPrivateKey: keys.serverSigningPrivateKey,
    now,
    publishOnRead: false,
  });
  return {
    head: async () => ledger.head(),
    events: async (fromSeq, limit) => ledger.page(fromSeq, limit).events,
    close: () => db.close(),
  };
}

/** Lee la cabeza pública y los eventos de la API pública en `baseUrl` (por ejemplo, `http://127.0.0.1:8787`). */
export function apiAnchorSource(baseUrl: string, fetcher: typeof fetch = fetch): AnchorSource {
  async function getJson(path: string): Promise<unknown> {
    const response = await fetcher(new URL(path, baseUrl));
    if (!response.ok) throw new Error(`La API respondió ${response.status} en ${path}.`);
    return response.json();
  }
  return {
    head: async () => SignedLedgerHeadSchema.parse(await getJson(ROUTES.ledgerHead)),
    events: async (fromSeq, limit) =>
      LedgerPageSchema.parse(await getJson(`${ROUTES.ledgerEvents}?from=${fromSeq}&limit=${limit}`))
        .events,
    close: () => undefined,
  };
}

/** Último anclaje del directorio (por fecha en el nombre), o `null` si no hay. */
export function readLatestAnchor(anchorsDir: string): LedgerAnchor | null {
  if (!existsSync(anchorsDir)) return null;
  const latest = readdirSync(anchorsDir)
    .filter((name) => ANCHOR_FILE.test(name))
    .sort()
    .at(-1);
  if (latest === undefined) return null;
  return LedgerAnchorSchema.parse(JSON.parse(readFileSync(join(anchorsDir, latest), 'utf8')));
}

/** Eventos publicados de `fromSeq` a `toSeq` inclusive, por páginas. */
async function readRange(source: AnchorSource, fromSeq: number, toSeq: number) {
  const events: LedgerEvent[] = [];
  let next = fromSeq;
  while (next <= toSeq) {
    const page = await source.events(next, Math.min(MAX_LEDGER_PAGE, toSeq - next + 1));
    const inRange = page.filter((event) => event.seq >= next && event.seq <= toSeq);
    if (inRange.length === 0) break;
    events.push(...inRange);
    next = (inRange.at(-1)?.seq ?? toSeq) + 1;
  }
  return events;
}

/**
 * Comprueba la cadena entre el anclaje anterior (o el génesis) y la cabeza nueva, recalculando
 * cada hash con `verifyChain`: el evento del anclaje anterior debe seguir con su mismo hash, cada
 * evento posterior debe encadenarse al anterior y el último debe ser la cabeza.
 * Seguridad: nunca se ancla un hash almacenado sin recalcularlo; si alguien reescribió la base
 * (incluso recalculando hashes), la cadena deja de llegar a la cabeza o de contener el anclaje.
 */
async function assertChainUpTo(
  source: AnchorSource,
  previous: LedgerAnchor | null,
  head: SignedLedgerHead,
): Promise<void> {
  const before = previous?.head;
  const isGenesisHead = head.hash === LEDGER_GENESIS_HASH;
  const rewritten = (detail: string) =>
    new Error(
      previous === null
        ? `La cadena de la bitácora no es íntegra (${detail}).`
        : `La bitácora ya no contiene la cabeza anclada el ${previous.anchoredOn} (seq ${previous.head.seq}): posible reescritura (${detail}).`,
    );
  if (before === undefined || before.hash === LEDGER_GENESIS_HASH) {
    if (isGenesisHead) return;
    const events = await readRange(source, 0, head.seq);
    const chain = verifyChain(events);
    if (!chain.valid) throw rewritten(`${chain.reason} en ${chain.failedAtSeq}`);
    if (events.at(-1)?.hash !== head.hash) throw rewritten('no llega a la cabeza');
    return;
  }
  if (isGenesisHead || head.seq < before.seq) throw rewritten('la cabeza retrocedió');
  const events = await readRange(source, before.seq, head.seq);
  const [anchored, ...rest] = events;
  if (anchored?.seq !== before.seq || anchored.hash !== before.hash) {
    throw rewritten('el evento anclado cambió');
  }
  // El evento anclado también se recalcula: su hash debe corresponder a su contenido.
  if (anchored.hash !== computeEventHash(anchored)) {
    throw rewritten('el evento anclado no corresponde a su hash');
  }
  const chain = verifyChain(rest, anchored);
  if (!chain.valid) throw rewritten(`${chain.reason} en ${chain.failedAtSeq}`);
  if ((rest.at(-1) ?? anchored).hash !== head.hash) throw rewritten('no llega a la cabeza');
}

function serialize(anchor: LedgerAnchor): string {
  return `${JSON.stringify(anchor, null, 2)}\n`;
}

/**
 * Ancla la cabeza pública del día: verifica su firma con la llave fijada, recalcula la cadena
 * desde el último anclaje hasta ella y escribe `AAAA-MM-DD.json` (crea el directorio si falta).
 * Lanza error si la firma no es válida, si se detecta una reescritura o si ya existe un anclaje
 * del mismo día con otra cabeza.
 * Seguridad: los anclajes se versionan en el repositorio público, fuera del control del
 * servidor; una reescritura posterior ya no coincide con ellos.
 */
export async function anchorLedger(options: AnchorOptions): Promise<AnchorResult> {
  const { source, serverPublicKey, anchorsDir, now } = options;
  const head = await source.head();
  if (!verifyLedgerHead(head, serverPublicKey)) {
    throw new Error('La firma de la cabeza no corresponde a la llave fijada del servidor.');
  }
  const previous = readLatestAnchor(anchorsDir);
  await assertChainUpTo(source, previous, head);
  const anchoredOn = toDayDate(now());
  const anchor: LedgerAnchor = { version: 1, anchoredOn, head };
  const path = join(anchorsDir, `${anchoredOn}.json`);
  if (existsSync(path)) {
    if (readFileSync(path, 'utf8') === serialize(anchor)) return { path, anchor, created: false };
    throw new Error(`Ya existe un anclaje distinto para ${anchoredOn}.`);
  }
  mkdirSync(anchorsDir, { recursive: true });
  writeFileSync(path, serialize(anchor), { flag: 'wx' });
  return { path, anchor, created: true };
}
