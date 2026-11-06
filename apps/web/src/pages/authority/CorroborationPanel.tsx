// Corroboración ciega para la autoridad: cuántas personas independientes denuncian lo mismo, si el
// grupo parece una campaña y si llegó un posible nuevo indicio con la denuncia archivada.
import type { CorroborationView } from '@sigilo/contracts';
import { Alert } from '../../components/Alert.tsx';
import { formatDayDate } from '../../lib/format.ts';

interface CorroborationPanelProps {
  corroboration: CorroborationView;
}

/** Panel de corroboración. */
export function CorroborationPanel({ corroboration }: CorroborationPanelProps) {
  const isCorroborated = corroboration.sources === 'two_or_more';
  return (
    <section
      className="card corroboration-view"
      aria-labelledby="corroboration-view-title"
      data-testid="corroboration-panel"
    >
      <h3 id="corroboration-view-title">Corroboración ciega</h3>
      <p data-testid="corroboration-sources">
        <strong>{isCorroborated ? '2 o más personas independientes' : '1 persona'}</strong>{' '}
        {isCorroborated
          ? 'denuncian lo mismo (incluida esta denuncia).'
          : 'por ahora: solo esta denuncia.'}{' '}
        El sistema muestra intervalos, no conteos exactos.
      </p>
      <p>
        Son señales de independencia (otra entrada a la red, otro día, otro texto), no pruebas de
        identidad. Nadie sabe quién corrobora ni el dato comparado.
      </p>
      {corroboration.isPossibleCampaign && (
        <Alert tone="warning" title="Posible campaña coordinada" testId="corroboration-campaign">
          <p>
            Varias denuncias parecidas llegaron en poco tiempo: cuentan como una sola fuente para la
            prioridad. No significa que sean falsas (presunción de buena fe).
          </p>
        </Alert>
      )}
      {corroboration.newIndicationOn !== undefined && (
        <Alert tone="warning" title="Posible nuevo indicio" testId="corroboration-new-indication">
          <p>
            El {formatDayDate(corroboration.newIndicationOn)} llegó otra denuncia independiente
            sobre lo mismo mientras esta estaba archivada. Puede justificar la reapertura (LGRA,
            art. 100).
          </p>
        </Alert>
      )}
      <p className="source">Último aviso del índice: {formatDayDate(corroboration.updatedOn)}.</p>
    </section>
  );
}
