// Plazos legales que hay que esperar antes de un paso o un cierre: la firmeza espera a que venzan
// los plazos de los recursos (LGRA, art. 206), contados desde la notificación de la resolución o de
// la sentencia (arts. 208 fr. XI, 209 fr. V, 210, 215 y 220; sin notificación no hay firmeza), el informe se tiene por no presentado solo después
// de los 3 días para corregirlo (art. 195), la abstención se cierra después de la ventana de la
// inconformidad (arts. 102 y 103), y la caducidad y la prescripción solo cuando ya corrieron sus
// plazos (art. 74). Se cuentan con el mismo cálculo de días hábiles, el mismo calendario y el mismo
// reloj del nodo que los plazos del panel. La audiencia inicial no se celebra antes de 10 días
// hábiles desde el emplazamiento (art. 208 fr. III), la instrucción se cierra vencidos los alegatos
// (arts. 208 fr. IX y 209 fr. III) y la medida cautelar se concede o se niega vencida la vista
// (arts. 126 y 127). Si falta el día desde el que corre un plazo, se responde lo prudente:
// todavía no.
import {
  findDeadlineRule,
  formatLegalReference,
  notifiableActAt,
  NOTIFICATION_DEADLINES,
  NOTIFICATION_FIRST_TEXT,
  offenseSeverity,
  remedyKindForFilingDeadline,
  STAGE_WAIT_TEXTS,
} from '@sigilo/contracts';
import type { AdministrativeStage, DeadlineKey, RemedyKind } from '@sigilo/contracts';
import { computeDueDate, evaluateDeadline } from '@sigilo/core';
import type { AppContext } from '../context.ts';
import type { ComplaintRecord } from '../db/complaints-repository.ts';
import { nodeCalendar } from './calendar.ts';
import { currentInconformity } from './lifecycle-state.ts';
import type { LifecycleState } from './lifecycle-state.ts';
import { procedureSnapshot } from './procedure-view.ts';
import { inconformableAct } from './qualification-service.ts';

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** «2026-12-14» → «14 de diciembre de 2026». */
export function formatLegalDay(day: string): string {
  const [year, month, date] = day.split('-');
  const name = MONTHS[Number(month) - 1];
  return name === undefined ? day : `${Number(date)} de ${name} de ${year}`;
}

/** Último día del plazo, o `null` si no se puede calcular (fuera del calendario). */
function dueOnIfOpen(ctx: AppContext, key: DeadlineKey, start: string, today: string) {
  try {
    const evaluation = evaluateDeadline(key, start, today, { calendar: nodeCalendar(ctx) });
    return { isOpen: evaluation.status !== 'overdue', dueOn: evaluation.dueOn as string | null };
  } catch {
    return { isOpen: true, dueOn: null };
  }
}

/** Plazo abierto que impide el paso y hasta qué día corre. */
export interface OpenWait {
  key: DeadlineKey;
  dueOn: string | null;
  message: string;
}

/**
 * Primer impedimento de `keys` para dejar la etapa `stage`: el plazo abierto que vence más tarde,
 * o `null` si todos vencieron o si los recursos que se presentaron contra el acto en esta etapa ya
 * se resolvieron (art. 206: la resolución queda firme al resolverse el recurso).
 */
export function openStageWait(
  ctx: AppContext,
  state: LifecycleState,
  stage: AdministrativeStage,
  keys: readonly DeadlineKey[],
  today: string,
): OpenWait | null {
  if (keys.length === 0) return null;
  const enteredOn = state.stageEnteredOn;
  // Los plazos de los recursos contra la resolución o la sentencia corren desde su notificación.
  const notifiedOn = state.stageNotification?.notifiedOn ?? null;
  const fromNotification = keys.filter((key) => NOTIFICATION_DEADLINES.has(key));
  if (fromNotification.length > 0 && notifiedOn === null) {
    const act = notifiableActAt(stage);
    const references = act?.legalBasis.map(formatLegalReference).join('; ') ?? 'LGRA';
    return {
      key: fromNotification[0] as DeadlineKey,
      dueOn: null,
      message: `${NOTIFICATION_FIRST_TEXT} ${act?.name ?? 'el acto'} (${references}). Este paso procede cuando venzan esos plazos después de la notificación.`,
    };
  }
  const remedyKinds = new Set<RemedyKind>();
  for (const key of keys) {
    const kind = remedyKindForFilingDeadline(key);
    if (kind !== undefined) remedyKinds.add(kind);
  }
  if (remedyKinds.size > 0 && enteredOn !== null) {
    const filed = state.remedies.filter(
      (remedy) =>
        remedyKinds.has(remedy.kind) && remedy.stage === stage && remedy.filedOn >= enteredOn,
    );
    if (filed.length > 0 && filed.every((remedy) => remedy.status === 'resolved')) return null;
  }
  const open: { key: DeadlineKey; dueOn: string | null }[] = [];
  for (const key of keys) {
    const start = NOTIFICATION_DEADLINES.has(key) ? notifiedOn : enteredOn;
    const wait =
      start === null ? { isOpen: true, dueOn: null } : dueOnIfOpen(ctx, key, start, today);
    if (wait.isOpen) open.push({ key, dueOn: wait.dueOn });
  }
  // El que más tarda: sin fecha conocida, o el de vencimiento más tardío.
  const latest =
    open.find((item) => item.dueOn === null) ??
    open.reduce<(typeof open)[number] | null>(
      (best, item) => (best === null || (item.dueOn ?? '') > (best.dueOn ?? '') ? item : best),
      null,
    );
  return latest === null ? null : { ...latest, message: waitMessage(latest.key, latest.dueOn) };
}

