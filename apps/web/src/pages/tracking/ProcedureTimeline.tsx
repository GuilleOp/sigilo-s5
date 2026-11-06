// Seguimiento del trámite para quien denuncia: qué significa el estado actual, la línea de tiempo
// con sus etapas legales y notas públicas, los plazos con su situación, las reglas que se cumplieron
// (escalamiento y alertas), el cierre con su fundamento, la calificación con la inconformidad y el folio
// nuevo si la denuncia pasó a otro nodo.
import { ADMINISTRATIVE_STAGES } from '@sigilo/contracts';
import type { ProcedureStep, ProcedureView, TrackingView } from '@sigilo/contracts';
import { Alert } from '../../components/Alert.tsx';
import { DeadlineList } from '../../components/DeadlineList.tsx';
import { VerificationResult } from '../../components/VerificationResult.tsx';
import { Icon } from '../../components/a/icons.tsx';
import { AppealSection } from './AppealSection.tsx';
import { formatDayDate, STATUS_HINTS, STATUS_LABELS } from '../../lib/format.ts';
import { describeRemaining } from '../../lib/deadline-text.ts';
import {
  appealWindow,
  isEscalated,
  NON_SERIOUS_HEADLINE,
  nextStep,
  procedureHeadline,
  transferredFolio,
} from '../../lib/procedure-text.ts';

interface ProcedureTimelineProps {
  view: TrackingView;
  /** Cambia al folio nuevo con las mismas 8 palabras (turnado entre nodos). */
  onFollowFolio?: (folio: string) => void;
  /** Presenta la inconformidad; resuelve con un error para mostrar o `null`. */
  onFileAppeal?: (reasons: string) => Promise<string | null>;
}

/** Vista sin trámite (nodos anteriores): estatus e historia de estatus. */
function LegacyTimeline({ view }: { view: TrackingView }) {
  return (
    <>
      <p data-testid="tracking-status">{STATUS_HINTS[view.status]}</p>
      <ol className="timeline">
        {view.timeline.map((entry, index) => (
          <li key={`${entry.status}-${index}`}>
            <strong>{formatDayDate(entry.on)}</strong>: {STATUS_LABELS[entry.status]}
          </li>
        ))}
      </ol>
    </>
  );
}

/** Sello de cada paso: una palabra en mayúsculas, como en un expediente. */
const STAMP_LABELS: Readonly<Partial<Record<ProcedureStep['action'], string>>> = {
  received: 'Recibida',
  routed: 'Turnada',
  accepted: 'Aceptada',
  reassigned: 'Reasignada',
  returned_to_inbox: 'Devuelta',
  closed: 'Cerrada',
  conflict_excused: 'Excusa',
  conflict_justified: 'Justificación',
  transferred: 'Turnada',
  appeal_filed: 'Inconformidad',
};

/** Pasos cuya explicación va como nota al margen (lo que más confunde: «turnada»). */
const MARGIN_NOTE_ACTIONS: ReadonlySet<ProcedureStep['action']> = new Set([
  'routed',
  'transferred',
  'reassigned',
]);

/** Texto del sello: el del catálogo o, en un avance de etapa, el nombre de la etapa. */
function stampLabel(action: ProcedureStep['action'], title: string): string {
  return STAMP_LABELS[action] ?? title.replace(/^Etapa:\s*/u, '');
}

/**
 * Pasos cuyo título solo repite el sello («Recibida», «Aceptada por…», «Etapa: …»): no se muestra
 * bajo el sello. Sí se muestra cuando aporta algo, como el destino de «Turnada a …».
 */
const STAMP_ONLY_ACTIONS: ReadonlySet<ProcedureStep['action']> = new Set([
  'received',
  'accepted',
  'stage_advanced',
]);

/** Nombre de la etapa en la que está la denuncia: la legal si ya hay, o la del trámite. */
function currentStageName(procedure: ProcedureView): string {
  return procedure.legalStageName ?? procedure.managementStateName;
}

/** Próximas etapas legales (a lo más dos), para que la persona vea lo que falta. */
function upcomingStages(procedure: ProcedureView): string[] {
  if (procedure.managementState === 'closed') return [];
  const index = ADMINISTRATIVE_STAGES.findIndex((stage) => stage.key === procedure.legalStage);
  if (procedure.legalStage !== undefined && index === -1) return [];
  return ADMINISTRATIVE_STAGES.slice(index + 1, index + 3).map((stage) => stage.name);
}

