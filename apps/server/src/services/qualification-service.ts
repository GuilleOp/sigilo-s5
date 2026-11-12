// Calificación de la falta (LGRA, art. 100) y recurso de inconformidad (arts. 102 a 110). La
// calificación de no grave se notifica a quien denunció por el buzón (art. 102) y abre 5 días
// hábiles para inconformarse ante la autoridad investigadora (arts. 103 y 104). La ley pide nombre,
// domicilio y firma (art. 109): la persona acepta abrir su identidad sellada solo para el recurso,
// y la apertura queda en la bitácora y en su seguimiento. La Sala resuelve en 30 días hábiles
// (art. 107).
import type {
  AppealRequest,
  AppealResponse,
  QualificationInput,
  QualificationView,
} from '@sigilo/contracts';
import {
  computeDueDate,
  evaluateDeadline,
  identityOpenedPayload,
  randomBytes,
  sha256Hex,
  termForRule,
  toDayDate,
  toHex,
  toMexicoCentralDay,
} from '@sigilo/core';
import { findDeadlineRule } from '@sigilo/contracts';
import type { AppContext } from '../context.ts';
import { nodeCalendar } from './calendar.ts';
import type { ComplaintRecord } from '../db/complaints-repository.ts';
import { withTransaction } from '../db/database.ts';
import type { StoredQualification } from '../db/qualification-repository.ts';
import { ApiFailure } from '../http/errors.ts';
import { assignedAuthorityOf } from './procedure-service.ts';

/** Fundamento con que se abre la identidad para el recurso; lo ve la persona en su seguimiento. */
export const APPEAL_OPENING_BASIS =
  'Recurso de inconformidad (LGRA, arts. 102 a 110): la persona denunciante pidió abrir su identidad solo para el recurso, porque la ley exige nombre, domicilio y firma (art. 109).';

/** Marca de las solicitudes de apertura que pidió la propia persona denunciante. */
export const REPORTER_REQUESTER = 'reporter';

/** Aviso que la persona ve en su seguimiento al calificarse la falta como no grave. */
export const NON_SERIOUS_NOTICE =
  'La autoridad calificó la conducta como falta no grave. Si no estás de acuerdo, puedes inconformarte dentro de los 5 días hábiles siguientes a que te lo notifique por el buzón (LGRA, arts. 102 y 103), desde este seguimiento. Para hacerlo, la ley pide tu nombre, domicilio y firma (art. 109): solo entonces se abriría tu identidad sellada, y solo para el recurso. El acuerdo de calificación está en este seguimiento; para consultar el expediente, pídelo a la autoridad investigadora por el buzón.';

/** Aviso del sistema que la persona ve en su seguimiento al archivarse su denuncia (H6). */
export const ARCHIVE_NOTICE =
  'La autoridad archivó tu denuncia por falta de elementos. Si eres identificable, debe notificártelo por el buzón dentro de los 10 días hábiles siguientes (LGRA, art. 100). La investigación puede abrirse de nuevo si se presentan nuevos indicios o pruebas: puedes enviarlos por el buzón.';

/**
 * Primer día legal de un mensaje de la autoridad posterior al acto: con una secuencia del buzón
 * igual o mayor que la siguiente al momento del acto. Sin registro (datos anteriores a la
 * migración 10), se compara por día, como antes.
 * Seguridad (H6): un mensaje enviado antes del acto, aunque sea el mismo día, no es su aviso.
 */
export function firstAuthorityMessageAfter(
  ctx: AppContext,
  folio: string,
  act: 'closure' | 'qualification',
  actLegalOn: string,
): string | null {
  const nextAtAct = ctx.qualifications.lastActInstant(folio, act);
  const days = ctx.messages
    .listByFolio(folio)
    .filter((message) => message.from === 'authority')
    .filter((message) =>
      nextAtAct === null
        ? legalDayOfHour(message.sentOn) >= actLegalOn
        : message.sequence >= nextAtAct,
    )
    .map((message) => legalDayOfHour(message.sentOn))
    .sort();
  return days[0] ?? null;
}

