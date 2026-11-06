// Índice de coincidencias: guarda solo (etiqueta, nodo, folio opaco) y las señales de
// independencia, cuenta fuentes independientes por etiqueta y deja avisos para cada nodo. Nunca ve
// el identificador ni la llave del evaluador. Una coincidencia cuenta y se revela solo cuando su
// nodo la confirma como aceptada o pasan los días de gracia, para que registrar no sea un oráculo.
import type { DatabaseSync } from 'node:sqlite';
import {
  CORROBORATION_CONFIRMATION_GRACE_DAYS,
  CorroborationStatusSchema,
  INDEX_NOTICES_MAX_PAGE,
  SIMILARITY_DIGEST_BYTES,
} from '@sigilo/contracts';
import type {
  AuthorityDirectory,
  CorroborationConfirmation,
  CorroborationStatus,
  IndexConfirmation,
  IndexNoticesPage,
  IndexNoticesRequest,
  IndexRegistration,
  IndexWithdrawal,
  IndexWithdrawalReceipt,
} from '@sigilo/contracts';
import { canonicalize, fromBase64Url, randomBytes, toDayDate, toHex } from '@sigilo/core';
import {
  DEFAULT_INDEPENDENCE_POLICY,
  assessIndependence,
  verifyIndexConfirmation,
  verifyIndexRegistration,
  verifyIndexWithdrawal,
  verifyNoticesRequest,
} from '@sigilo/corroboracion';
import type { IndependencePolicy, IndexedComplaint } from '@sigilo/corroboracion';
import { findNode } from '@sigilo/red';
import { readBytesOrNull, readInteger, readText, withTransaction } from './database.ts';
import type { Row } from './database.ts';
import { ApiFailure } from './http.ts';

/** Diferencia máxima aceptada entre la hora declarada y el reloj del índice. */
export const MAX_CLOCK_SKEW_MS = 20 * 60_000;
const DAY_MS = 86_400_000;

/** Dependencias del índice. */
export interface IndexDeps {
  db: DatabaseSync;
  /** Directorio ya verificado: de él salen las llaves de firma de los nodos. */
  directory: () => AuthorityDirectory;
  now: () => Date;
  policy?: IndependencePolicy;
  /** Días de gracia antes de contar una denuncia sin confirmar (por omisión, 30). */
  confirmationGraceDays?: number;
  /**
   * Si es `false`, toda denuncia cuenta y se revela desde su registro (comportamiento anterior).
   * Solo para arneses de prueba que todavía no confirman; el servicio real siempre lo exige.
   */
  requireConfirmation?: boolean;
}

/** Operaciones del índice. */
export interface IndexService {
  register(registration: IndexRegistration): CorroborationStatus;
  confirm(confirmation: IndexConfirmation): CorroborationStatus;
  withdraw(withdrawal: IndexWithdrawal): IndexWithdrawalReceipt;
  notices(request: IndexNoticesRequest): IndexNoticesPage;
}

function decodeSimilarity(value: string | null): Uint8Array | null {
  if (value === null) return null;
  try {
    const bytes = fromBase64Url(value);
    if (bytes.length === SIMILARITY_DIGEST_BYTES) return bytes;
  } catch {
    // Base64URL no canónico: se responde igual que cualquier cuerpo inválido.
  }
  throw new ApiFailure('bad_request');
}

function parseStatus(row: Row): CorroborationStatus {
  return CorroborationStatusSchema.parse(JSON.parse(readText(row, 'status')));
}

function readConfirmation(row: Row): CorroborationConfirmation {
  const value = readText(row, 'confirmation');
  return value === 'confirmed' || value === 'aged' ? value : 'pending';
}

