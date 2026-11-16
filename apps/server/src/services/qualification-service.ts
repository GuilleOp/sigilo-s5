// Calificación de la falta (LGRA, art. 100) y recurso de inconformidad (arts. 102 a 110) contra la
// calificación de no grave o la abstención (art. 101). El acto se notifica a quien denunció por el
// buzón (art. 102) o con la notificación que registra la autoridad (`record_notification`; cuenta
// la primera) y abre 5 días hábiles para inconformarse ante la autoridad investigadora (arts.
// 103 y 104). Desde este seguimiento la persona solo da un aviso de inconformidad: la ley pide un
// escrito con nombre, domicilio y firma autógrafa (art. 109), y sin firma no se tiene por
// presentado. Con el aviso, la persona acepta abrir su identidad sellada solo para el recurso. La
// inconformidad cuenta cuando la autoridad registra el escrito firmado (`file_remedy`); desde ahí la
// Sala tiene 30 días hábiles (art. 107).
import type {
  AppealRequest,
  AppealResponse,
  AbstentionView,
  InconformityView,
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
import { assignedAuthorityOf, lifecycleOf } from './procedure-service.ts';
import {
  currentInconformity,
  lifecycleStateOf,
  recordedNotificationOn,
} from './lifecycle-state.ts';
import type { LifecycleState } from './lifecycle-state.ts';

/** Fundamento con que se abre la identidad para el recurso; lo ve la persona en su seguimiento. */
export const APPEAL_OPENING_BASIS =
  'Recurso de inconformidad (LGRA, arts. 102 a 110): la persona denunciante pidió abrir su identidad solo para el recurso, porque la ley exige nombre, domicilio y firma (art. 109).';

/** Aviso que la persona ve en su seguimiento cuando la autoridad se abstiene (LGRA, art. 101). */
export const ABSTENTION_NOTICE =
  'La autoridad se abstuvo de iniciar el procedimiento de responsabilidad (LGRA, art. 101). Si no estás de acuerdo, puedes inconformarte dentro de los 5 días hábiles siguientes a que te lo notifique por el buzón (arts. 102 y 103). Desde este seguimiento puedes dar el aviso de inconformidad, pero el recurso solo cuenta cuando entregas el escrito con tu nombre, domicilio y firma autógrafa ante la autoridad investigadora (art. 109).';

/** Marca de las solicitudes de apertura que pidió la propia persona denunciante. */
export const REPORTER_REQUESTER = 'reporter';

/** Aviso que la persona ve en su seguimiento al calificarse la falta como no grave. */
export const NON_SERIOUS_NOTICE =
  'La autoridad calificó la conducta como falta no grave. Si no estás de acuerdo, puedes inconformarte dentro de los 5 días hábiles siguientes a que te lo notifique por el buzón (LGRA, arts. 102 y 103). Desde este seguimiento puedes dar el aviso de inconformidad, pero el recurso solo cuenta cuando entregas el escrito con tu nombre, domicilio y firma autógrafa ante la autoridad investigadora (art. 109): sin firma no se tiene por presentado. Con el aviso se abriría tu identidad sellada, y solo para el recurso. El acuerdo de calificación está en este seguimiento; para consultar el expediente, pídelo a la autoridad investigadora por el buzón.';

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

/**
 * Primer día legal de un mensaje de la autoridad con secuencia del buzón igual o mayor que
 * `sequence` (la siguiente al momento del acto); sin secuencia, el primero del día del acto o
 * después.
 */
function firstAuthorityMessageFrom(
  ctx: AppContext,
  folio: string,
  sequence: number | null,
  actLegalOn: string,
): string | null {
  const days = ctx.messages
    .listByFolio(folio)
    .filter((message) => message.from === 'authority')
    .filter((message) =>
      sequence === null
        ? legalDayOfHour(message.sentOn) >= actLegalOn
        : message.sequence >= sequence,
    )
    .map((message) => legalDayOfHour(message.sentOn))
    .sort();
  return days[0] ?? null;
}

/** Acto que se puede impugnar con inconformidad, y cuándo se notificó. */
export interface InconformableAct {
  against: 'non_serious' | 'abstention';
  notifiedOn: string | null;
}

const NON_SERIOUS_OPEN_STAGES: ReadonlySet<string> = new Set([
  'qualification',
  'report_filed',
  'report_prevented',
]);

/**
 * Acto vigente que admite inconformidad: la abstención (mientras la denuncia está en esa etapa) o
 * la calificación de no grave (hasta que se admite el informe). `null` si no hay ninguno.
 */
export function inconformableAct(
  ctx: AppContext,
  complaint: ComplaintRecord,
  state: LifecycleState = lifecycleOf(ctx, complaint),
): InconformableAct | null {
  if (complaint.managementState === 'closed') return null;
  if (complaint.legalStage === 'abstention' && state.lastAbstention !== null) {
    const act = state.lastAbstention;
    return {
      against: 'abstention',
      notifiedOn: earliestDay(
        firstAuthorityMessageFrom(ctx, complaint.folio, act.authoritySequence, act.legalOn),
        recordedNotificationOn(state, 'abstention', act.position),
      ),
    };
  }
  const qualification = ctx.qualifications.lastQualification(complaint.folio);
  if (
    qualification?.severity === 'non_serious' &&
    complaint.legalStage !== null &&
    NON_SERIOUS_OPEN_STAGES.has(complaint.legalStage)
  ) {
    return {
      against: 'non_serious',
      notifiedOn: qualificationNotifiedOn(ctx, complaint.folio, qualification),
    };
  }
  return null;
}

/**
 * Inconformidad del trámite: contra qué procede, plazo para el escrito firmado (contado por el
 * nodo con su reloj y su calendario), aviso de la persona, escrito firmado, plazo de la Sala y
 * resultado. `null` si no hay acto impugnable ni inconformidad.
 */
export function inconformityView(
  ctx: AppContext,
  complaint: ComplaintRecord,
): InconformityView | null {
  const state = lifecycleOf(ctx, complaint);
  const act = inconformableAct(ctx, complaint, state);
  const remedy = currentInconformity(state);
  if (act === null && remedy === null) return null;
  const today = toMexicoCentralDay(ctx.deps.now());
  const notifiedOn = act?.notifiedOn ?? null;
  const filingDueOn = notifiedOn === null ? null : dueOn(ctx, 'appeal_filing', notifiedOn);
  let filing: { remaining: number; status: InconformityView['filingStatus'] } | null = null;
  if (notifiedOn !== null && remedy === null) {
    try {
      const evaluation = evaluateDeadline('appeal_filing', notifiedOn, today, {
        calendar: nodeCalendar(ctx),
      });
      filing = { remaining: evaluation.remaining, status: evaluation.status };
    } catch {
      filing = null;
    }
  }
  const notice = ctx.qualifications.findAppeal(complaint.folio);
  const signedOn = remedy?.filedOn ?? null;
  const resolutionDueOn =
    signedOn === null || remedy?.status === 'resolved'
      ? null
      : dueOn(ctx, 'appeal_resolution', signedOn);
  const against = act?.against ?? (remedy?.stage === 'abstention' ? 'abstention' : 'non_serious');
  return {
    against,
    ...(notifiedOn === null ? {} : { notifiedOn }),
    ...(filingDueOn === null ? {} : { filingDueOn }),
    ...(filing === null
      ? {}
      : {
          filingRemaining: filing.remaining,
          ...(filing.status === undefined ? {} : { filingStatus: filing.status }),
        }),
    ...(notice === null
      ? {}
      : {
          notice: {
            filedOn: notice.filedOn,
            legalOn: notice.legalOn,
            reasons: notice.reasons,
            ...(filingDueOn === null ? {} : { filingDueOn }),
            ...(signedOn === null ? {} : { signedOn }),
            ...(resolutionDueOn === null ? {} : { resolutionDueOn }),
          },
        }),
    ...(signedOn === null ? {} : { signedOn }),
    ...(resolutionDueOn === null ? {} : { resolutionDueOn }),
    ...(remedy?.outcome === null || remedy === null ? {} : { outcome: remedy.outcome }),
  };
}

/** Abstención vigente con su acuerdo, para el seguimiento y el panel. */
export function abstentionView(ctx: AppContext, complaint: ComplaintRecord): AbstentionView | null {
  const act = lifecycleOf(ctx, complaint).lastAbstention;
  if (act === null) return null;
  const isCurrent =
    complaint.legalStage === 'abstention' ||
    (complaint.managementState === 'closed' &&
      ctx.procedure.lastClosure(complaint.folio)?.legalOutcome === 'abstention');
  if (!isCurrent) return null;
  return {
    legalOn: act.legalOn,
    legalBasis: act.legalBasis,
    agreement: act.agreement,
    explanation: ABSTENTION_NOTICE,
  };
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
  // La notificación registrada por la investigadora también cuenta: vale la primera de las dos.
  const state = lifecycleStateOf(ctx.procedure.listSteps(folio), null, null);
  return earliestDay(
    firstAuthorityMessageAfter(ctx, folio, 'qualification', qualification.legalOn),
    recordedNotificationOn(state, 'qualification', state.lastQualificationPosition),
  );
}

/** El más temprano de dos días, o `null` si no hay ninguno. */
function earliestDay(first: string | null, second: string | null): string | null {
  if (first === null) return second;
  if (second === null) return first;
  return first <= second ? first : second;
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
  // El plazo de la Sala corre desde el escrito firmado que registra la autoridad, no desde el aviso.
  const remedy = currentInconformity(lifecycleOf(ctx, complaint));
  const signedOn = remedy?.filedOn ?? null;
  const resolutionDueOn =
    signedOn === null || remedy?.status === 'resolved'
      ? null
      : dueOn(ctx, 'appeal_resolution', signedOn);
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
    ...(appealDueOn === null || signedOn !== null ? {} : { appealDueOn }),
    ...(appeal === null
      ? {}
      : {
          appeal: {
            filedOn: appeal.filedOn,
            legalOn: appeal.legalOn,
            reasons: appeal.reasons,
            ...(appealDueOn === null ? {} : { filingDueOn: appealDueOn }),
            ...(signedOn === null ? {} : { signedOn }),
            ...(resolutionDueOn === null ? {} : { resolutionDueOn }),
          },
        }),
  };
}

