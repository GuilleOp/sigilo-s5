// Mensajes para quien denuncia a partir de la vista del trámite: qué significa el estado actual
// (incluido «turnada»), la calificación como no grave y la ventana para inconformarse (LGRA, arts.
// 102 a 110), el archivo con escalamiento y el folio nuevo cuando la denuncia pasó a otro nodo.
import type { ProcedureView } from '@sigilo/contracts';
import { remainingDays, deadlineStatus, toMexicoCentralDay } from '@sigilo/core';
import { findDeadlineRule, findLegalStage } from '@sigilo/contracts';
import type { DeadlineStatus } from '@sigilo/contracts';

/** Texto clave del día en que se turna (docs/demo-escenario.md, sección 7). */
export const ROUTED_HEADLINE =
  'Turnada: tu denuncia ya está con la autoridad que puede investigarla. Desde hoy corre su plazo.';

/** Texto clave de la calificación como no grave (docs/demo-escenario.md, sección 7, día 30). */
export const NON_SERIOUS_HEADLINE =
  'La autoridad calificó la conducta como falta no grave. Si no estás de acuerdo, puedes inconformarte dentro de los 5 días hábiles siguientes a que te lo notifique por el buzón (LGRA, arts. 102 y 103), desde este seguimiento. Para hacerlo, la ley pide tu nombre, domicilio y firma (art. 109): solo entonces se abriría tu identidad sellada, y solo para el recurso.';

/** Encabezado del estado actual en una frase. */
export interface ProcedureHeadline {
  title: string;
  text: string;
  /**
   * `true` si el texto solo explica el estado o la etapa: ya lo dice el sello de abajo, así que
   * el cuadro del estado se usa para lo que sigue (`nextStep`).
   */
  isStateExplanation?: boolean;
}

/** Indica si alguna regla pública ya pasó la denuncia a la autoridad supervisora. */
export function isEscalated(procedure: ProcedureView): boolean {
  return procedure.rules.some((rule) => rule.effect === 'escalate');
}

/** Indica si el cierre es un archivo por falta de elementos. */
export function isArchive(procedure: ProcedureView): boolean {
  return procedure.closure?.reason === 'insufficient_information';
}

/** Situación de la ventana para inconformarse. */
export interface AppealWindow {
  dueOn: string;
  status: DeadlineStatus;
  remaining: number;
  remainingUnit: 'business_days';
}

/**
 * Ventana para inconformarse contra la calificación de no grave: 5 días hábiles desde la
 * notificación (el nodo calcula `appealDueOn`). `null` si no hay calificación de no grave, si ya se
 * presentó la inconformidad o si todavía no se notifica.
 */
export function appealWindow(
  procedure: ProcedureView,
  today: string = toMexicoCentralDay(new Date()),
): AppealWindow | null {
  const qualification = procedure.qualification;
  if (qualification?.severity !== 'non_serious' || qualification.appeal !== undefined) return null;
  const dueOn = qualification.appealDueOn;
  const rule = findDeadlineRule('appeal_filing');
  if (dueOn === undefined || rule === undefined) return null;
  try {
    return {
      dueOn,
      status: deadlineStatus(today, dueOn, rule.warning),
      remaining: remainingDays(today, dueOn, 'business_days'),
      remainingUnit: 'business_days',
    };
  } catch {
    return null;
  }
}

/** Encabezado del trámite en lenguaje sencillo. */
export function procedureHeadline(procedure: ProcedureView): ProcedureHeadline {
  const qualification = procedure.qualification;
  if (qualification?.severity === 'non_serious' && qualification.appeal === undefined) {
    return { title: qualification.severityName, text: NON_SERIOUS_HEADLINE };
  }
  if (isArchive(procedure)) {
    const parts = ['Tu denuncia fue archivada por falta de elementos.'];
    if (isEscalated(procedure)) {
      parts.push(
        'Como el archivo cumplió reglas públicas de revisión, pasó automáticamente a la autoridad supervisora.',
      );
    }
    parts.push('Si llegan nuevos indicios, se puede reabrir (LGRA, art. 100).');
    return { title: procedure.managementStateName, text: parts.join(' ') };
  }
  const state = procedure.managementState;
  if ((state === 'routed' || state === 'reassigned') && procedure.legalStage === undefined) {
    return { title: procedure.managementStateName, text: ROUTED_HEADLINE };
  }
  // Con una etapa legal, el titular dice la etapa real (por ejemplo, «Calificación de la falta»),
  // no solo el estado del trámite («Aceptada»).
  const stage =
    procedure.legalStage === undefined ? undefined : findLegalStage(procedure.legalStage);
  if (stage !== undefined) {
    return { title: stage.name, text: stage.explanation, isStateExplanation: true };
  }
  return {
    title: procedure.managementStateName,
    text: procedure.explanation,
    isStateExplanation: true,
  };
}

/** Pasos que dicen qué autoridad tiene la denuncia, y cómo leer su nombre en el título. */
const HOLDER_TITLE =
  /^(?:Turnada a|Aceptada por|Reasignada a) (.+?)(?:, en otro nodo de la red)?$/u;

/** Autoridad que tiene la denuncia ahora (según el último paso que la nombra), o `null`. */
export function currentHolder(procedure: ProcedureView): string | null {
  if (isEscalated(procedure)) return 'la autoridad supervisora';
  for (const step of [...procedure.steps].reverse()) {
    if (step.action === 'returned_to_inbox') return 'el buzón general';
    const match = HOLDER_TITLE.exec(step.title);
    if (match?.[1] !== undefined) return match[1];
  }
  return null;
}

/** Lo que sigue: quién actúa y el plazo en curso más próximo. */
export interface NextStep {
  who: string | null;
  deadline: ProcedureView['deadlines'][number] | null;
}

/** Lo que sigue en el trámite; `null` si ya está cerrado o no hay nada que decir. */
export function nextStep(procedure: ProcedureView): NextStep | null {
  if (procedure.managementState === 'closed') return null;
  const running = procedure.deadlines
    .filter((deadline) => deadline.remaining >= 0)
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const deadline = running[0] ?? procedure.deadlines[0] ?? null;
  const who = currentHolder(procedure);
  if (deadline === null && who === null) return null;
  return { who, deadline };
}

/** Folio nuevo si la denuncia pasó a otro nodo de la red (está en la nota pública del turnado). */
export function transferredFolio(procedure: ProcedureView): string | null {
  for (const step of [...procedure.steps].reverse()) {
    if (step.action !== 'transferred' || step.note === undefined) continue;
    const match = /\b[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}\b/u.exec(
      step.note,
    );
    if (match !== null) return match[0];
  }
  return null;
}
