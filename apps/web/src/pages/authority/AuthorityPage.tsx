// Pantalla /autoridad: panel de demostración para la autoridad competente.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComplaintSummary } from '@sigilo/contracts';
import { wipeAuthorityKeys } from '../../crypto/authority.ts';
import { focusAfterRender } from '../../lib/focus.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { api, AUTHORITY_PAGE_SIZE } from '../../services/api.ts';
import { describeError } from '../../services/api-client.ts';
import { AuthorityLogin } from './AuthorityLogin.tsx';
import type { AuthoritySession } from './authority-session.ts';
import { ComplaintDetailView } from './ComplaintDetailView.tsx';
import { ComplaintList } from './ComplaintList.tsx';

/** Encabezado del listado: destino del foco al entrar y al volver del detalle. */
const LIST_TITLE_ID = 'complaint-list-title';

/** Panel de autoridad. */
export function AuthorityPage() {
  useDocumentTitle('Panel de autoridad');
  const [session, setSession] = useState<AuthoritySession | null>(null);
  const [complaints, setComplaints] = useState<ComplaintSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setLoadingMore] = useState(false);
  /** Sesión vigente: una respuesta de otra sesión (o tras cerrar la sesión) se ignora. */
  const activeSession = useRef<AuthoritySession | null>(null);

  useEffect(() => {
    activeSession.current = session;
  }, [session]);

  // Al volver al listado se recarga la primera página; las demás se piden con «Mostrar más».
  const refresh = useCallback((current: AuthoritySession) => {
    api.listComplaints(current.token, 0, AUTHORITY_PAGE_SIZE).then(
      (list) => {
        if (activeSession.current !== current) return;
        setComplaints(list);
        setHasMore(list.length === AUTHORITY_PAGE_SIZE);
        setError('');
      },
      (failure: unknown) => {
        if (activeSession.current !== current) return;
        setError(describeError(failure, 'No pudimos cargar el listado. Inténtalo de nuevo.'));
      },
    );
  }, []);

  function loadMore(current: AuthoritySession): void {
    setLoadingMore(true);
    api.listComplaints(current.token, complaints.length, AUTHORITY_PAGE_SIZE).then(
      (list) => {
        if (activeSession.current !== current) return;
        // Si llegó una denuncia nueva entretanto, la página puede repetir un folio.
        setComplaints((shown) => {
          const known = new Set(shown.map((item) => item.folio));
          return [...shown, ...list.filter((item) => !known.has(item.folio))];
        });
        setHasMore(list.length === AUTHORITY_PAGE_SIZE);
        setLoadingMore(false);
      },
      (failure: unknown) => {
        if (activeSession.current !== current) return;
        setLoadingMore(false);
        setError(describeError(failure, 'No pudimos cargar más denuncias. Inténtalo de nuevo.'));
      },
    );
  }

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
        <AuthorityLogin
          onReady={(ready) => {
            setSession(ready);
            focusAfterRender(LIST_TITLE_ID);
          }}
        />
      ) : (
        <>
          <div className="actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                activeSession.current = null;
                setSession(null);
                setSelected(null);
                setComplaints([]);
                setHasMore(false);
                setError('');
                focusAfterRender(() => document.querySelector<HTMLElement>('#contenido h1'));
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
              <h2 id={LIST_TITLE_ID} tabIndex={-1}>
                Denuncias recibidas
              </h2>
              <ComplaintList
                complaints={complaints}
                onOpen={(folio) => {
                  setSelected(folio);
                  focusAfterRender('detail-title');
                }}
              />
              {hasMore && (
                <div className="actions">
                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={isLoadingMore}
                    onClick={() => loadMore(session)}
                    data-testid="load-more-complaints"
                  >
                    {isLoadingMore ? 'Cargando más denuncias…' : 'Mostrar más denuncias'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <ComplaintDetailView
              session={session}
              folio={selected}
              onBack={() => {
                setSelected(null);
                focusAfterRender(LIST_TITLE_ID);
              }}
            />
          )}
        </>
      )}
    </>
  );
}