/**
 * Registra el aviso de inconformidad de la persona denunciante (ya autenticada con su recibo)
 * contra la calificación de no grave o la abstención, y abre su identidad sellada solo para el
 * recurso. No es la inconformidad: esa cuenta cuando la autoridad registra el escrito con firma
 * autógrafa (LGRA, art. 109). Registra `appeal.filed` e `identity.opened` (con la etiqueta del
 * recibo, para que la persona la verifique en la bitácora) y el paso en su seguimiento.
 * Lanza `conflict` si no hay un acto impugnable, si ya dio el aviso, si venció el plazo de 5 días
 * hábiles desde la notificación o si la denuncia es anónima (sin identidad que la ley pueda
 * exigir; la persona tendría que presentarla por su cuenta).
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
    const act = inconformableAct(ctx, complaint);
    const isOpen = act !== null && ctx.qualifications.findAppeal(complaint.folio) === null;
    if (!isOpen || !hasIdentity) throw new ApiFailure('conflict');
    const now = ctx.deps.now();
    const legalOn = toMexicoCentralDay(now);
    const notifiedOn = act.notifiedOn;
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
        against: act.against,
        ...(qualification === null ? {} : { qualificationDigest: qualification.agreementDigest }),
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
      qualificationPosition: qualification?.position ?? -1,
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
      details: { fn: 'reporter' },
    });
    const filingDueOn = notifiedOn === null ? null : dueOn(ctx, 'appeal_filing', notifiedOn);
    return {
      filedOn,
      openingId,
      ...(filingDueOn === null ? {} : { filingDueOn }),
    };
  });
}
