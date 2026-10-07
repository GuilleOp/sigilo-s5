// "Estado de tu identidad": sellada sin aperturas o el detalle de cada apertura.
import type { TrackingView } from '@sigilo/contracts';
import { formatDayDate } from '../../lib/format.ts';

interface IdentityStatusProps {
  view: TrackingView;
}

/** Historial de accesos a la identidad. */
export function IdentityStatus({ view }: IdentityStatusProps) {
  return (
    <section className="card" aria-labelledby="identity-status-title" data-testid="identity-status">
      <h2 id="identity-status-title">Estado de tu identidad</h2>
      {view.mode === 'anonymous' ? (
        <p>
          Tu denuncia es anónima: no enviaste ningún dato de identidad, así que no hay nada que
          abrir.
        </p>
      ) : view.identityAccess.length === 0 ? (
        <p data-testid="identity-sealed">
          Sellada. Nadie la ha abierto: 0 aperturas. Si la autoridad la abre, aquí verás la fecha y
          el fundamento legal.
        </p>
      ) : (
        <>
          <p className="alert alert--warning" data-testid="identity-opened">
            La autoridad abrió tu identidad{' '}
            {view.identityAccess.length === 1 ? '1 vez' : `${view.identityAccess.length} veces`}.
          </p>
          <ol>
            {view.identityAccess.map((access) => (
              <li key={access.ledgerSeq}>
                <p>
                  <strong>{formatDayDate(access.on)}</strong>, por la autoridad competente (registro{' '}
                  {access.ledgerSeq} de la bitácora pública).
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