/** Guarda la calificación dentro de la transacción del trámite; devuelve su digesto. */
export function recordQualification(
  ctx: AppContext,
  complaint: ComplaintRecord,
  input: QualificationInput,
  meta: { on: string; legalOn: string; actorId: string },
): string {
  const agreementDigest = sha256Hex(input.agreement.normalize('NFC'));
  ctx.qualifications.insertQualification(complaint.folio, {
    authorityId: assignedAuthorityOf(ctx, complaint),
    on: meta.on,
    legalOn: meta.legalOn,
    severity: input.severity,
    legalBasis: input.legalBasis,
    agreement: input.agreement,
    agreementDigest,
    actorId: meta.actorId,
  });
  return agreementDigest;
}

/** Día legal de un mensaje fechado a la hora en UTC (`AAAA-MM-DDTHH:00Z`). */
function legalDayOfHour(hour: string): string {
  return toMexicoCentralDay(new Date(Date.parse(hour.replace(/Z$/u, ':00Z'))));
}

/** Primer mensaje de la autoridad por el buzón el día de la calificación o después (art. 102). */
export function qualificationNotifiedOn(
  ctx: AppContext,
  folio: string,
  qualification: StoredQualification | null,
): string | null {
  if (qualification === null || qualification.severity !== 'non_serious') return null;
  return firstAuthorityMessageAfter(ctx, folio, 'qualification', qualification.legalOn);
}

function dueOn(
  ctx: AppContext,
  key: 'appeal_filing' | 'appeal_resolution',
  startsOn: string,
): string | null {
  const rule = findDeadlineRule(key);
  if (rule === undefined) return null;
  try {
    return computeDueDate(startsOn, termForRule(rule), nodeCalendar(ctx));
  } catch {
    return null;
  }
}

/** Calificación vigente con su acuerdo y la inconformidad, para el seguimiento y el panel. */
export function qualificationView(
  ctx: AppContext,
  complaint: ComplaintRecord,
): QualificationView | null {
  const qualification = ctx.qualifications.lastQualification(complaint.folio);
  if (qualification === null) return null;
  const isNonSerious = qualification.severity === 'non_serious';
  const notifiedOn = qualificationNotifiedOn(ctx, complaint.folio, qualification);
  const appealDueOn = notifiedOn === null ? null : dueOn(ctx, 'appeal_filing', notifiedOn);
  const appeal = ctx.qualifications.findAppeal(complaint.folio);
  const resolutionDueOn = appeal === null ? null : dueOn(ctx, 'appeal_resolution', appeal.legalOn);
  return {
    on: qualification.on,
    legalOn: qualification.legalOn,
    severity: qualification.severity,
    severityName: isNonSerious ? 'Falta no grave' : 'Falta grave',
    explanation: isNonSerious
      ? NON_SERIOUS_NOTICE
      : 'La autoridad calificó la conducta como falta grave: el informe pasa a la autoridad substanciadora y la resuelve el Tribunal de Justicia Administrativa (LGRA, art. 100).',
    legalBasis: qualification.legalBasis,
    agreement: qualification.agreement,
    ...(appealDueOn === null || appeal !== null ? {} : { appealDueOn }),
    ...(appeal === null
      ? {}
      : {
          appeal: {
            filedOn: appeal.filedOn,
            legalOn: appeal.legalOn,
            reasons: appeal.reasons,
            ...(resolutionDueOn === null ? {} : { resolutionDueOn }),
          },
        }),
  };
}

