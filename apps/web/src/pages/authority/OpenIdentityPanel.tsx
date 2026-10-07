// Apertura de la identidad sellada: fundamento obligatorio y aviso de que la persona lo verá. El
// sobre se abre con el contexto recalculado desde el detalle vigente.
import { useEffect, useRef, useState } from 'react';
import type { ComplaintDetail, IdentityBlock } from '@sigilo/contracts';
import { Alert } from '../../components/Alert.tsx';
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

  async function open(): Promise<void> {
    if (isBusyRef.current) return;
    if (trimmed.length < MIN_LEGAL_BASIS) {
      setError(`Escribe el fundamento legal y el motivo (al menos ${MIN_LEGAL_BASIS} caracteres).`);
      return;
    }
    isBusyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await api.openIdentity(session.token, detail.summary.folio, trimmed);
      const opened = await openSealedIdentity(response, detail, session.keys);
      if (!isMounted.current) return;
      setIdentity(opened);
      onOpened();
      // El formulario se reemplaza por la identidad: el foco va a su encabezado.
      focusAfterRender('identity-open-title');
    } catch (failure) {
      if (isMounted.current) {
        setError(
          describeError(
            failure,
            'No pudimos abrir la identidad. Los datos de la denuncia no coinciden con el sobre sellado o la llave no es la correcta.',
          ),
        );
      }
    } finally {
      isBusyRef.current = false;
      if (isMounted.current) setBusy(false);
    }
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
    <section className="card" aria-labelledby="identity-request-title">
      <h3 id="identity-request-title">Abrir la identidad sellada</h3>
      <Alert tone="warning" title="La persona denunciante verá esta apertura">
        <p>
          La apertura queda en la bitácora pública con su fecha. El fundamento queda registrado y la
          persona denunciante lo verá en su seguimiento. Revelar sin motivo la identidad de un
          denunciante puede constituir obstrucción de la justicia (artículo 64 de la LGRA).
        </p>
      </Alert>
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
        <span>Entiendo que la apertura queda registrada y que la persona denunciante la verá.</span>
      </label>
      <button
        type="button"
        className="button button--danger"
        disabled={!isAcknowledged}
        aria-disabled={isBusy ? true : undefined}
        onClick={() => void open()}
        data-testid="open-identity"
      >
        {isBusy ? 'Abriendo...' : 'Abrir identidad'}
      </button>
    </section>
  );
}
