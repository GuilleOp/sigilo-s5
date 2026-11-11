// Escalamientos que recibe la autoridad supervisora, agrupados por regla pública (la explicación
// una sola vez), de la regla más grave a la menos grave y, dentro de cada una, de la denuncia que
// lleva más tiempo a la más reciente. Cada denuncia escalada se abre con la segunda llave; los
// avisos (turnado vencido) no traen sobre.
import { useEffect, useState } from 'react';
import type { EscalationSummary } from '@sigilo/contracts';
import { StateTag } from '../../components/a/StateTag.tsx';
import { wipeSupervisorKey } from '../../crypto/escalation.ts';
import type { SupervisorKey } from '../../crypto/escalation.ts';
import { groupEscalations } from '../../lib/escalation-groups.ts';
import type { EscalationGroupEntry } from '../../lib/escalation-groups.ts';
import { focusAfterRender } from '../../lib/focus.ts';
import { formatDayDate } from '../../lib/format.ts';
import { api } from '../../services/api.ts';
import { describeError } from '../../services/api-client.ts';
import type { AuthoritySession } from './authority-session.ts';
import { EscalationOpener } from './EscalationOpener.tsx';

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
  const [open, setOpen] = useState<EscalationGroupEntry | null>(null);
  const [supervisorKey, setSupervisorKey] = useState<SupervisorKey | null>(null);

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

  // Seguridad: la segunda llave se borra de la memoria al cambiarla o al salir del panel.
  useEffect(
    () => () => {
      if (supervisorKey !== null) wipeSupervisorKey(supervisorKey);
    },
    [supervisorKey],
  );

  const nameOf = (authorityId: string) =>
    state.kind === 'ready' ? (state.names.get(authorityId) ?? authorityId) : authorityId;

  if (open !== null) {
    return (
      <EscalationOpener
        session={session}
        entry={open}
        originName={nameOf(open.fromAuthorityId)}
        supervisorKey={supervisorKey}
        onSupervisorKey={setSupervisorKey}
        onClose={() => {
          const folio = open.folio;
          setOpen(null);
          focusAfterRender(() =>
            document.querySelector<HTMLElement>(`[data-open-folio="${folio}"]`),
          );
        }}
      />
    );
  }

  const groups = state.kind === 'ready' ? groupEscalations(state.items) : [];
  return (
    <section
      className="card escalations"
      aria-labelledby="escalations-title"
      data-testid="escalations"
    >
      <h2 id="escalations-title">Escalamientos que recibiste</h2>
      <p>
        Cada denuncia llegó aquí porque se cumplió una regla pública. Las escaladas traen una copia
        que la persona cerró con tu segunda llave, sin su identidad: ábrela con «Abrir». Los avisos
        no traen copia; la denuncia sigue con su autoridad.
      </p>
      {state.kind === 'loading' && <p>Cargando escalamientos.</p>}
      {state.kind === 'failed' && (
        <p className="field__error" role="alert">
          {state.message}
        </p>
      )}
      {state.kind === 'ready' && groups.length === 0 && (
        <p data-testid="escalations-empty">Por ahora no hay denuncias escaladas.</p>
      )}
      {groups.map((group) => (
        <section
          key={group.ruleKey}
          className="escalations__group"
          aria-labelledby={`escalation-rule-${group.ruleKey}`}
          data-testid="escalation-group"
        >
          <h3 id={`escalation-rule-${group.ruleKey}`} className="escalations__head">
            {group.name}{' '}
            <StateTag tone={group.effect === 'escalate' ? 'warn' : 'info'}>
              {group.effect === 'escalate' ? 'Escalamiento' : 'Aviso, sin copia'}
            </StateTag>
          </h3>
          <p>{group.explanation}</p>
          <ul className="escalations__list">
            {group.entries.map((entry) => (
              <li key={entry.folio} className="escalations__item" data-testid="escalation-item">
                <p className="escalations__head">
                  <span className="mono folio">{entry.folio}</span>
                  <span>Desde el {formatDayDate(entry.on)}</span>
                </p>
                <p className="source" data-testid="escalation-origin">
                  Autoridad de origen: {nameOf(entry.fromAuthorityId)}
                </p>
                {entry.otherRules.length > 0 && (
                  <p className="field__hint">También: {entry.otherRules.join('; ')}.</p>
                )}
                {entry.isEscalated ? (
                  <button
                    type="button"
                    className="button button--secondary"
                    data-open-folio={entry.folio}
                    aria-label={`Abrir la denuncia ${entry.folio}`}
                    onClick={() => {
                      setOpen(entry);
                      focusAfterRender('escalation-opener-title');
                    }}
                    data-testid="escalation-open"
                  >
                    Abrir
                  </button>
                ) : (
                  <p className="field__hint">
                    Sin copia para abrir: pide a {nameOf(entry.fromAuthorityId)} que la turne o la
                    acepte.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
