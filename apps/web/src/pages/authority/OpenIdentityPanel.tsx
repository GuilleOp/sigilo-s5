// Apertura de la identidad sellada 2 de 3 (dirección A: anillo de tres llaves): una persona la
// solicita con su fundamento, otra de la misma autoridad la aprueba con el suyo y, al alcanzar el
// umbral, quien aprobó recibe el sobre y lo abre en este navegador con el contexto recalculado
// desde el detalle vigente. Para el recurso de inconformidad (la persona ya pidió abrirla), la
// entrega del sobre exige dos aprobaciones distintas, al menos una de supervisión (H7).
import { useEffect, useRef, useState } from 'react';
import type { ComplaintDetail, IdentityBlock } from '@sigilo/contracts';
import { Alert } from '../../components/Alert.tsx';
import { SealedRing } from '../../components/a/SealedRing.tsx';
import { StateTag } from '../../components/a/StateTag.tsx';
import { TextAreaField } from '../../components/Field.tsx';
import { openSealedIdentity } from '../../crypto/authority.ts';
import { focusAfterRender } from '../../lib/focus.ts';
import { api } from '../../services/api.ts';
import { describeError } from '../../services/api-client.ts';
import type { AuthoritySession } from './authority-session.ts';

interface OpenIdentityPanelProps {
  session: AuthoritySession;
  /** Detalle vigente: de él se recalcula el contexto (AAD) del sobre. */
  detail: ComplaintDetail;
  onOpened: () => void;
}

const MIN_LEGAL_BASIS = 20;

