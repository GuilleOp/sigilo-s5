// Plazos legales que hay que esperar antes de un paso o un cierre: la firmeza espera a que venzan
// los plazos de los recursos (LGRA, art. 206), el informe se tiene por no presentado solo después
// de los 3 días para corregirlo (art. 195), la abstención se cierra después de la ventana de la
// inconformidad (arts. 102 y 103), y la caducidad y la prescripción solo cuando ya corrieron sus
// plazos (art. 74). Se cuentan con el mismo cálculo de días hábiles, el mismo calendario y el mismo
// reloj del nodo que los plazos del panel. Si falta el día desde el que corre un plazo, se responde
// lo prudente: todavía no.
import {
  findDeadlineRule,
  offenseSeverity,
  remedyKindForFilingDeadline,
  STAGE_WAIT_TEXTS,
} from '@sigilo/contracts';
import type { AdministrativeStage, DeadlineKey, RemedyKind } from '@sigilo/contracts';
import { evaluateDeadline } from '@sigilo/core';
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
    const wait =
      enteredOn === null ? { isOpen: true, dueOn: null } : dueOnIfOpen(ctx, key, enteredOn, today);
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
  return `${what} hasta el ${formatLegalDay(dueOn)}. Este paso procede a partir del día siguiente, o antes si el recurso presentado ya se resolvió (LGRA, art. 206).`;
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
      return 'Primero notifica la abstención a la persona denunciante por el buzón: desde ese aviso tiene 5 días hábiles para inconformarse (LGRA, arts. 102 y 103).';
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
