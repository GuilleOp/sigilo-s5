// "Tu nombre": identidad sellada sin aperturas o el detalle de cada apertura.
import type { TrackingView } from '@sigilo/contracts';
import { formatDayDate } from '../../lib/format.ts';

interface IdentityStatusProps {
  view: TrackingView;
}

/** Historial de accesos a la identidad. */
export function IdentityStatus({ view }: IdentityStatusProps) {
  return (
    <section className="card" aria-labelledby="identity-status-title" data-testid="identity-status">
      <h2 id="identity-status-title">Tu nombre</h2>
      {view.mode === 'anonymous' ? (
        <p>
          Tu denuncia es anónima: no diste tu nombre ni otros datos tuyos, así que no hay nada que
          abrir.
        </p>
      ) : view.identityAccess.length === 0 ? (
        <p data-testid="identity-sealed">
          Tu nombre sigue bajo llave. Nadie lo ha abierto. Si la autoridad lo abre, aquí verás la
          fecha y la razón.
        </p>
      ) : (
        <>
          <p className="alert alert--warning" data-testid="identity-opened">
            La autoridad abrió tu nombre{' '}
            {view.identityAccess.length === 1 ? '1 vez' : `${view.identityAccess.length} veces`}.
          </p>
          <ol>
            {view.identityAccess.map((access) => (
              <li key={access.ledgerSeq}>
                <p>
                  <strong>{formatDayDate(access.on)}</strong>. Quedó anotado en el registro público
                  con el número {access.ledgerSeq}.
                </p>
                <p>Fundamento: «{access.legalBasis}»</p>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