/**
 * Presenta la inconformidad de la persona denunciante (ya autenticada con su recibo) contra la
 * calificación de no grave y abre su identidad sellada solo para el recurso. Registra
 * `appeal.filed` e `identity.opened` (con la etiqueta del recibo, para que la persona la verifique
 * en la bitácora) y el paso en su seguimiento.
 * Lanza `conflict` si no hay una calificación de no grave, si ya se inconformó, si venció el plazo
 * de 5 días hábiles desde la notificación o si la denuncia es anónima (sin identidad que la ley
 * pueda exigir; la persona tendría que presentarla por su cuenta).
 * Seguridad: el servidor no descifra la identidad; solo permite que la autoridad investigadora
 * competente la pida para el recurso.
 */
export function fileAppeal(
  ctx: AppContext,
  complaint: ComplaintRecord,
  request: Pick<AppealRequest, 'reasons'>,
): AppealResponse {
  return withTransaction(ctx.deps.db, () => {
    const qualification = ctx.qualifications.lastQualification(complaint.folio);
    const hasIdentity = complaint.mode === 'sealed' && complaint.sealedIdentity !== null;
    const isOpen =
      qualification !== null &&
      qualification.severity === 'non_serious' &&
      ctx.qualifications.findAppeal(complaint.folio) === null &&
      complaint.managementState !== 'closed';
    if (!isOpen || !hasIdentity) throw new ApiFailure('conflict');
    const now = ctx.deps.now();
    const legalOn = toMexicoCentralDay(now);
    const notifiedOn = qualificationNotifiedOn(ctx, complaint.folio, qualification);
    if (
      notifiedOn !== null &&
      evaluateDeadline('appeal_filing', notifiedOn, legalOn, { calendar: nodeCalendar(ctx) })
        .remaining < 0
    ) {
      throw new ApiFailure('conflict');
    }
    const openingId = toHex(randomBytes(16));
    const appealId = toHex(randomBytes(16));
    const authorityId = assignedAuthorityOf(ctx, complaint);
    const { at: filedOn } = ctx.ledger.record({
      type: 'appeal.filed',
      folio: complaint.folio,
      at: toDayDate(now),
      actorRole: 'reporter',
      payload: {
        folio: complaint.folio,
        appealId,
        openingId,
        reasonsDigest: sha256Hex(request.reasons.normalize('NFC')),
        qualificationDigest: qualification.agreementDigest,
      },
    });
    // La solicitud queda a nombre de la persona: la autoridad competente puede pedir el sobre para
    // el recurso sin la aprobación 2 de 3, que existe para aperturas que la persona no pidió.
    ctx.identityRequests.insertRequest({
      requestId: openingId,
      folio: complaint.folio,
      authorityId,
      requestedOn: filedOn,
      legalBasis: APPEAL_OPENING_BASIS,
      requestedBy: REPORTER_REQUESTER,
    });
    const payload = identityOpenedPayload({
      folio: complaint.folio,
      openingId,
      legalBasis: APPEAL_OPENING_BASIS,
      authVerifier: complaint.authVerifier,
    });
    ctx.ledger.record({
      type: 'identity.opened',
      folio: complaint.folio,
      at: toDayDate(now),
      actorRole: 'reporter',
      payload,
      receiptTag: payload.receiptTag,
    });
    ctx.identityOpenings.insert(complaint.folio, openingId, filedOn, APPEAL_OPENING_BASIS);
    ctx.qualifications.insertAppeal({
      appealId,
      folio: complaint.folio,
      filedOn,
      legalOn,
      reasons: request.reasons,
      openingId,
      qualificationPosition: qualification.position,
    });
    ctx.procedure.insertStep(complaint.folio, {
      action: 'appeal_filed',
      on: filedOn,
      legalOn,
      managementState: complaint.managementState,
      legalStage: complaint.legalStage,
      closureReason: complaint.closureReason,
      authorityId,
      actorId: null,
      note: null,
    });
    const resolutionDueOn = dueOn(ctx, 'appeal_resolution', legalOn);
    return {
      filedOn,
      openingId,
      ...(resolutionDueOn === null ? {} : { resolutionDueOn }),
    };
  });
}
