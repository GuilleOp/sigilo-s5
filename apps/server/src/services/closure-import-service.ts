// Importación de acuerdos de cierre recibidos por otros medios (Bases de la PDN, art. 58): la
// autoridad sube un lote en versión pública para que el auditor los revise junto con los del nodo.
// El lote queda en la bitácora como un solo evento `closures.imported` con su digesto.
import type { ImportClosuresRequest, ImportClosuresResponse } from '@sigilo/contracts';
import {
  canonicalize,
  generateFolio,
  randomBytes,
  sha256Hex,
  toDayDate,
  toHex,
} from '@sigilo/core';
import type { AppContext } from '../context.ts';
import { withTransaction } from '../db/database.ts';
import type { AuthorityAccount } from '../security/authority-registry.ts';

/**
 * Importa los acuerdos del lote para la autoridad de la cuenta. Un expediente que ya estaba se
 * omite (la importación se puede repetir sin duplicar). El evento de bitácora usa un identificador
 * de lote al azar con forma de folio: no apunta a ninguna denuncia.
 * Seguridad: los acuerdos ya deben venir en versión pública; el nodo no los publica, solo publica
 * el digesto del lote.
 */
export function importClosures(
  ctx: AppContext,
  account: AuthorityAccount,
  request: ImportClosuresRequest,
): ImportClosuresResponse {
  const batchDigest = sha256Hex(canonicalize(request.acts));
  const batchId = generateFolio();
  return withTransaction(ctx.deps.db, () => {
    let imported = 0;
    for (const act of request.acts) {
      const isNew = ctx.integration.insertImportedAct({
        actId: toHex(randomBytes(16)),
        authorityId: account.authorityId,
        fileNumber: act.fileNumber,
        issuedOn: act.issuedOn,
        reason: act.reason ?? null,
        qualification: act.qualification ?? null,
        agreement: act.agreement,
        batchId,
      });
      if (isNew) imported += 1;
    }
    if (imported > 0) {
      ctx.ledger.record(
        {
          type: 'closures.imported',
          folio: batchId,
          at: toDayDate(ctx.deps.now()),
          actorRole: 'authority',
          payload: {
            batchDigest,
            imported,
            authorityId: account.authorityId,
            actor: account.accountId,
          },
        },
        { isExemptFromDailyCap: true },
      );
    }
    return { imported, skipped: request.acts.length - imported, batchDigest };
  });
}