/** Estatus, ruta de etapas con sus plazos, reglas y cierre. */
export function ProcedureTimeline({ view, onFollowFolio, onFileAppeal }: ProcedureTimelineProps) {
  const procedure = view.procedure;
  const appeal = procedure === undefined ? null : appealWindow(procedure);
  const headline = procedure === undefined ? null : procedureHeadline(procedure);
  const newFolio = procedure === undefined ? null : transferredFolio(procedure);
  const next = procedure === undefined ? null : nextStep(procedure);
  // Sin etapa legal, el estado vigente es el del último paso (por ejemplo, «Aceptada»).
  const isLastStepCurrent =
    procedure !== undefined &&
    procedure.legalStage === undefined &&
    procedure.steps.at(-1)?.managementState === procedure.managementState;
  return (
    <section
      className="card procedure"
      aria-labelledby="timeline-title"
      data-testid="procedure-view"
    >
      <h2 id="timeline-title">
        {headline === null ? `Estatus: ${STATUS_LABELS[view.status]}` : `Estado: ${headline.title}`}
      </h2>
      {procedure === undefined || headline === null ? (
        <LegacyTimeline view={view} />
      ) : (
        <>
          {/* Solo el estado vigente y su explicación: la historia va en los sellos de abajo. */}
          {/* El estado vigente y lo que sigue (quién actúa y el plazo en curso); qué significa
              cada paso ya lo dicen los sellos de abajo. */}
          <div className="procedure__current" data-testid="tracking-status">
            {next !== null && headline.isStateExplanation === true ? (
              <p data-testid="tracking-headline">
                <strong>Lo que sigue:</strong> {next.who === null ? 'la autoridad' : next.who} debe
                actuar
                {next.deadline === null ? (
                  '.'
                ) : (
                  <>
                    {' '}
                    antes del {formatDayDate(next.deadline.dueOn)} (
                    {next.deadline.name.charAt(0).toLowerCase()}
                    {next.deadline.name.slice(1)}).{' '}
                    {describeRemaining(next.deadline.remaining, next.deadline.remainingUnit)}.
                  </>
                )}
              </p>
            ) : appeal !== null &&
              appeal.status !== 'overdue' &&
              headline.text === NON_SERIOUS_HEADLINE ? (
              // La explicación completa ya va en la calificación de abajo: aquí, lo que sigue.
              <p data-testid="tracking-headline">
                La autoridad calificó la conducta como falta no grave.{' '}
                <strong>Lo que sigue:</strong> si no estás de acuerdo, puedes inconformarte desde
                este seguimiento hasta el {formatDayDate(appeal.dueOn)} (
                {describeRemaining(appeal.remaining, appeal.remainingUnit).toLowerCase()}).
              </p>
            ) : (
              <p data-testid="tracking-headline">{headline.text}</p>
            )}
            {procedure.legalStageName !== undefined && (
              <p className="source" data-testid="tracking-legal-stage">
                Etapa legal actual: {procedure.legalStageName}.
              </p>
            )}
          </div>
          {newFolio !== null && (
            <Alert tone="info" title="Tu denuncia continúa en otro nodo" testId="tracking-transfer">
              <p>
                Ahora tiene el folio <strong className="mono folio">{newFolio}</strong>. Usa las
                mismas 8 palabras para darle seguimiento allá.
              </p>
              {onFollowFolio !== undefined && (
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => onFollowFolio(newFolio)}
                  data-testid="tracking-follow-folio"
                >
                  Ver la denuncia con el folio nuevo
                </button>
              )}
            </Alert>
          )}
          {isEscalated(procedure) && (
            <Alert
              tone="warning"
              title="Pasó a la autoridad supervisora"
              testId="tracking-escalated"
            >
              <p>
                Una regla pública de revisión se cumplió, así que una copia cerrada con llave de tu
                denuncia llegó a la autoridad que supervisa a quien la tenía. Tu nombre no va en esa
                copia.
              </p>
            </Alert>
          )}
          {procedure.qualification !== undefined && (
            <AppealSection
              qualification={procedure.qualification}
              mode={view.mode}
              window={appeal}
              {...(onFileAppeal === undefined ? {} : { onFile: onFileAppeal })}
            />
          )}
          <h3>Etapas</h3>
          <ol className="route route--stamps" data-testid="procedure-steps">
            {procedure.steps.map((step, index) => (
              <li
                key={`${step.action}-${index}`}
                className="route__step procedure-step"
                // Sin etapa legal, el último sello es el estado vigente: no se repite abajo.
                data-s={isLastStepCurrent && index === procedure.steps.length - 1 ? 'now' : 'done'}
                aria-current={
                  isLastStepCurrent && index === procedure.steps.length - 1 ? 'step' : undefined
                }
                data-action={step.action}
              >
                <span className="route__node">
                  <Icon name="tick" />
                </span>
                <div>
                  <p className="route__head">
                    <span className="stamp stamp--ink">
                      <Icon name="tick" />
                      <span>
                        {stampLabel(step.action, step.title)}{' '}
                        <small>{formatDayDate(step.legalOn)}</small>
                      </span>
                    </span>
                  </p>
                  {!STAMP_ONLY_ACTIONS.has(step.action) && (
                    <p className="route__title">{step.title}</p>
                  )}
                  {step.explanation !== '' &&
                    (MARGIN_NOTE_ACTIONS.has(step.action) ? (
                      <div className="margin-note">
                        <p className="margin-note__title">
                          Nota al margen: ¿qué significa «
                          {stampLabel(step.action, step.title).toLowerCase()}»?
                        </p>
                        <p>{step.explanation}</p>
                      </div>
                    ) : (
                      <p className="procedure-step__explain">{step.explanation}</p>
                    ))}
                  {step.note !== undefined && (
                    <p className="procedure-step__note">Nota de la autoridad: «{step.note}»</p>
                  )}
                </div>
              </li>
            ))}
            {!isLastStepCurrent && (
              <li className="route__step" data-s="now" aria-current="step">
                <span className="route__node">
                  <Icon name="clock" />
                </span>
                <p className="route__head">
                  <span className="stamp stamp--protect">
                    <Icon name="check" />
                    <span>
                      {currentStageName(procedure)} <small>ahora</small>
                    </span>
                  </span>
                </p>
              </li>
            )}
            {upcomingStages(procedure).map((stage) => (
              <li key={stage} className="route__step" data-s="todo">
                <span className="route__node">
                  <Icon name="flat" />
                </span>
                <p className="route__head">
                  <span className="stamp stamp--idle">
                    <Icon name="flat" />
                    <span>{stage} · pendiente</span>
                  </span>
                </p>
              </li>
            ))}
          </ol>
          {procedure.deadlines.length > 0 && (
            <>
              <h3>Plazos que corren</h3>
              <DeadlineList
                deadlines={procedure.deadlines}
                shouldExplain
                hasRuler
                testId="tracking-deadlines"
              />
            </>
          )}
          {procedure.rules.length > 0 && (
            <>
              <h3>Reglas públicas que se cumplieron</h3>
              <ul className="rule-list" data-testid="tracking-rules">
                {procedure.rules.map((rule) => (
                  <li key={`${rule.ruleKey}-${rule.on}`} className="rule" data-effect={rule.effect}>
                    <p>
                      <strong>{rule.name}</strong> ({formatDayDate(rule.on)}).{' '}
                      {rule.effect === 'escalate' ? 'Se escaló.' : 'Es un aviso.'}
                    </p>
                    <p>{rule.explanation}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
          {procedure.closure !== undefined && (
            <section
              className="closure"
              aria-labelledby="closure-title"
              data-testid="tracking-closure"
            >
              <h3 id="closure-title">Cierre: {procedure.closure.reasonName}</h3>
              <p>{procedure.closure.reasonExplanation}</p>
              <p>Fundamento: «{procedure.closure.legalBasis}»</p>
              <details>
                <summary>Leer el acuerdo (versión pública)</summary>
                <p className="review-text">{procedure.closure.agreement}</p>
              </details>
              {procedure.closure.sanctionCheck !== undefined && (
                <VerificationResult
                  outcome={procedure.closure.sanctionCheck.outcome}
                  testId="tracking-sanction-check"
                >
                  <p>{procedure.closure.sanctionCheck.explanation}</p>
                </VerificationResult>
              )}
            </section>
          )}
        </>
      )}
      {(view.evidenceDiscards ?? []).map((discard, index) => (
        <p key={`discard-${index}`} data-testid="tracking-evidence-discard">
          La autoridad descartó {discard.count === 1 ? '1 prueba' : `${discard.count} pruebas`} el{' '}
          {formatDayDate(discard.on)}. Los archivos se borraron y queda anotado en el registro
          público.
        </p>
      ))}
    </section>
  );
}
