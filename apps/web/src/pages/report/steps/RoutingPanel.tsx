// «Tu denuncia llega a»: la autoridad que propone el sistema con el directorio verificado, en una
// frase. El porqué (sencillo y técnico) y la opción de cambiarla quedan a un toque. Con un solo nodo
// dice que llega al buzón general.
import { reportDraftStore } from '../../../state/report-draft.ts';
import { Alert } from '../../../components/Alert.tsx';
import type { DestinationOption } from '../../../network/routing.ts';
import type { ResolvedDestination } from '../destination.ts';

interface RoutingPanelProps {
  destination: ResolvedDestination;
}

const KIND_TEXT: Readonly<Record<DestinationOption['kind'], string>> = {
  proposed: 'Propuesta',
  alternative: 'También competente',
  other: 'Otra del directorio',
};

function choose(authorityId: string): void {
  reportDraftStore.set((draft) => ({ ...draft, destinationAuthorityId: authorityId }));
}

function OptionList({
  options,
  selectedId,
}: {
  options: readonly DestinationOption[];
  selectedId: string | null;
}) {
  const main = options.filter((item) => item.kind !== 'other');
  const others = options.filter((item) => item.kind === 'other');
  const radio = (option: DestinationOption) => (
    <li key={option.authorityId} className="routing-option" data-kind={option.kind}>
      <input
        type="radio"
        id={`destination-${option.authorityId}`}
        name="destination"
        value={option.authorityId}
        checked={selectedId === option.authorityId}
        onChange={() => choose(option.authorityId)}
        data-testid={`destination-${option.authorityId}`}
      />
      <label htmlFor={`destination-${option.authorityId}`}>
        <span className="routing-option__name">{option.name}</span>
        <span className="routing-option__meta">
          {KIND_TEXT[option.kind]} · {option.nodeName}
        </span>
      </label>
    </li>
  );
  return (
    <fieldset className="routing-choice">
      <legend>Elige a quién enviarla</legend>
      <ul className="routing-choice__list">{main.map(radio)}</ul>
      {others.length > 0 && (
        <details className="routing-choice__more">
          <summary>Elegir otra autoridad del directorio</summary>
          <ul className="routing-choice__list">{others.map(radio)}</ul>
        </details>
      )}
    </fieldset>
  );
}

/** Por qué esa autoridad, en una frase sencilla; el detalle técnico queda aparte. */
function plainReason(option: DestinationOption): string {
  return option.kind === 'proposed'
    ? 'Es la que puede investigar la oficina y la conducta que elegiste.'
    : 'La elegiste tú. También puede atender esta denuncia.';
}

/** Panel del destino, antes de enviar. */
export function RoutingPanel({ destination }: RoutingPanelProps) {
  return (
    <section className="card routing" aria-labelledby="routing-title" data-testid="routing-panel">
      <h3 id="routing-title" className="routing__label">
        Tu denuncia llega a
      </h3>
      {destination.kind === 'loading' && <p>Buscando a quién enviarla.</p>}
      {destination.kind === 'single-node' && (
        <>
          <p className="routing__target" data-testid="routing-single-node">
            <strong>El buzón general</strong>, que la envía a la autoridad que puede investigarla.
          </p>
          <details className="more">
            <summary>¿Qué pasa después?</summary>
            <p>
              Ahí la revisan y la <strong>turnan</strong>. Si no es la autoridad correcta, la
              devuelve o la canaliza. Verás cada paso en «Mi denuncia».
            </p>
          </details>
        </>
      )}
      {destination.kind === 'blocked' && (
        <Alert tone="danger" title="Por ahora no podemos enviar" testId="routing-blocked">
          <p>{destination.reason}</p>
        </Alert>
      )}
      {destination.kind === 'needs-choice' && (
        <>
          <Alert tone="warning" title="Elige una autoridad" testId="routing-needs-choice">
            <p>{destination.reason}</p>
          </Alert>
          <OptionList options={destination.choice.options} selectedId={null} />
        </>
      )}
      {destination.kind === 'network' && (
        <>
          <p className="routing__target" data-testid="routing-target">
            <strong>{destination.selected.name}</strong>
          </p>
          <p>Solo esa autoridad puede leerla.</p>
          <details className="more">
            <summary>¿Por qué ahí?</summary>
            <p>{plainReason(destination.selected)}</p>
            <details className="more more--minor">
              <summary>Detalle técnico</summary>
              <ul data-testid="routing-reasons">
                {destination.selected.kind === 'proposed' ? (
                  destination.choice.proposal.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))
                ) : (
                  <li>{destination.selected.reason}</li>
                )}
              </ul>
              <p>
                Se cierra con llave en tu equipo, con la llave de esa autoridad, y la guarda el{' '}
                {destination.selected.nodeName}. Quien la transporta solo ve a quién va dirigida.
              </p>
            </details>
          </details>
          <details className="more">
            <summary>Cambiar a quién va</summary>
            <OptionList
              options={destination.choice.options}
              selectedId={destination.selected.authorityId}
            />
          </details>
        </>
      )}
    </section>
  );
}
