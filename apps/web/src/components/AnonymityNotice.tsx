// Aviso del grupo de anonimato (dirección A): cuántas personas comparten tu ente o tu área (en
// rangos), dibujado como constelación (tu grupo frente a un grupo amplio), qué tan fácil sería
// reconocerte por el relato y qué puedes hacer. Nivel siempre en texto e ícono, no solo color.
import { ANONYMITY_RISK_LABELS, formatSpanishDate } from '@sigilo/anonimato';
import type { AnonymityRisk, BucketLabel, SuggestedActionKind } from '@sigilo/anonimato';
import type { AnonymityStatus } from '../anonymity/use-anonymity-check.ts';
import { SmallCrowd, WideCrowd } from './a/CrowdConstellation.tsx';
import { StateTag } from './a/StateTag.tsx';
import type { StateTone } from './a/StateTag.tsx';

interface AnonymityNoticeProps {
  status: AnonymityStatus;
  /** Lleva a la descripción para generalizar el relato. */
  onGeneralize: () => void;
}

const ACTION_HINTS: Readonly<Record<SuggestedActionKind, string>> = {
  'generalize-narrative': '',
  'defer-submission':
    'Puedes guardar tus notas fuera de este sistema y enviar más tarde, cuando el hecho sea menos reciente o más personas lo conozcan.',
  'consider-custody':
    'La custodia (que el sistema guarde tu denuncia cerrada y la entregue después) todavía no está disponible en este prototipo.',
};

const RISK_TONES: Readonly<Record<AnonymityRisk, StateTone>> = {
  high: 'bad',
  medium: 'warn',
  low: 'ok',
  unknown: 'nocov',
};

const BUCKET_TEXT: Readonly<Record<BucketLabel, string>> = {
  '1-4': 'Menos de 5 personas',
  '5-9': 'Entre 5 y 9 personas',
  '10-49': 'Entre 10 y 49 personas',
  '50+': '50 personas o más',
};

/** Aviso del grupo de anonimato con sus acciones. */
export function AnonymityNotice({ status, onGeneralize }: AnonymityNoticeProps) {
  if (status.kind === 'not-applicable') return null;
  const risk = status.kind === 'assessed' ? status.assessment.risk : 'unknown';
  return (
    <section
      className="anonymity"
      aria-labelledby="anonymity-title"
      data-testid="anonymity-notice"
      data-risk={risk}
    >
      <h3 id="anonymity-title" className="anonymity__title">
        {status.kind === 'assessed' ? status.assessment.title : '¿Cuántas personas podrían ser tú?'}
      </h3>
      {status.kind === 'checking' && (
        <p>Revisando cuántas personas comparten tu lugar de trabajo.</p>
      )}
      {(status.kind === 'other-state' || status.kind === 'failed') && <p>{status.message}</p>}
      {status.kind === 'assessed' && (
        <>
          <p className="anonymity__level" data-testid="anonymity-level">
            <StateTag tone={RISK_TONES[risk]}>
              {`Riesgo de que el relato te identifique: ${ANONYMITY_RISK_LABELS[risk]}`}
            </StateTag>
          </p>
          <div className="crowd-pair">
            <figure className="crowd-panel">
              <SmallCrowd bucket={status.assessment.bucket} />
              <figcaption>
                <span className="crowd-panel__title">
                  {status.assessment.groupName === null
                    ? 'Tu grupo'
                    : `Tu grupo: ${status.assessment.groupName}`}
                </span>
                <StateTag tone={RISK_TONES[risk]}>
                  {status.assessment.bucket === null
                    ? 'Tamaño desconocido'
                    : BUCKET_TEXT[status.assessment.bucket]}
                </StateTag>
                <span className="crowd-panel__text">
                  El punto turquesa eres tú. Con pocas personas alrededor, un detalle del relato te
                  distingue.
                </span>
              </figcaption>
            </figure>
            <figure className="crowd-panel crowd-panel--goal">
              <WideCrowd />
              <figcaption>
                <span className="crowd-panel__title">Si el relato no deja ver tu área</span>
                <StateTag tone="ok">Muchas más personas</StateTag>
                <span className="crowd-panel__text">
                  Tu punto sigue ahí, pero ya cuesta encontrarlo entre todo el ente.
                </span>
              </figcaption>
            </figure>
          </div>
          <ul>
            {status.assessment.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          {status.assessment.actions.length > 0 && (
            <>
              <p>
                <strong>Qué puedes hacer:</strong>
              </p>
              <ul className="anonymity__actions">
                {status.assessment.actions.map((action) => (
                  <li key={action.kind}>
                    {action.kind === 'generalize-narrative' ? (
                      <button
                        type="button"
                        className="button"
                        onClick={onGeneralize}
                        data-testid="anonymity-generalize"
                      >
                        {action.text}
                      </button>
                    ) : (
                      <>
                        {action.text} {ACTION_HINTS[action.kind]}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="anonymity__source">
            Lo calculamos en tu navegador con datos públicos agregados
            {status.assessment.cutoffDate === null
              ? ''
              : ` (corte: ${formatSpanishDate(status.assessment.cutoffDate)})`}
            . Es aproximado. No enviamos tu oficina ni tu área a nadie.
          </p>
        </>
      )}
    </section>
  );
}
