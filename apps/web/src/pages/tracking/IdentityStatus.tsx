// «Tu identidad» (dirección A con el lacre de B): el anillo de tres llaves dice cuántas llaves se
// usaron; el sello de lacre y su libro de aperturas dicen cuándo, quién y para qué se abrió, con las
// entregas del sobre (`identity.released`), contrastadas con la bitácora pública.
import type { TrackingView } from '@sigilo/contracts';
import { TableScroll } from '../../components/TableScroll.tsx';
import { Icon } from '../../components/a/icons.tsx';
import { SealedRing } from '../../components/a/SealedRing.tsx';
import { WaxSeal } from '../../components/a/WaxSeal.tsx';
import { StateTag } from '../../components/a/StateTag.tsx';
import type { IdentityOpeningsCheck } from '../../crypto/tracking.ts';
import { formatDayDate } from '../../lib/format.ts';

interface IdentityStatusProps {
  view: TrackingView;
  /**
   * Contraste con la bitácora pública; `remote` si la denuncia está en otro nodo de la red; `null`
   * en denuncias anónimas.
   */
  openings: IdentityOpeningsCheck | 'checking' | 'remote' | null;
}

function OpeningsAlert({
  openings,
}: {
  openings: IdentityOpeningsCheck | 'checking' | 'remote' | null;
}) {
  if (openings === null || openings === 'checking') return null;
  if (openings === 'remote') {
    return (
      <p data-testid="identity-openings-remote">
        Cada apertura queda anotada en el registro público del nodo que atiende tu denuncia. Puedes
        revisarlo en «Registro público» de ese nodo.
      </p>
    );
  }
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

/** Llaves usadas por la autoridad en la apertura más reciente (0 a 3). */
function usedKeys(view: TrackingView): number {
  const last = view.identityAccess.at(-1);
  if (last === undefined) return 0;
  return Math.min(3, last.approvalCount ?? (last.actorRole === 'reporter' ? 0 : 2));
}

/** Identidad sellada con su anillo y su registro. */
export function IdentityStatus({ view, openings }: IdentityStatusProps) {
  const published =
    openings !== null &&
    openings !== 'checking' &&
    openings !== 'remote' &&
    openings.status === 'consistent'
      ? openings.publishedOpeningIds
      : null;
  if (view.mode === 'anonymous') {
    return (
      <section
        className="card"
        aria-labelledby="identity-status-title"
        data-testid="identity-status"
      >
        <h2 id="identity-status-title">Tu identidad</h2>
        <p>
          Tu denuncia es anónima: no diste tu nombre ni otros datos tuyos, así que no hay nada que
          abrir.
        </p>
      </section>
    );
  }
  const isOpened = view.identityAccess.length > 0;
  const used = usedKeys(view);
  const releases = view.identityReleases ?? [];
  return (
    <section
      className="sealed"
      aria-labelledby="identity-status-title"
      data-testid="identity-status"
      data-opened={isOpened || undefined}
    >
      <SealedRing used={used} isOpened={isOpened} />
      <div className="sealed__summary">
        <h2 id="identity-status-title">Tu identidad</h2>
        {isOpened ? (
          <p data-testid="identity-opened">
            <StateTag tone="warn">
              {`Se abrió ${view.identityAccess.length === 1 ? '1 vez' : `${view.identityAccess.length} veces`}`}
            </StateTag>
          </p>
        ) : (
          <p data-testid="identity-sealed">
            <StateTag tone="protect">Sellada</StateTag> Tu identidad sigue bajo llave. Nadie la ha
            abierto. Si se abre, aquí verás la fecha y la razón.
          </p>
        )}
        <div className="identity-rules" data-testid="identity-rules">
          <p>
            <strong>Quién puede abrir tu identidad.</strong> Solo de dos maneras, y siempre queda
            registrado en el registro público y te avisamos aquí:
          </p>
          <ol>
            <li>
              La autoridad competente, con la aprobación de dos personas distintas (dos de tres
              llaves) y un fundamento legal que tú ves.
            </li>
            <li>
              Tú, si decides inconformarte, porque la ley pide tu nombre y firma para el recurso.
              Solo se abriría para ese recurso.
            </li>
          </ol>
        </div>
      </div>
      <ul className="sealed__keys" aria-label="Llaves de la autoridad">
        {[1, 2, 3].map((key) => (
          <li key={key}>
            <Icon name="key" />
            <span>Llave {key} · persona custodia de la autoridad</span>
            {key <= used ? (
              <StateTag tone="warn">Usada</StateTag>
            ) : (
              <StateTag tone="idle">Sin usar</StateTag>
            )}
          </li>
        ))}
      </ul>
      <div className="sealed__ledger">
        <div className="sealed__ledger-head">
          <WaxSeal isBroken={isOpened} />
          <p>
            <strong>{isOpened ? 'Sello roto' : 'Sello intacto'}.</strong>{' '}
            {isOpened
              ? 'Cada vez que se rompió quedó asentado en el libro de aperturas.'
              : 'Nadie lo ha roto. Si alguien lo rompe, aquí verás quién, cuándo y para qué.'}
          </p>
        </div>
        <TableScroll labelledBy={'identity-book-caption'}>
          <table className="data-table--wide data-table book" data-testid="identity-book">
            <caption id={'identity-book-caption'}>Libro de aperturas</caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Quién</th>
                <th scope="col">Para qué</th>
                <th scope="col">Registro público</th>
              </tr>
            </thead>
            <tbody>
              {!isOpened && (
                <tr>
                  <td colSpan={4} className="book__empty">
                    Sin aperturas.
                  </td>
                </tr>
              )}
              {view.identityAccess.map((access) => (
                <tr key={access.openingId} data-testid="identity-access-entry">
                  <th scope="row">{formatDayDate(access.on)}</th>
                  <td>
                    {access.actorRole === 'reporter'
                      ? 'Tú, para tu recurso'
                      : `La autoridad competente${
                          access.approvalCount === undefined
                            ? ''
                            : `, con ${access.approvalCount === 1 ? '1 aprobación' : `${access.approvalCount} aprobaciones distintas`}`
                        }`}
                  </td>
                  <td>
                    Fundamento: «{access.legalBasis}»
                    {access.actorRole === 'reporter' && (
                      <span className="book__note" data-testid="identity-appeal-opening">
                        Abriste tu identidad para el recurso de inconformidad. Queda registrado
                        quién la abrió, cuándo y para qué.
                      </span>
                    )}
                  </td>
                  <td>
                    {published?.has(access.openingId) === true
                      ? 'Ya aparece en el registro público.'
                      : 'Pendiente de publicar en el registro público: se publica cuando termina el día.'}
                  </td>
                </tr>
              ))}
              {releases.map((release, index) => (
                <tr key={`${release.openingId}-${index}`} data-testid="identity-release-entry">
                  <th scope="row">{formatDayDate(release.on)}</th>
                  <td>Una persona de la autoridad</td>
                  <td>Recibió el sobre de tu identidad.</td>
                  <td>Queda en el registro público.</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </div>
      <OpeningsAlert openings={openings} />
    </section>
  );
}
