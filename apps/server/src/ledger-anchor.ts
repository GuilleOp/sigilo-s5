// Anclaje de la bitácora: toma la cabeza pública firmada (de la base o de la API), comprueba que la
// bitácora siga conteniendo el anclaje anterior y escribe `anchors/AAAA-MM-DD.json`.
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
import { toDayDate, verifyLedgerHead } from '@sigilo/core';
import { createLedgerRepository } from './db/ledger-repository.ts';
import { parseKeysFile } from './keys-file.ts';
import { createLedgerService } from './ledger-service.ts';

/** Origen de la cabeza pública y de los eventos publicados. */
export interface AnchorSource {
  head(): Promise<SignedLedgerHead>;
  /** Evento publicado con esa secuencia, o `null` si no existe. */
  eventAt(seq: number): Promise<LedgerEvent | null>;
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

/**
 * Lee la cabeza pública directamente de la base del servidor (en solo lectura) y la firma con la
 * llave de `keys.json`, igual que la ruta `ledgerHead`.
 */
export function databaseAnchorSource(dataDir: string, now: () => Date): AnchorSource {
  const keys = parseKeysFile(JSON.parse(readFileSync(join(dataDir, 'keys.json'), 'utf8')));
  const db = new DatabaseSync(join(dataDir, 'sigilo.db'), { readOnly: true });
  const repository = createLedgerRepository(db);
  const ledger = createLedgerService({
    repository,
    serverKeyId: keys.publicKeySet.server.keyId,
    serverSigningPrivateKey: keys.serverSigningPrivateKey,
    now,
  });
  return {
    head: async () => ledger.head(),
    eventAt: async (seq) => ledger.page(seq, 1).events.find((event) => event.seq === seq) ?? null,
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
    eventAt: async (seq) => {
      const page = LedgerPageSchema.parse(
        await getJson(`${ROUTES.ledgerEvents}?from=${seq}&limit=1`),
      );
      return page.events.find((event) => event.seq === seq) ?? null;
    },
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

async function assertExtends(source: AnchorSource, previous: LedgerAnchor, head: SignedLedgerHead) {
  const before = previous.head;
  if (before.hash === LEDGER_GENESIS_HASH) return;
  const isConsistent =
    head.seq > before.seq
      ? (await source.eventAt(before.seq))?.hash === before.hash
      : head.seq === before.seq && head.hash === before.hash;
  if (!isConsistent) {
    throw new Error(
      `La bitácora ya no contiene la cabeza anclada el ${previous.anchoredOn} (seq ${before.seq}): posible reescritura.`,
    );
  }
}

function serialize(anchor: LedgerAnchor): string {
  return `${JSON.stringify(anchor, null, 2)}\n`;
}

/**
 * Ancla la cabeza pública del día: verifica su firma con la llave fijada, comprueba que la
 * bitácora siga conteniendo el último anclaje y escribe `AAAA-MM-DD.json`.
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
  if (previous !== null) await assertExtends(source, previous, head);
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