/** Crea el índice. */
export function createIndexService(deps: IndexDeps): IndexService {
  const policy = deps.policy ?? DEFAULT_INDEPENDENCE_POLICY;
  const graceDays = deps.confirmationGraceDays ?? CORROBORATION_CONFIRMATION_GRACE_DAYS;
  const requireConfirmation = deps.requireConfirmation ?? true;
  const db = deps.db;
  const findGroup = db.prepare('SELECT group_id FROM tag_groups WHERE epoch = ? AND tag = ?');
  const insertGroup = db.prepare('INSERT INTO tag_groups (epoch, tag, group_id) VALUES (?, ?, ?)');
  const findRegistration = db.prepare(
    `SELECT epoch, tag, status, confirmation FROM registrations
     WHERE node_id = ? AND folio_digest = ?`,
  );
  const insertRegistration = db.prepare(
    `INSERT INTO registrations
       (node_id, folio_digest, epoch, tag, received_at, entry, similarity, custody,
        confirmation, registered_on, solo_group_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, '{}')`,
  );
  const listByTag = db.prepare(
    `SELECT node_id, folio_digest, received_at, entry, similarity, custody, confirmation,
            solo_group_id, status
     FROM registrations WHERE epoch = ? AND tag = ? ORDER BY received_at, node_id, folio_digest`,
  );
  const updateStatus = db.prepare(
    'UPDATE registrations SET status = ? WHERE node_id = ? AND folio_digest = ?',
  );
  const setConfirmation = db.prepare(
    'UPDATE registrations SET confirmation = ? WHERE node_id = ? AND folio_digest = ?',
  );
  const listAging = db.prepare(
    `SELECT node_id, folio_digest, epoch, tag FROM registrations
     WHERE confirmation = 'pending' AND registered_on <= ?`,
  );
  const deleteRegistration = db.prepare(
    'DELETE FROM registrations WHERE node_id = ? AND folio_digest = ?',
  );
  const findWithdrawal = db.prepare(
    'SELECT 1 AS found FROM withdrawals WHERE node_id = ? AND folio_digest = ?',
  );
  const insertWithdrawal = db.prepare(
    `INSERT INTO withdrawals (node_id, folio_digest, reason, withdrawn_on) VALUES (?, ?, ?, ?)
     ON CONFLICT DO NOTHING`,
  );
  const lastNotice = db.prepare(
    'SELECT COALESCE(MAX(seq), 0) AS seq FROM notices WHERE node_id = ?',
  );
  const insertNotice = db.prepare('INSERT INTO notices (node_id, seq, status) VALUES (?, ?, ?)');
  const listNotices = db.prepare(
    'SELECT seq, status FROM notices WHERE node_id = ? AND seq > ? ORDER BY seq LIMIT ?',
  );

  const today = (): string => toDayDate(deps.now());

  const nodeKey = (nodeId: string): string => {
    const node = findNode(deps.directory(), nodeId);
    if (node === undefined) throw new ApiFailure('unauthorized');
    return node.signingPublicKey;
  };

  const assertFresh = (at: string, maxPastMs: number): void => {
    const time = Date.parse(at);
    const now = deps.now().getTime();
    if (Number.isNaN(time) || time - now > MAX_CLOCK_SKEW_MS || now - time > maxPastMs) {
      throw new ApiFailure('bad_request');
    }
  };

  const groupIdFor = (epoch: number, tag: string): string => {
    const row = findGroup.get(epoch, tag);
    if (row !== undefined) return readText(row, 'group_id');
    // Seguridad: el grupo es aleatorio, no un derivado de la etiqueta.
    const groupId = toHex(randomBytes(16));
    insertGroup.run(epoch, tag, groupId);
    return groupId;
  };

  /**
   * Recalcula el grupo de la etiqueta y deja avisos a los nodos cuyo estado cambió (salvo a quien
   * hizo la petición, que recibe el estado en la respuesta).
   * Seguridad: una fuente cuenta para las demás solo si alguna de sus denuncias está confirmada o
   * envejecida; una denuncia sin confirmar recibe el estado de una denuncia sola.
   */
  const recompute = (epoch: number, tag: string, requestedBy: string | null): void => {
    const groupId = groupIdFor(epoch, tag);
    const rows = listByTag.all(epoch, tag);
    const complaints: IndexedComplaint[] = rows.map((row) => ({
      id: `${readText(row, 'node_id')} ${readText(row, 'folio_digest')}`,
      nodeId: readText(row, 'node_id'),
      receivedAt: readText(row, 'received_at'),
      entry: readText(row, 'entry') === 'direct' ? 'direct' : 'relay',
      similarity: readBytesOrNull(row, 'similarity'),
    }));
    const assessment = assessIndependence(complaints, policy);
    const counts = (row: Row): boolean =>
      !requireConfirmation || readConfirmation(row) !== 'pending';
    const confirmedOrigins = new Set<number>();
    rows.forEach((row, index) => {
      const result = assessment.byComplaint.get(complaints[index]?.id ?? '');
      if (result !== undefined && counts(row)) confirmedOrigins.add(result.origin);
    });
    rows.forEach((row, index) => {
      const complaint = complaints[index];
      const result = complaint === undefined ? undefined : assessment.byComplaint.get(complaint.id);
      if (complaint === undefined || result === undefined) return;
      const isRevealed = counts(row) || readInteger(row, 'custody') === 1;
      const others = [...confirmedOrigins].filter((origin) => origin !== result.origin);
      const othersComplaints = others.reduce(
        (sum, origin) => sum + (assessment.origins[origin]?.length ?? 0),
        0,
      );
      const status: CorroborationStatus = {
        folioDigest: readText(row, 'folio_digest'),
        confirmation: requireConfirmation ? readConfirmation(row) : 'confirmed',
        isRevealed,
        groupId: isRevealed ? groupId : readText(row, 'solo_group_id'),
        complaints: result.sameOriginCount + (isRevealed ? othersComplaints : 0),
        independentSources: 1 + (isRevealed ? others.length : 0),
        confirmedOtherSources: isRevealed ? others.length : 0,
        sameOriginCount: result.sameOriginCount,
        flags: result.flags,
        signals: result.signals,
      };
      const text = canonicalize(status);
      if (text === readText(row, 'status')) return;
      updateStatus.run(text, complaint.nodeId, status.folioDigest);
      if (complaint.id === requestedBy) return;
      const seq = readInteger(lastNotice.get(complaint.nodeId) ?? { seq: 0 }, 'seq') + 1;
      insertNotice.run(complaint.nodeId, seq, text);
    });
  };

  /** Marca como envejecidas las denuncias sin confirmar que cumplieron los días de gracia. */
  const refreshAged = (): void => {
    if (!requireConfirmation) return;
    const limit = toDayDate(new Date(deps.now().getTime() - graceDays * DAY_MS));
    const groups = new Map<string, { epoch: number; tag: string }>();
    for (const row of listAging.all(limit)) {
      setConfirmation.run('aged', readText(row, 'node_id'), readText(row, 'folio_digest'));
      const epoch = readInteger(row, 'epoch');
      const tag = readText(row, 'tag');
      groups.set(`${epoch} ${tag}`, { epoch, tag });
    }
    for (const group of groups.values()) recompute(group.epoch, group.tag, null);
  };

  const statusOf = (nodeId: string, folioDigest: string): CorroborationStatus => {
    const row = findRegistration.get(nodeId, folioDigest);
    if (row === undefined) throw new ApiFailure('internal');
    return parseStatus(row);
  };

  return {
    register(registration) {
      if (!verifyIndexRegistration(registration, nodeKey(registration.nodeId))) {
        throw new ApiFailure('unauthorized');
      }
      // Se aceptan registros atrasados (custodia o denuncias importadas), no del futuro.
      assertFresh(registration.receivedAt, Number.MAX_SAFE_INTEGER);
      const similarity = decodeSimilarity(registration.similarity);
      return withTransaction(db, () => {
        refreshAged();
        if (findWithdrawal.get(registration.nodeId, registration.folioDigest) !== undefined) {
          throw new ApiFailure('bad_request');
        }
        const existing = findRegistration.get(registration.nodeId, registration.folioDigest);
        if (existing !== undefined) {
          if (
            readText(existing, 'tag') !== registration.tag ||
            readInteger(existing, 'epoch') !== registration.epoch
          ) {
            throw new ApiFailure('bad_request');
          }
          return parseStatus(existing);
        }
        // Seguridad: los días de gracia corren con el reloj del índice, no con la hora que declara
        // el nodo, para que una fecha atrasada no salte la confirmación.
        insertRegistration.run(
          registration.nodeId,
          registration.folioDigest,
          registration.epoch,
          registration.tag,
          registration.receivedAt,
          registration.entry,
          similarity,
          registration.custody === true ? 1 : 0,
          today(),
          toHex(randomBytes(16)),
        );
        recompute(
          registration.epoch,
          registration.tag,
          `${registration.nodeId} ${registration.folioDigest}`,
        );
        return statusOf(registration.nodeId, registration.folioDigest);
      });
    },
    confirm(confirmation) {
      if (!verifyIndexConfirmation(confirmation, nodeKey(confirmation.nodeId))) {
        throw new ApiFailure('unauthorized');
      }
      assertFresh(confirmation.requestedAt, MAX_CLOCK_SKEW_MS);
      return withTransaction(db, () => {
        refreshAged();
        const row = findRegistration.get(confirmation.nodeId, confirmation.folioDigest);
        if (row === undefined) throw new ApiFailure('not_found');
        if (readConfirmation(row) !== 'confirmed') {
          setConfirmation.run('confirmed', confirmation.nodeId, confirmation.folioDigest);
          recompute(
            readInteger(row, 'epoch'),
            readText(row, 'tag'),
            `${confirmation.nodeId} ${confirmation.folioDigest}`,
          );
        }
        return statusOf(confirmation.nodeId, confirmation.folioDigest);
      });
    },
    withdraw(withdrawal) {
      if (!verifyIndexWithdrawal(withdrawal, nodeKey(withdrawal.nodeId))) {
        throw new ApiFailure('unauthorized');
      }
      assertFresh(withdrawal.requestedAt, MAX_CLOCK_SKEW_MS);
      return withTransaction(db, () => {
        refreshAged();
        const row = findRegistration.get(withdrawal.nodeId, withdrawal.folioDigest);
        // Seguridad: la baja borra el registro (etiqueta, hora y resumen); solo queda el folio
        // opaco para no aceptarlo de nuevo.
        insertWithdrawal.run(withdrawal.nodeId, withdrawal.folioDigest, withdrawal.reason, today());
        if (row !== undefined) {
          deleteRegistration.run(withdrawal.nodeId, withdrawal.folioDigest);
          recompute(readInteger(row, 'epoch'), readText(row, 'tag'), null);
        }
        return { folioDigest: withdrawal.folioDigest, withdrawn: true };
      });
    },
    notices(request) {
      if (!verifyNoticesRequest(request, nodeKey(request.nodeId))) {
        throw new ApiFailure('unauthorized');
      }
      assertFresh(request.requestedAt, MAX_CLOCK_SKEW_MS);
      withTransaction(db, refreshAged);
      const rows = listNotices.all(request.nodeId, request.after, INDEX_NOTICES_MAX_PAGE);
      return {
        notices: rows.map((row) => ({ seq: readInteger(row, 'seq'), status: parseStatus(row) })),
      };
    },
  };
}
