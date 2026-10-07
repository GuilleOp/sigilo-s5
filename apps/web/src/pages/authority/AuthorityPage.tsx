// Pantalla /autoridad: panel de demostración para la autoridad competente.
import { useCallback, useEffect, useState } from 'react';
import type { ComplaintSummary } from '@sigilo/contracts';
import { wipeAuthorityKeys } from '../../crypto/authority.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { api } from '../../services/api.ts';
import { describeError } from '../../services/api-client.ts';
import { AuthorityLogin } from './AuthorityLogin.tsx';
import type { AuthoritySession } from './authority-session.ts';
import { ComplaintDetailView } from './ComplaintDetailView.tsx';
import { ComplaintList } from './ComplaintList.tsx';

/** Panel de autoridad. */
export function AuthorityPage() {
  useDocumentTitle('Panel de autoridad');
  const [session, setSession] = useState<AuthoritySession | null>(null);
  const [complaints, setComplaints] = useState<ComplaintSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback((current: AuthoritySession) => {
    api
      .listComplaints(current.token)
      .then(setComplaints, (failure: unknown) =>
        setError(describeError(failure, 'No se pudo cargar el listado.')),
      );
  }, []);

  useEffect(() => {
    if (session !== null && selected === null) refresh(session);
  }, [session, selected, refresh]);

  useEffect(
    () => () => {
      if (session) wipeAuthorityKeys(session.keys);
    },
    [session],
  );

  return (
    <>
      <h1>Panel de autoridad</h1>
      {session === null ? (
        <AuthorityLogin onReady={setSession} />
      ) : (
        <>
          <div className="actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                setSession(null);
                setSelected(null);
                setComplaints([]);
              }}
              data-testid="authority-logout"
            >
              Cerrar sesión y borrar la llave de la memoria
            </button>
          </div>
          {error && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}
          {selected === null ? (
            <>
              <h2>Denuncias recibidas</h2>
              <ComplaintList complaints={complaints} onOpen={setSelected} />
            </>
          ) : (
            <ComplaintDetailView
              session={session}
              folio={selected}
              onBack={() => setSelected(null)}
            />
          )}
        </>
      )}
    </>
  );
}
