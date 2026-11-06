// Escalamientos que recibe la autoridad supervisora: cada denuncia escalada por una regla pública,
// sin contenido, con la autoridad de origen, el día y las reglas que se cumplieron.
import { useEffect, useState } from 'react';
import type { EscalationSummary } from '@sigilo/contracts';
import { StateTag } from '../../components/a/StateTag.tsx';
import { formatDayDate } from '../../lib/format.ts';
import { api } from '../../services/api.ts';
import { describeError } from '../../services/api-client.ts';
import type { AuthoritySession } from './authority-session.ts';

interface EscalationsPanelProps {
  session: AuthoritySession;
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; items: EscalationSummary[]; names: ReadonlyMap<string, string> }
  | { kind: 'failed'; message: string };

/** Lista de escalamientos para la supervisión. */
export function EscalationsPanel({ session }: EscalationsPanelProps) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  useEffect(() => {
    let isActive = true;
    // El nombre de la autoridad de origen (no su identificador); si la lista falla, el identificador.
    const names = api.listAuthorities(session.token).then(
      (list) => new Map(list.map((item) => [item.authorityId, item.name] as const)),
      () => new Map<string, string>(),
    );
    Promise.all([api.listEscalations(session.token), names]).then(
      ([items, map]) => {
        if (isActive) setState({ kind: 'ready', items, names: map });
      },
      (failure: unknown) => {
        if (isActive) {
          setState({
            kind: 'failed',
            message: describeError(failure, 'No pudimos cargar los escalamientos.'),
          });
        }
      },
    );
    return () => {
      isActive = false;
    };
  }, [session.token]);

  return (
    <section
      className="card escalations"
      aria-labelledby="escalations-title"
      data-testid="escalations"
    >
      <h2 id="escalations-title">Escalamientos que recibiste</h2>
      <p>
        Cada denuncia llegó aquí porque se cumplió una regla pública de escalamiento. La copia que
        envió la persona viene cerrada con tu segunda llave y nunca trae su identidad.
      </p>
      {state.kind === 'loading' && <p>Cargando escalamientos.</p>}
      {state.kind === 'failed' && (
        <p className="field__error" role="alert">
          {state.message}
        </p>
      )}
      {state.kind === 'ready' && state.items.length === 0 && (
        <p data-testid="escalations-empty">Por ahora no hay denuncias escaladas.</p>
      )}
      {state.kind === 'ready' && state.items.length > 0 && (
        <ul className="escalations__list">
          {state.items.map((item) => (
            <li key={item.folio} className="escalations__item" data-testid="escalation-item">
              <p className="escalations__head">
                <span className="mono folio">{item.folio}</span>
                <StateTag tone="warn">{`Escalada el ${formatDayDate(item.escalatedOn)}`}</StateTag>
              </p>
              <p className="source" data-testid="escalation-origin">
                Autoridad de origen: {state.names.get(item.fromAuthorityId) ?? item.fromAuthorityId}
              </p>
              <ul>
                {item.rules.map((rule) => (
                  <li key={`${rule.ruleKey}-${rule.on}`}>
                    <strong>{rule.name}.</strong> {rule.explanation}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
