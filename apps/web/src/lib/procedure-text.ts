// Mensajes para quien denuncia a partir de la vista del trámite: qué significa el estado actual
// (incluido «turnada»), la calificación como no grave o la abstención y la ventana para
// inconformarse (LGRA, arts. 101 a 110), el archivo con escalamiento y el folio nuevo cuando la
// denuncia pasó a otro nodo.
import type { ProcedureView } from '@sigilo/contracts';
import { remainingDays, deadlineStatus, toMexicoCentralDay } from '@sigilo/core';
import {
  COURT_ACCESS_STAGES,
  findComplaintStatus,
  findDeadlineRule,
  findLegalClosureReason,
  findLegalStage,
  functionInChargeAt,
} from '@sigilo/contracts';
import type { DeadlineStatus } from '@sigilo/contracts';

/** Texto clave del día en que se turna (docs/demo-escenario.md, sección 7). */
export const ROUTED_HEADLINE =
  'Turnada: tu denuncia ya está con la autoridad que puede investigarla. Desde hoy corre su plazo.';

/** Texto clave de la calificación como no grave (docs/demo-escenario.md, sección 7, día 30). */
export const NON_SERIOUS_HEADLINE =
  'La autoridad calificó la conducta como falta no grave. Si no estás de acuerdo, puedes inconformarte dentro de los 5 días hábiles siguientes a que te lo notifique por el buzón (LGRA, arts. 102 y 103). Desde este seguimiento preparas el aviso; la inconformidad cuenta cuando entregas el escrito con tu nombre, domicilio y firma autógrafa ante la autoridad investigadora (art. 109). Solo entonces se abriría tu identidad sellada, y solo para el recurso.';

/** Texto clave de la abstención (LGRA, art. 101). */
export const ABSTENTION_HEADLINE =
  'La autoridad se abstuvo de iniciar el procedimiento: consideró que no hubo daño a la hacienda pública y que el caso era de criterio opinable o se corrigió (LGRA, art. 101). Si no estás de acuerdo, puedes inconformarte en 5 días hábiles con escrito firmado ante la autoridad investigadora (arts. 102, 103 y 109).';

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
 * Ventana para entregar el escrito de inconformidad contra la calificación de no grave o la
 * abstención: 5 días hábiles desde la notificación. Los días que faltan los cuenta el nodo con su
 * reloj y su calendario (`inconformity.filingRemaining`), igual que en «Plazos que corren»: contarlos
 * aquí con el reloj de este dispositivo daba otro número (por ejemplo, «faltan 29 días hábiles» junto
 * a un plazo de 5). `null` si no hay acto impugnable, si la autoridad ya registró el escrito firmado
 * o si todavía no se notifica. Los nodos anteriores al estándar 0.4.0 no mandan `inconformity`: ahí
 * se calcula como antes.
 */
export function appealWindow(
  procedure: ProcedureView,
  today: string = toMexicoCentralDay(new Date()),
): AppealWindow | null {
  const inconformity = procedure.inconformity;
  if (inconformity !== undefined) {
    const isOpen = inconformity.signedOn === undefined && inconformity.outcome === undefined;
    const { filingDueOn, filingRemaining, filingStatus } = inconformity;
    if (!isOpen || filingDueOn === undefined) return null;
    if (filingRemaining !== undefined && filingStatus !== undefined) {
      return {
        dueOn: filingDueOn,
        status: filingStatus,
        remaining: filingRemaining,
        remainingUnit: 'business_days',
      };
    }
  }
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
  // Cerrada: el título dice cómo concluyó (por ejemplo, «Concluida con sanción firme»), igual que
  // la lista del panel, y no la última etapa («Sanción ejecutada»).
  const closure = procedure.closure;
  if (procedure.managementState === 'closed' && closure !== undefined && !isArchive(procedure)) {
    const outcome =
      closure.legalOutcome === undefined ? undefined : findLegalClosureReason(closure.legalOutcome);
    const status = outcome === undefined ? undefined : findComplaintStatus(outcome.status);
    return {
      title: status?.name ?? closure.legalOutcomeName ?? closure.reasonName,
      text: closure.legalOutcomeExplanation ?? closure.reasonExplanation,
      isStateExplanation: true,
    };
  }
  const qualification = procedure.qualification;
  const isSigned = procedure.inconformity?.signedOn !== undefined;
  if (procedure.legalStage === 'abstention' && !isSigned) {
    return { title: 'Abstención', text: ABSTENTION_HEADLINE };
  }
  if (
    qualification?.severity === 'non_serious' &&
    qualification.appeal === undefined &&
    (procedure.legalStage === undefined ||
      ['qualification', 'report_filed', 'report_prevented'].includes(procedure.legalStage)) &&
    !isSigned
  ) {
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

/**
 * Indica si los sellos ya muestran el estado vigente, para no repetirlo con la píldora «ahora»:
 * con el trámite cerrado (el título ya dice cómo concluyó); sin etapa legal, si el último paso
 * tiene el estado vigente (por ejemplo, «Aceptada»); con etapa, si el último cambio de etapa
 * administrativa ya es la etapa vigente (por ejemplo, «Sentencia del Tribunal» con su fecha).
 */
export function isCurrentShown(procedure: ProcedureView): boolean {
  if (procedure.managementState === 'closed') return true;
  if (procedure.legalStage === undefined) {
    return procedure.steps.at(-1)?.managementState === procedure.managementState;
  }
  const lastStage = procedure.steps.findLast(
    (step) => step.action === 'stage_advanced' && step.record?.criminalStage === undefined,
  );
  return lastStage?.legalStage === procedure.legalStage;
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

/**
 * Quién actúa ahora: en las etapas del Tribunal, el Tribunal (notifica su sentencia, LGRA,
 * art. 209 fr. V); en las de la substanciación, la autoridad substanciadora; si no, quien tiene
 * la denuncia.
 */
function whoActsNow(procedure: ProcedureView): string | null {
  const stage = procedure.legalStage;
  if (stage !== undefined && procedure.criminalStage === undefined) {
    if (COURT_ACCESS_STAGES.has(stage)) return 'el Tribunal de Justicia Administrativa';
    if (functionInChargeAt(stage) === 'substantiation') return 'la autoridad substanciadora';
  }
  return currentHolder(procedure);
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
  const who = whoActsNow(procedure);
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
