// Resumen del ciclo de vida legal en el panel: abstención, inconformidad (aviso y escrito firmado),
// recursos con su resultado y su efecto, medida cautelar, inscripción de la sanción, si la
// substanciación registra las actuaciones del Tribunal y el historial con cada acto.
import type { ProcedureView } from '@sigilo/contracts';
import { formatDayDate } from '../../lib/format.ts';

interface ProcedureLifecycleProps {
  procedure: ProcedureView;
}

const REMEDY_STATUS: Readonly<Record<'pending' | 'admitted' | 'resolved', string>> = {
  pending: 'pendiente',
  admitted: 'admitido, pendiente de resolver',
  resolved: 'resuelto',
};

const PRECAUTIONARY_NAMES: Readonly<Record<string, string>> = {
  granted: 'concedida',
  provisional: 'concedida provisionalmente',
  denied: 'negada',
};

/** Resumen del ciclo de vida legal. */
export function ProcedureLifecycle({ procedure }: ProcedureLifecycleProps) {
  const remedies = procedure.remedies ?? [];
  const inconformity = procedure.inconformity;
  return (
    <div className="procedure-lifecycle" data-testid="procedure-lifecycle">
      {procedure.courtRecording === true && (
        <p className="field__hint" data-testid="procedure-court-recording">
          Tu estado no dio cuentas al Tribunal en el sistema: la autoridad substanciadora registra
          sus actuaciones («registro de actuación del Tribunal») con el número de expediente.
        </p>
      )}
      {procedure.abstention !== undefined && (
        <div data-testid="procedure-abstention">
          <p>
            <strong>Abstención</strong> ({formatDayDate(procedure.abstention.legalOn)}). Fundamento:
            «{procedure.abstention.legalBasis}»
          </p>
        </div>
      )}
      {inconformity !== undefined && (
        <p data-testid="procedure-inconformity">
          <strong>Inconformidad</strong> contra{' '}
          {inconformity.against === 'abstention' ? 'la abstención' : 'la calificación de no grave'}:{' '}
          {inconformity.signedOn !== undefined
            ? `presentada con firma el ${formatDayDate(inconformity.signedOn)}${inconformity.resolutionDueOn === undefined ? '' : `; la Sala resuelve a más tardar el ${formatDayDate(inconformity.resolutionDueOn)}`}.`
            : inconformity.notice !== undefined
              ? `aviso de la persona el ${formatDayDate(inconformity.notice.legalOn)}; falta el escrito con firma autógrafa${inconformity.filingDueOn === undefined ? '' : `, a más tardar el ${formatDayDate(inconformity.filingDueOn)}`}.`
              : inconformity.filingDueOn !== undefined
                ? `la persona puede presentarla, con escrito firmado, hasta el ${formatDayDate(inconformity.filingDueOn)}.`
                : 'el plazo de 5 días hábiles corre desde que se le notifique por el buzón.'}
        </p>
      )}
      {remedies.length > 0 && (
        <>
          <h4>Recursos</h4>
          <ul data-testid="procedure-remedies">
            {remedies.map((remedy, index) => (
              <li key={`${remedy.kind}-${index}`} data-testid="procedure-remedy">
                <strong>{remedy.name}</strong> ({formatDayDate(remedy.filedOn)}):{' '}
                {REMEDY_STATUS[remedy.status]}
                {remedy.outcomeName !== undefined ? ` · ${remedy.outcomeName}` : ''}
                {remedy.resolutionDueOn !== undefined
                  ? ` · se resuelve a más tardar el ${formatDayDate(remedy.resolutionDueOn)}`
                  : ''}
                . <span className="field__hint">{remedy.effect}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {procedure.precautionary !== undefined && (
        <p data-testid="procedure-precautionary">
          <strong>Medida cautelar</strong> pedida el{' '}
          {formatDayDate(procedure.precautionary.requestedOn)}
          {procedure.precautionary.outcome === undefined
            ? '; pendiente de resolver (vista de 5 días hábiles y resolución en 5 más).'
            : `; ${PRECAUTIONARY_NAMES[procedure.precautionary.outcome] ?? procedure.precautionary.outcome}.`}
        </p>
      )}
      {procedure.sanctionRegistered !== undefined && (
        <p data-testid="procedure-sanction-registered">
          <strong>Sanción inscrita en el S3</strong> el{' '}
          {formatDayDate(procedure.sanctionRegistered.legalOn)} (
          {procedure.sanctionRegistered.registryReference}).
        </p>
      )}
      <details data-testid="procedure-history">
        <summary>Historial del trámite ({procedure.steps.length} actos)</summary>
        <ol>
          {procedure.steps.map((step, index) => (
            <li key={`${step.action}-${index}`} data-testid="procedure-history-step">
              {formatDayDate(step.legalOn)}: {step.title}
              {step.record?.courtFileNumber !== undefined &&
                ` · Expediente del Tribunal ${step.record.courtFileNumber}`}
              {step.record?.legalBasis !== undefined &&
                ` · Fundamento: «${step.record.legalBasis}»`}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
