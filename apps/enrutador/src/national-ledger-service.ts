// Bitácora nacional en SQLite: agrega cabezas de nodo y versiones del directorio, emite cabezas
// firmadas por la operación, reúne las cofirmas de los testigos y arma pruebas de inclusión.
import type { DatabaseSync } from 'node:sqlite';
import {
  CosignedNationalHeadSchema,
  NATIONAL_INCLUSION_MAX_CHAIN,
  NationalLedgerEntrySchema,
  SignedLedgerHeadSchema,
} from '@sigilo/contracts';
import type {
  CosignedNationalHead,
  DirectoryNode,
  NationalCosignatureRequest,
  NationalInclusionProof,
  NationalLedgerEntry,
  NetworkTrustAnchor,
  NodeHeadAcceptance,
  SignedAuthorityDirectory,
  SignedLedgerHead,
} from '@sigilo/contracts';
import { keyIdFor } from '@sigilo/core';
import {
  buildDirectoryEntry,
  buildNodeHeadEntry,
  compareNodeHeads,
  isValidNationalCosignature,
  signNationalHead,
  signingPublicKeyOf,
  verifyNationalHead,
  verifyNodeHeadSignature,
} from '@sigilo/red';
import type { NodeHistoryCheck } from '@sigilo/red';
import type { Row } from './database.ts';
import { readInteger, readText, withTransaction } from './database.ts';

/** Rechazo de una cabeza de nodo o de una cofirma, con su motivo (no se publica). */
export class NationalLedgerRejection extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`Rechazado: ${reason}.`);
    this.name = 'NationalLedgerRejection';
    this.reason = reason;
  }
}

/** Operaciones de la bitácora nacional. */
export interface NationalLedgerService {
  lastEntry(): NationalLedgerEntry | null;
  /** Agrega una versión del directorio. Debe llamarse dentro de una transacción. */
  appendDirectoryVersion(signed: SignedAuthorityDirectory, today: string): NationalLedgerEntry;
  /**
   * Registra la cabeza firmada de un nodo si avanza y extiende la anterior en la bitácora del
   * nodo. Lanza `NationalLedgerRejection` si la firma no es del nodo, si retrocede, si se bifurca o
   * si no se pudo probar la historia (H4); el rechazo queda registrado.
   */
  recordNodeHead(
    node: DirectoryNode,
    head: SignedLedgerHead,
    today: string,
  ): Promise<NodeHeadAcceptance>;
  /** Rechazos de cabezas de nodo registrados, del más reciente al más antiguo. */
  rejections(limit: number): { nodeId: string; day: string; reason: string }[];
  /** Emite una cabeza nacional nueva si hay entradas posteriores a la última; si no, `null`. */
  emitHead(directorySerial: number, today: string): CosignedNationalHead | null;
  /** Agrega la cofirma de un testigo a la cabeza indicada. */
  addCosignature(
    request: NationalCosignatureRequest,
    trust: NetworkTrustAnchor,
  ): CosignedNationalHead;
  /** Última cabeza con m cofirmas válidas, o `null`. */
  publishedHead(trust: NetworkTrustAnchor): CosignedNationalHead | null;
  /** Última cabeza emitida, con las cofirmas que tenga, o `null`. */
  pendingHead(): CosignedNationalHead | null;
  /** Entradas desde `from` (a lo más `limit`). */
  entries(from: number, limit: number): NationalLedgerEntry[];
  /** Prueba de inclusión de una cabeza de nodo hasta la última cabeza publicada, o `null`. */
  inclusion(
    query: { nodeId: string; seq: number; hash: string },
    trust: NetworkTrustAnchor,
  ): NationalInclusionProof | null | 'too-long';
}

/** Dependencias del servicio. */
export interface NationalLedgerDeps {
  db: DatabaseSync;
  operatorPrivateKey: Uint8Array;
  /**
   * Comprueba en la bitácora del nodo que `next` extiende `previous` (descarga `ledgerEvents`).
   * Sin él, toda cabeza que no sea la primera de un nodo se rechaza como no verificable.
   */
  verifyNodeHistory?: (
    node: DirectoryNode,
    previous: SignedLedgerHead,
    next: SignedLedgerHead,
  ) => Promise<NodeHistoryCheck>;
}