function waitMessage(key: DeadlineKey, dueOn: string | null): string {
  const what = STAGE_WAIT_TEXTS[key] ?? `Todavía corre el plazo «${findDeadlineRule(key)?.name}»`;
  if (dueOn === null) {
    return `${what}: no se sabe desde cuándo corre el plazo, así que el sistema no permite este paso todavía.`;
  }
  // Solo los plazos para presentar un recurso se acortan al resolverse el recurso (art. 206).
  const tail =
    remedyKindForFilingDeadline(key) === undefined
      ? `(${legalBasisText(key)})`
      : 'o antes si el recurso presentado ya se resolvió (LGRA, art. 206)';
  return `${what} hasta el ${formatLegalDay(dueOn)}. Este paso procede a partir del día siguiente, ${tail}.`;
}

/** «LGRA, art. 208, fracc. IX; LGRA, art. 209, fracc. III»: fundamento del plazo `key`. */
function legalBasisText(key: DeadlineKey): string {
  const references = findDeadlineRule(key)?.legalBasis ?? [];
  return references.length === 0 ? 'LGRA' : references.map(formatLegalReference).join('; ');
}

/** Primer día en que procede el acto de un plazo con mínimo (`minAmount`), o `null`. */
export function earliestDayOf(ctx: AppContext, key: DeadlineKey, start: string): string | null {
  const rule = findDeadlineRule(key);
  if (rule?.minAmount === undefined) return null;
  try {
    return computeDueDate(start, { unit: rule.unit, amount: rule.minAmount }, nodeCalendar(ctx));
  } catch {
    return null;
  }
}

/**
 * Impedimento para dar un paso que no procede antes del mínimo del plazo `key` (la audiencia
 * inicial, 10 días hábiles después del emplazamiento; LGRA, art. 208 fr. III), o `null`.
 */
export function earliestStageWait(
  ctx: AppContext,
  state: LifecycleState,
  key: DeadlineKey,
  today: string,
): string | null {
  const what = STAGE_WAIT_TEXTS[key] ?? `El paso espera el plazo «${findDeadlineRule(key)?.name}»`;
  const enteredOn = state.stageEnteredOn;
  const earliest = enteredOn === null ? null : earliestDayOf(ctx, key, enteredOn);
  if (earliest === null) {
    return `${what}: no se sabe desde cuándo corre el plazo, así que el sistema no permite este paso todavía.`;
  }
  if (today >= earliest) return null;
  return `${what} (${legalBasisText(key)}): procede a partir del ${formatLegalDay(earliest)}.`;
}

/**
 * Impedimento para conceder o negar una medida cautelar: antes se da vista 5 días hábiles a quienes
 * afecta (LGRA, arts. 126 y 127). Mientras tanto solo cabe concederla provisionalmente.
 */
export function precautionaryWait(ctx: AppContext, requestedOn: string, today: string) {
  const { isOpen, dueOn } = dueOnIfOpen(ctx, 'precautionary_hearing', requestedOn, today);
  if (!isOpen) return null;
  return dueOn === null
    ? 'Todavía corre la vista de 5 días hábiles sobre la medida cautelar: mientras tanto solo se puede conceder provisionalmente (LGRA, arts. 126 y 127).'
    : `La vista sobre la medida cautelar corre hasta el ${formatLegalDay(dueOn)}: mientras tanto solo se puede conceder provisionalmente; concederla o negarla procede a partir del día siguiente (LGRA, arts. 126 y 127).`;
}

