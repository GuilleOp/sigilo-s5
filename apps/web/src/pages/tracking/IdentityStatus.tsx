// "Tu nombre": identidad sellada sin aperturas o el detalle de cada apertura, contrastado con la
// bitácora pública por la etiqueta del recibo.
import type { TrackingView } from '@sigilo/contracts';
import type { IdentityOpeningsCheck } from '../../crypto/tracking.ts';
import { formatDayDate } from '../../lib/format.ts';

interface IdentityStatusProps {
  view: TrackingView;
  /** Contraste con la bitácora pública; `null` en denuncias anónimas. */
  openings: IdentityOpeningsCheck | 'checking' | null;
}

function OpeningsAlert({ openings }: { openings: IdentityOpeningsCheck | 'checking' | null }) {
  if (openings === null || openings === 'checking') return null;
  if (openings.status === 'hidden') {
    return (
      <p className="alert alert--danger" data-testid="identity-openings-hidden">
        Atención: el registro público tiene{' '}
        {openings.hiddenCount === 1 ? '1 apertura' : `${openings.hiddenCount} aperturas`} de tu
        nombre que el sistema no te mostró aquí. Guarda tu folio y busca apoyo.
      </p>
    );
  }
  if (openings.status === 'unpublished') {
    return (
      <p className="alert alert--danger" data-testid="identity-openings-unpublished">
        Atención: una apertura de tu nombre ya debía aparecer en el registro público y no está.
      </p>
    );
  }
  if (openings.status === 'unknown') {
    return (
      <p data-testid="identity-openings-unknown">
        Por ahora no pudimos revisar las aperturas en el registro público.
      </p>
    );
  }
  return null;
}

/** Historial de accesos a la identidad. */
export function IdentityStatus({ view, openings }: IdentityStatusProps) {
  const published =
    openings !== null && openings !== 'checking' && openings.status === 'consistent'
      ? openings.publishedOpeningIds
      : null;
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
              <li key={access.openingId} data-testid="identity-access-entry">
                <p>
                  <strong>{formatDayDate(access.on)}</strong>.{' '}
                  {published?.has(access.openingId) === true
                    ? 'Ya aparece en el registro público.'
                    : 'Pendiente de publicar en el registro público: se publica cuando termina el día.'}
                </p>
                <p>Fundamento: «{access.legalBasis}»</p>
              </li>
            ))}
          </ol>
        </>
      )}
      <OpeningsAlert openings={openings} />
    </section>
  );
}
