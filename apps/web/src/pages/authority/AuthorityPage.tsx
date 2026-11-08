// Pantalla /autoridad: panel de demostración para la autoridad competente.
import { startTour } from '../../components/GuidedTour.tsx';
import { authorityTour } from '../../lib/tours.ts';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComplaintSummary } from '@sigilo/contracts';
import { wipeAuthorityKeys } from '../../crypto/authority.ts';
import { focusAfterRender } from '../../lib/focus.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { authorityProfileStore } from '../../state/profile.ts';
import { api, AUTHORITY_PAGE_SIZE } from '../../services/api.ts';
import { describeError } from '../../services/api-client.ts';
import { AuthorityLogin } from './AuthorityLogin.tsx';
import type { AuthoritySession } from './authority-session.ts';
import { ComplaintDetailView } from './ComplaintDetailView.tsx';
import { ComplaintList } from './ComplaintList.tsx';
import { EscalationsPanel } from './EscalationsPanel.tsx';
import { SessionGuard } from './SessionGuard.tsx';

/** Encabezado del listado: destino del foco al entrar y al volver del detalle. */
const LIST_TITLE_ID = 'complaint-list-title';

/** Título de la lista según la función de la cuenta, con los nombres de la bandeja del S5. */
const LIST_TITLES = {
  intake: 'Bandeja general de turnado',
  investigation: 'Denuncias asignadas',
  supervision: 'Denuncias de tu institución',
} as const;

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

  // Distintivo de la barra: la función de la cuenta y el nombre de su institución; se borra al
  // cerrar la sesión o salir del panel.
  const account = session?.account ?? null;
  const token = session?.token ?? null;
  useEffect(() => {
    if (account === null || token === null) {
      authorityProfileStore.set(() => null);
      return;
    }
    authorityProfileStore.set(() => ({ role: account.function, authorityName: null }));
    let isActive = true;
    api.listAuthorities(token).then(
      (list) => {
        const name = list.find((item) => item.authorityId === account.authorityId)?.name ?? null;
        if (isActive)
          authorityProfileStore.set((current) => current && { ...current, authorityName: name });
      },
      () => undefined,
    );
    return () => {
      isActive = false;
    };
  }, [account, token]);
  useEffect(() => () => authorityProfileStore.set(() => null), []);

  // Seguridad: las llaves se borran al cambiar de llaves o al salir de la pantalla. Una sesión
  // renovada (nuevo token tras vencer) conserva las mismas llaves y no las borra.
  const keys = session?.keys ?? null;
  useEffect(
    () => () => {
      if (keys !== null) wipeAuthorityKeys(keys);
    },
    [keys],
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
          <SessionGuard session={session} onRenewed={setSession} />
          <div className="actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                // Seguridad: la sesión se invalida también en el servidor.
                void api.logout(session.token).catch(() => undefined);
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
            <button
              type="button"
              id="tour-start-authority"
              className="button button--secondary"
              onClick={() =>
                startTour(authorityTour(session.account.function), 'tour-start-authority')
              }
              data-testid="tour-start-authority"
            >
              Recorrido del panel
            </button>
          </div>
          {error && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}
          {selected === null ? (
            <>
              {session.account.function === 'supervision' && <EscalationsPanel session={session} />}
              <h2 id={LIST_TITLE_ID} tabIndex={-1}>
                {LIST_TITLES[session.account.function]}
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
