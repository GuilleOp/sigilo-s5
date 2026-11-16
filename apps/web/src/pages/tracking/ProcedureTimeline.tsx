// Seguimiento del trámite para quien denuncia: qué significa el estado actual, la línea de tiempo
// con sus etapas legales y notas públicas, los plazos con su situación, las reglas que se cumplieron
// (escalamiento y alertas), el cierre con su fundamento y su motivo legal, la calificación o la
// abstención con la inconformidad, la vía penal que corre en paralelo, los recursos, lo que puede
// hacer como tercera y el folio nuevo si la denuncia pasó a otro nodo. Todo en lenguaje sencillo.
import { findLegalStage, transitionsFrom } from '@sigilo/contracts';
import type { AdministrativeStage } from '@sigilo/contracts';
import type { ProcedureStep, ProcedureView, TrackingView } from '@sigilo/contracts';
import { Alert } from '../../components/Alert.tsx';
import { DeadlineList } from '../../components/DeadlineList.tsx';
import { VerificationResult } from '../../components/VerificationResult.tsx';
import { Icon } from '../../components/a/icons.tsx';
import { AppealSection } from './AppealSection.tsx';
import { formatDayDate, STATUS_HINTS, STATUS_LABELS } from '../../lib/format.ts';
import { describeRemaining } from '../../lib/deadline-text.ts';
import {
  ABSTENTION_HEADLINE,
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
  appeal_filed: 'Aviso de inconformidad',
  abstention_declared: 'Abstención',
  report_not_filed: 'Informe no presentado',
  returned_by_court: 'Devuelta por el Tribunal',
  reclassification_ordered: 'Reclasificación',
  precautionary_decided: 'Medidas',
  remedy_filed: 'Recurso',
  remedy_resolved: 'Recurso resuelto',
  criminal_referral_filed: 'Vista al Ministerio Público',
  federal_funds_flagged: 'Recursos federales',
  federal_notice_sent: 'Aviso federal',
  sanction_registered: 'Registro de la sanción',
  withdrawal_received: 'Desistimiento',
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

/** Pasos que no son el camino de siempre: prevenir, abstenerse, devolver o volver a investigar. */
const DETOURS: ReadonlySet<string> = new Set(['report_prevented', 'abstention', 'investigation']);

/**
 * Próximas etapas legales del camino de siempre (a lo más dos), para que la persona vea lo que
 * falta: con la rama de su calificación (no grave con la misma autoridad; grave en el Tribunal).
 */
function upcomingStages(procedure: ProcedureView): string[] {
  if (procedure.managementState === 'closed') return [];
  const severity = procedure.steps.some((step) => step.action === 'returned_by_court')
    ? 'non_serious'
    : procedure.qualification?.severity;
  const names: string[] = [];
  let stage = (procedure.legalStage ?? null) as AdministrativeStage | null;
  if (stage !== null && findLegalStage(stage)?.track !== 'administrative') return [];
  while (names.length < 2) {
    const next = transitionsFrom(stage).find(
      (transition) =>
        transition.action === 'stage_advanced' &&
        !DETOURS.has(transition.to) &&
        (transition.severities === undefined ||
          severity === undefined ||
          transition.severities.includes(severity)),
    );
    if (next === undefined) break;
    names.push(findLegalStage(next.to)?.name ?? next.to);
    stage = next.to;
  }
  return names;
}

/** Etapas en las que la persona identificada puede comparecer o apelar como tercera. */
const THIRD_PARTY_HEARING: ReadonlySet<string> = new Set(['summoned', 'initial_hearing']);

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
                    {describeRemaining(
                      next.deadline.remaining,
                      next.deadline.remainingUnit,
                      next.deadline.dueOn,
                    )}
                    .
                  </>
                )}
              </p>
            ) : appeal !== null &&
              appeal.status !== 'overdue' &&
              (headline.text === NON_SERIOUS_HEADLINE || headline.text === ABSTENTION_HEADLINE) ? (
              // La explicación completa ya va en la sección de abajo: aquí, lo que sigue.
              <p data-testid="tracking-headline">
                {headline.text === ABSTENTION_HEADLINE
                  ? 'La autoridad se abstuvo de iniciar el procedimiento.'
                  : 'La autoridad calificó la conducta como falta no grave.'}{' '}
                <strong>Lo que sigue:</strong> si no estás de acuerdo, entrega tu escrito de
                inconformidad firmado ante la autoridad investigadora hasta el{' '}
                {formatDayDate(appeal.dueOn)} (
                {describeRemaining(
                  appeal.remaining,
                  appeal.remainingUnit,
                  appeal.dueOn,
                ).toLowerCase()}
                ). Aquí puedes preparar el aviso.
              </p>
            ) : (
              <p data-testid="tracking-headline">{headline.text}</p>
            )}
            {procedure.legalStageName !== undefined && (
              <p className="source" data-testid="tracking-legal-stage">
                Etapa legal actual: {procedure.legalStageName}.
              </p>
            )}
            {procedure.criminalStageName !== undefined && (
              <p className="source" data-testid="tracking-criminal-stage">
                Vía penal, al mismo tiempo: {procedure.criminalStageName}. Corre aparte de la
                administrativa y una no detiene a la otra.
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
          {(procedure.qualification !== undefined || procedure.abstention !== undefined) && (
            <AppealSection
              procedure={procedure}
              mode={view.mode}
              window={appeal}
              {...(onFileAppeal === undefined ? {} : { onFile: onFileAppeal })}
            />
          )}
          {view.mode === 'sealed' &&
            procedure.legalStage !== undefined &&
            THIRD_PARTY_HEARING.has(procedure.legalStage) && (
              <Alert
                tone="info"
                title="Puedes participar como tercera"
                testId="tracking-third-party"
              >
                <p>
                  Si te identificas, eres tercera en el procedimiento: te citan a la audiencia
                  inicial 72 horas antes y puedes hablar y ofrecer pruebas (LGRA, arts. 116 fr. IV y
                  208 fr. IV a VI). Tu identidad sellada solo se abre si tú lo pides, y solo para
                  eso.
                </p>
              </Alert>
            )}
          {view.mode === 'sealed' && procedure.legalStage === 'court_resolution' && (
            <Alert tone="info" title="Puedes apelar como tercera" testId="tracking-third-party">
              <p>
                Si te identificas, puedes apelar la sentencia como tercera en 15 días hábiles desde
                que te la notifiquen, con escrito firmado ante el Tribunal (LGRA, arts. 116 fr. IV,
                215 y 216).
              </p>
            </Alert>
          )}
          {(procedure.remedies ?? []).length > 0 && (
            <section aria-labelledby="remedies-title" data-testid="tracking-remedies">
              <h3 id="remedies-title">Recursos</h3>
              <ul>
                {(procedure.remedies ?? []).map((remedy, index) => (
                  <li key={`${remedy.kind}-${index}`}>
                    <strong>{remedy.name}</strong>, presentado el {formatDayDate(remedy.filedOn)}
                    {remedy.filedBy === 'reporter' ? ' (lo presentaste tú)' : ''}:{' '}
                    {remedy.status === 'resolved'
                      ? `resuelto${remedy.outcomeName === undefined ? '' : `: ${remedy.outcomeName.toLowerCase()}`}`
                      : remedy.resolutionDueOn === undefined
                        ? 'en trámite'
                        : `en trámite; se resuelve a más tardar el ${formatDayDate(remedy.resolutionDueOn)}`}
                    . {remedy.effect}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {procedure.federalFunds !== undefined && (
            <p data-testid="tracking-federal-funds">
              Tu denuncia involucra recursos federales ({procedure.federalFunds.fundingName}):
              además de la autoridad local, pueden intervenir la Auditoría Superior de la
              Federación, la Secretaría Anticorrupción y Buen Gobierno y la Fiscalía Anticorrupción
              de la FGR (Ley de Coordinación Fiscal, art. 49).
            </p>
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
              {procedure.closure.legalOutcomeName !== undefined && (
                <p data-testid="tracking-legal-outcome">
                  <strong>Motivo legal: {procedure.closure.legalOutcomeName}.</strong>{' '}
                  {procedure.closure.legalOutcomeExplanation}
                  {procedure.closure.destination !== undefined &&
                    ` Se remitió a: ${procedure.closure.destination.name}.`}
                </p>
              )}
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