/** Panel de apertura. */
export function OpenIdentityPanel({ session, detail, onOpened }: OpenIdentityPanelProps) {
  const [legalBasis, setLegalBasis] = useState('');
  const [isAcknowledged, setAcknowledged] = useState(false);
  const [identity, setIdentity] = useState<IdentityBlock | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [isBusy, setBusy] = useState(false);
  const isBusyRef = useRef(false);
  const isMounted = useRef(true);
  const trimmed = legalBasis.trim();

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const accountId = session.account.accountId;
  const allRequests = detail.identityRequests ?? [];
  const appeal = allRequests.find(
    (item) => item.status === 'approved' && item.purpose === 'appeal',
  );
  const requests = allRequests.filter((item) => item.purpose !== 'appeal');
  const pending = requests.find((item) => item.status === 'pending');
  const approved = requests.find(
    (item) =>
      item.status === 'approved' &&
      item.approvals.some((approval) => approval.accountId === accountId),
  );
  const hasApprovedAppeal =
    appeal?.approvals.some((approval) => approval.accountId === accountId) === true;
  const canReleaseAppeal =
    appeal !== undefined && hasApprovedAppeal && appeal.approvals.length >= appeal.threshold;
  const ringUsed = Math.min(
    3,
    appeal?.approvals.length ?? approved?.approvals.length ?? pending?.approvals.length ?? 0,
  );
  const canApprove =
    pending !== undefined &&
    !pending.approvals.some((approval) => approval.accountId === accountId);

  /** Ejecuta una acción con fundamento: solicitar, aprobar o abrir. */
  async function run(action: () => Promise<void>, failureMessage: string): Promise<void> {
    if (isBusyRef.current) return;
    isBusyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (failure) {
      if (isMounted.current) setError(describeError(failure, failureMessage));
    } finally {
      isBusyRef.current = false;
      if (isMounted.current) setBusy(false);
    }
  }

  function hasBasis(): boolean {
    if (trimmed.length >= MIN_LEGAL_BASIS) return true;
    setError(`Escribe el fundamento legal y el motivo (al menos ${MIN_LEGAL_BASIS} caracteres).`);
    return false;
  }

  function approveAppeal(): void {
    if (appeal === undefined || !hasBasis()) return;
    void run(async () => {
      await api.approveIdentityOpening(
        session.token,
        detail.summary.folio,
        appeal.requestId,
        trimmed,
      );
      if (isMounted.current) {
        setNotice(
          'Aprobaste la entrega para el recurso. Hacen falta dos personas distintas, al menos una de supervisión.',
        );
      }
      setLegalBasis('');
      onOpened();
    }, 'No pudimos registrar tu aprobación. Puede que la ventana del recurso ya haya terminado.');
  }

  function submitRequest(): void {
    if (!hasBasis()) return;
    void run(async () => {
      const folio = detail.summary.folio;
      if (pending !== undefined && canApprove) {
        await api.approveIdentityOpening(session.token, folio, pending.requestId, trimmed);
        if (isMounted.current) setNotice('Aprobaste la apertura. Ya puede abrirse.');
      } else {
        await api.requestIdentityOpening(session.token, folio, trimmed);
        if (isMounted.current) {
          setNotice('Solicitud registrada. Falta que otra persona de tu autoridad la apruebe.');
        }
      }
      setLegalBasis('');
      onOpened();
    }, 'No pudimos registrar la solicitud. Inténtalo de nuevo.');
  }

  function open(requestId: string): void {
    void run(async () => {
      const response = await api.releaseIdentityEnvelope(
        session.token,
        detail.summary.folio,
        requestId,
      );
      const opened = await openSealedIdentity(response, detail, session.keys);
      if (!isMounted.current) return;
      setIdentity(opened);
      onOpened();
      // El formulario se reemplaza por la identidad: el foco va a su encabezado.
      focusAfterRender('identity-open-title');
    }, 'No pudimos abrir la identidad. Los datos de la denuncia no coinciden con el sobre sellado o la llave no es la correcta.');
  }

  if (identity !== null) {
    return (
      <section className="card" aria-labelledby="identity-open-title" data-testid="opened-identity">
        <h3 id="identity-open-title" tabIndex={-1}>
          Identidad abierta (solo en este navegador)
        </h3>
        <p className="alert alert--warning" data-testid="identity-unverified">
          Identidad declarada por la persona, no verificada.
        </p>
        <p>
          El sobre abrió con los hechos, las pruebas y las llaves del buzón de esta denuncia: el
          servidor no los cambió desde que la persona la envió.
        </p>
        <dl className="definition-list">
          <dt>Nombre</dt>
          <dd>{identity.fullName}</dd>
          <dt>Contacto</dt>
          <dd>{identity.contact ?? 'No proporcionado'}</dd>
          <dt>Testigos</dt>
          <dd>{identity.witnesses.length === 0 ? 'Ninguno' : identity.witnesses.join('; ')}</dd>
          <dt>Digestos SHA-256 de las pruebas originales</dt>
          <dd className="mono">
            {identity.originalEvidenceSha256.length === 0
              ? 'Ninguno'
              : identity.originalEvidenceSha256.join(' ')}
          </dd>
        </dl>
      </section>
    );
  }

  return (
    <section className="card identity-panel" aria-labelledby="identity-request-title">
      <div className="identity-panel__head">
        <SealedRing used={ringUsed} isOpened={detail.identityOpenedCount > 0} />
        <div>
          <h3 id="identity-request-title">Abrir la identidad sellada</h3>
          <p data-testid="identity-ring-text">
            <StateTag tone={ringUsed >= 2 ? 'warn' : 'protect'}>
              {`${ringUsed} de 3 llaves usadas`}
            </StateTag>{' '}
            Aperturas registradas: {detail.identityOpenedCount}.
          </p>
        </div>
      </div>
      {appeal !== undefined && (
        <div className="identity-panel__appeal" data-testid="identity-appeal">
          <p>
            <strong>Recurso de inconformidad.</strong> La persona pidió abrir su identidad solo para
            el recurso. Para recibir el sobre se necesitan dos aprobaciones de personas distintas de
            tu autoridad, al menos una de supervisión, mientras corre el plazo de la Sala. Cada
            entrega queda en el registro público y la persona la ve.
          </p>
          <p>
            Aprobaciones: {appeal.approvals.length} de {appeal.threshold}.
          </p>
          {canReleaseAppeal ? (
            <button
              type="button"
              className="button button--danger"
              aria-disabled={isBusy ? true : undefined}
              onClick={() => open(appeal.requestId)}
              data-testid="open-appeal-identity"
            >
              {isBusy ? 'Abriendo...' : 'Recibir el sobre para el recurso'}
            </button>
          ) : (
            !hasApprovedAppeal && (
              <>
                <TextAreaField
                  id="appeal-legal-basis"
                  label="Fundamento de tu aprobación"
                  hint={`Al menos ${MIN_LEGAL_BASIS} caracteres. La persona lo leerá tal cual.`}
                  required
                  rows={3}
                  maxLength={1000}
                  value={legalBasis}
                  error={error || undefined}
                  onChange={(event) => setLegalBasis(event.target.value)}
                  data-testid="appeal-legal-basis"
                />
                <button
                  type="button"
                  className="button"
                  aria-disabled={isBusy ? true : undefined}
                  onClick={approveAppeal}
                  data-testid="approve-appeal"
                >
                  Aprobar la entrega para el recurso
                </button>
              </>
            )
          )}
          {hasApprovedAppeal && !canReleaseAppeal && (
            <p>Ya aprobaste. Falta la aprobación de otra persona (al menos una de supervisión).</p>
          )}
        </div>
      )}
      <Alert tone="warning" title="Se necesitan dos personas y la persona denunciante lo verá">
        <p>
          Abrir la identidad requiere la aprobación de dos personas distintas de tu autoridad, cada
          una con su fundamento. La apertura queda en la bitácora pública y la persona denunciante
          la verá en su seguimiento. Revelar sin motivo la identidad de un denunciante puede
          constituir obstrucción de la justicia (artículo 64 de la LGRA).
        </p>
      </Alert>
      {notice && (
        <p role="status" data-testid="identity-request-notice">
          {notice}
        </p>
      )}
      {pending !== undefined && (
        <p data-testid="identity-request-pending">
          Hay una solicitud con {pending.approvals.length} de {pending.threshold} aprobaciones.
          Fundamento: «{pending.legalBasis}».
          {canApprove ? '' : ' Espera la aprobación de otra persona.'}
        </p>
      )}
      {approved !== undefined ? (
        <button
          type="button"
          className="button button--danger"
          aria-disabled={isBusy ? true : undefined}
          onClick={() => open(approved.requestId)}
          data-testid="open-identity"
        >
          {isBusy ? 'Abriendo...' : 'Abrir identidad aprobada'}
        </button>
      ) : (
        (pending === undefined || canApprove) && (
          <>
            <TextAreaField
              id="legal-basis"
              label="Fundamento legal y motivo"
              hint={`Al menos ${MIN_LEGAL_BASIS} caracteres. La persona lo leerá tal cual.`}
              required
              rows={4}
              maxLength={1000}
              value={legalBasis}
              error={error || undefined}
              onChange={(event) => setLegalBasis(event.target.value)}
              data-testid="legal-basis"
            />
            <label className="choice">
              <input
                type="checkbox"
                checked={isAcknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                data-testid="acknowledge-opening"
              />
              <span>
                Entiendo que la apertura queda registrada y que la persona denunciante la verá.
              </span>
            </label>
            <button
              type="button"
              className="button button--danger"
              disabled={!isAcknowledged}
              aria-disabled={isBusy ? true : undefined}
              onClick={submitRequest}
              data-testid="request-identity"
            >
              {canApprove ? 'Aprobar la apertura' : 'Solicitar la apertura'}
            </button>
          </>
        )
      )}
      {error && approved !== undefined && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