/** Último día de los 3 días hábiles para reclasificar y si sigue corriendo (art. 209 fr. II). */
export function reclassificationDue(ctx: AppContext, orderedOn: string, today: string) {
  return dueOnIfOpen(ctx, 'reclassification', orderedOn, today);
}

/**
 * Impedimento para admitir las pruebas en el Tribunal mientras la investigadora tiene la orden de
 * reclasificar y su plazo de 3 días hábiles corre (LGRA, art. 209 fr. II). Vencido, el Tribunal
 * sigue con el procedimiento aunque no se haya reclasificado.
 */
export function reclassificationWait(
  ctx: AppContext,
  state: LifecycleState,
  today: string,
): string | null {
  const orderedOn = state.reclassificationOrderedOn;
  if (orderedOn === null) return null;
  const { isOpen, dueOn } = reclassificationDue(ctx, orderedOn, today);
  if (!isOpen) return null;
  return dueOn === null
    ? 'La autoridad investigadora todavía tiene la orden de reclasificar la falta: el Tribunal admite las pruebas cuando la registre o venzan sus 3 días hábiles (LGRA, art. 209 fr. II).'
    : `La autoridad investigadora tiene hasta el ${formatLegalDay(dueOn)} para registrar la falta reclasificada: el Tribunal admite las pruebas cuando la registre o, si no lo hace, a partir del día siguiente (LGRA, art. 209 fr. II).`;
}

/**
 * Impedimento de plazo para cerrar con el motivo legal `outcome`, o `null`:
 * - abstención: con identidad sellada, hasta que venzan los 5 días hábiles para inconformarse
 *   desde la notificación (o que la inconformidad se resuelva; si está pendiente, ya se bloquea);
 * - caducidad: solo con más de 6 meses sin actuación desde la última (art. 74);
 * - prescripción: no antes de 3 años (no grave) o 7 (grave) desde el inicio del periodo de los
 *   hechos, la cota más temprana posible (art. 74).
 */
export function closureWait(
  ctx: AppContext,
  complaint: ComplaintRecord,
  state: LifecycleState,
  outcome: string,
  today: string,
): string | null {
  if (outcome === 'abstention') {
    const hasIdentity = complaint.mode === 'sealed' && complaint.sealedIdentity !== null;
    const act = inconformableAct(ctx, complaint, state);
    // Con la inconformidad presentada decide su resultado: pendiente ya bloquea el cierre.
    if (!hasIdentity || act === null || currentInconformity(state) !== null) return null;
    if (act.notifiedOn === null) {
      return 'Primero notifica la abstención a la persona denunciante (por el buzón o con «Registrar la notificación»): desde ese aviso tiene 5 días hábiles para inconformarse (LGRA, arts. 102 y 103).';
    }
    const { isOpen, dueOn } = dueOnIfOpen(ctx, 'appeal_filing', act.notifiedOn, today);
    if (!isOpen) return null;
    return dueOn === null
      ? 'Todavía corre el plazo para inconformarse con la abstención (LGRA, art. 103).'
      : `La persona denunciante todavía puede inconformarse con la abstención hasta el ${formatLegalDay(dueOn)} (LGRA, art. 103).`;
  }
  if (outcome === 'expired') {
    const { lastActivityOn } = procedureSnapshot(ctx, complaint);
    const { isOpen, dueOn } = dueOnIfOpen(ctx, 'inactivity_expiry', lastActivityOn, today);
    if (!isOpen) return null;
    return `La caducidad procede con más de 6 meses sin actuación: la última fue el ${formatLegalDay(lastActivityOn)}${dueOn === null ? '' : ` y el plazo vence el ${formatLegalDay(dueOn)}`} (LGRA, art. 74).`;
  }
  if (outcome === 'prescribed') {
    const qualification = ctx.qualifications.lastQualification(complaint.folio);
    const severity =
      qualification?.severity ??
      (offenseSeverity(complaint.facts.offenseCode) === 'serious' ? 'serious' : 'non_serious');
    const key: DeadlineKey =
      severity === 'serious' ? 'prescription_serious' : 'prescription_non_serious';
    const start = `${complaint.facts.occurredPeriod}-01`;
    const { isOpen, dueOn } = dueOnIfOpen(ctx, key, start, today);
    if (!isOpen) return null;
    return `La facultad de sancionar todavía no prescribe: con hechos de ${complaint.facts.occurredPeriod}, lo más pronto sería después del ${formatLegalDay(dueOn ?? start)} (LGRA, art. 74).`;
  }
  return null;
}