/** Cuántas cabezas recientes se revisan para encontrar la última publicada. */
const PUBLISHED_LOOKBACK = 50;

function parseEntry(row: Row): NationalLedgerEntry {
  return NationalLedgerEntrySchema.parse(JSON.parse(readText(row, 'entry')));
}

function parseHead(row: Row): CosignedNationalHead {
  return CosignedNationalHeadSchema.parse(JSON.parse(readText(row, 'document')));
}

/** Crea el servicio de la bitácora nacional sobre la base del enrutador. */
export function createNationalLedgerService(deps: NationalLedgerDeps): NationalLedgerService {
  const { db } = deps;
  const operatorKeyId = keyIdFor(signingPublicKeyOf(deps.operatorPrivateKey));

  /** Registra el rechazo (nodo, día y motivo, sin la cabeza) y devuelve el error para lanzarlo. */
  const reject = (nodeId: string, reason: string, today: string): NationalLedgerRejection => {
    db.prepare('INSERT INTO node_head_rejections (node_id, day, reason) VALUES (?, ?, ?)').run(
      nodeId,
      today,
      reason,
    );
    return new NationalLedgerRejection(reason);
  };

  const lastEntry = (): NationalLedgerEntry | null => {
    const row = db.prepare('SELECT entry FROM national_entries ORDER BY seq DESC LIMIT 1').get();
    return row === undefined ? null : parseEntry(row);
  };

  const insertEntry = (entry: NationalLedgerEntry): void => {
    const isNode = entry.type === 'node.head';
    db.prepare(
      'INSERT INTO national_entries (seq, type, node_id, node_seq, node_hash, entry) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(
      entry.seq,
      entry.type,
      isNode ? entry.nodeId : null,
      isNode ? entry.nodeHead.seq : null,
      isNode ? entry.nodeHead.hash : null,
      JSON.stringify(entry),
    );
  };

  // Seguridad: la fecha de una entrada nunca retrocede, aunque el reloj lo haga.
  const dayAfter = (previous: NationalLedgerEntry | null, today: string): string =>
    previous !== null && previous.at > today ? previous.at : today;

  const heads = (limit: number): CosignedNationalHead[] =>
    db
      .prepare('SELECT document FROM national_heads ORDER BY seq DESC LIMIT ?')
      .all(limit)
      .map(parseHead);

  const publishedHead = (trust: NetworkTrustAnchor): CosignedNationalHead | null =>
    heads(PUBLISHED_LOOKBACK).find((head) => verifyNationalHead(head, trust).valid) ?? null;

  const entries = (from: number, limit: number): NationalLedgerEntry[] =>
    db
      .prepare('SELECT entry FROM national_entries WHERE seq >= ? ORDER BY seq LIMIT ?')
      .all(from, limit)
      .map(parseEntry);

  return {
    lastEntry,
    appendDirectoryVersion(signed, today) {
      const previous = lastEntry();
      const entry = buildDirectoryEntry(previous, signed, dayAfter(previous, today));
      insertEntry(entry);
      return entry;
    },
    async recordNodeHead(node, head, today) {
      const parsed = SignedLedgerHeadSchema.parse(head);
      if (!verifyNodeHeadSignature(parsed, node)) throw reject(node.id, 'firma', today);
      const latest = (): { row: Row | undefined; previous: SignedLedgerHead | null } => {
        const row = db
          .prepare('SELECT entry_seq, head FROM latest_node_heads WHERE node_id = ?')
          .get(node.id);
        return {
          row,
          previous:
            row === undefined
              ? null
              : SignedLedgerHeadSchema.parse(JSON.parse(readText(row, 'head'))),
        };
      };
      const before = latest();
      const progress = compareNodeHeads(before.previous, parsed);
      if (progress === 'unchanged' && before.row !== undefined) {
        return {
          nodeId: node.id,
          status: 'unchanged',
          entrySeq: readInteger(before.row, 'entry_seq'),
        };
      }
      if (progress === 'rollback' || progress === 'fork') throw reject(node.id, progress, today);
      // Seguridad (H4): una secuencia mayor no basta; la cadena del nodo debe ir de la cabeza
      // anterior a la nueva. Si no se puede comprobar, se rechaza.
      if (before.previous !== null) {
        const check =
          deps.verifyNodeHistory === undefined
            ? ({ valid: false, reason: 'unreachable' } as const)
            : await deps.verifyNodeHistory(node, before.previous, parsed);
        if (!check.valid) throw reject(node.id, `history-${check.reason}`, today);
      }
      return withTransaction(db, () => {
        // Si otra petición registró otra cabeza mientras se verificaba, se vuelve a intentar después.
        const now = latest();
        if (JSON.stringify(now.previous) !== JSON.stringify(before.previous)) {
          throw new NationalLedgerRejection('concurrent');
        }
        const last = lastEntry();
        const entry = buildNodeHeadEntry(last, node.id, parsed, dayAfter(last, today));
        insertEntry(entry);
        db.prepare(
          'INSERT INTO latest_node_heads (node_id, entry_seq, head) VALUES (?, ?, ?) ON CONFLICT (node_id) DO UPDATE SET entry_seq = excluded.entry_seq, head = excluded.head',
        ).run(node.id, entry.seq, JSON.stringify(parsed));
        return { nodeId: node.id, status: 'recorded', entrySeq: entry.seq };
      });
    },
    rejections(limit) {
      return db
        .prepare('SELECT node_id, day, reason FROM node_head_rejections ORDER BY id DESC LIMIT ?')
        .all(limit)
        .map((row) => ({
          nodeId: readText(row, 'node_id'),
          day: readText(row, 'day'),
          reason: readText(row, 'reason'),
        }));
    },
    emitHead(directorySerial, today) {
      const last = lastEntry();
      const [latest] = heads(1);
      if (last === null || (latest !== undefined && latest.head.seq >= last.seq)) return null;
      const signed = signNationalHead(
        { v: 1, seq: last.seq, hash: last.hash, at: today, directorySerial, operatorKeyId },
        deps.operatorPrivateKey,
      );
      db.prepare('INSERT INTO national_heads (seq, hash, document) VALUES (?, ?, ?)').run(
        signed.head.seq,
        signed.head.hash,
        JSON.stringify(signed),
      );
      return signed;
    },
    addCosignature(request, trust) {
      return withTransaction(db, () => {
        const row = db
          .prepare('SELECT document FROM national_heads WHERE seq = ? AND hash = ?')
          .get(request.seq, request.hash);
        if (row === undefined) throw new NationalLedgerRejection('cabeza desconocida');
        const current = parseHead(row);
        if (!isValidNationalCosignature(current.head, request.cosignature, trust)) {
          throw new NationalLedgerRejection('cofirma');
        }
        const others = current.cosignatures.filter(
          (item) => item.witnessId !== request.cosignature.witnessId,
        );
        const updated: CosignedNationalHead = {
          ...current,
          cosignatures: [...others, request.cosignature].sort((left, right) =>
            left.witnessId.localeCompare(right.witnessId),
          ),
        };
        db.prepare('UPDATE national_heads SET document = ? WHERE seq = ?').run(
          JSON.stringify(updated),
          request.seq,
        );
        return updated;
      });
    },
    publishedHead,
    pendingHead: () => heads(1)[0] ?? null,
    entries,
    inclusion(query, trust) {
      const row = db
        .prepare(
          'SELECT entry FROM national_entries WHERE node_id = ? AND node_seq = ? AND node_hash = ? ORDER BY seq LIMIT 1',
        )
        .get(query.nodeId, query.seq, query.hash);
      const head = publishedHead(trust);
      if (row === undefined || head === null) return null;
      const entry = parseEntry(row);
      if (head.head.seq < entry.seq) return null;
      if (head.head.seq - entry.seq + 1 > NATIONAL_INCLUSION_MAX_CHAIN) return 'too-long';
      return { entry, chain: entries(entry.seq, head.head.seq - entry.seq + 1), head };
    },
  };
}
