// «¿A quién va tu denuncia?»: la autoridad que propone el sistema con el directorio verificado, por
// qué, y la opción de corregirla. Con un solo nodo explica el buzón general y qué es «turnar».
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

/** Panel del destino, antes de enviar. */
export function RoutingPanel({ destination }: RoutingPanelProps) {
  return (
    <section className="card routing" aria-labelledby="routing-title" data-testid="routing-panel">
      <h3 id="routing-title">¿A quién va tu denuncia?</h3>
      {destination.kind === 'loading' && <p>Buscando el directorio de autoridades.</p>}
      {destination.kind === 'single-node' && (
        <>
          <p data-testid="routing-single-node">
            Tu denuncia llega al <strong>buzón general</strong> de este sistema. Ahí la revisan y la{' '}
            <strong>turnan</strong>: la envían a la autoridad que puede investigarla. Verás cada
            paso en «Dar seguimiento».
          </p>
          <p>Si la autoridad que la recibe no es la correcta, la puede devolver o canalizar.</p>
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
            Va a: <strong>{destination.selected.name}</strong> ({destination.selected.nodeName}).
          </p>
          <details className="routing__why" open>
            <summary>Por qué esta autoridad</summary>
            <ul data-testid="routing-reasons">
              {destination.selected.kind === 'proposed' ? (
                destination.choice.proposal.reasons.map((reason) => <li key={reason}>{reason}</li>)
              ) : (
                <li>{destination.selected.reason}</li>
              )}
            </ul>
          </details>
          <p>
            Tu denuncia se cierra con llave en tu navegador, con la llave de esa autoridad. El
            enrutador de la red solo ve a quién va dirigida, no lo que dice.
          </p>
          <OptionList
            options={destination.choice.options}
            selectedId={destination.selected.authorityId}
          />
        </>
      )}
    </section>
  );
}
