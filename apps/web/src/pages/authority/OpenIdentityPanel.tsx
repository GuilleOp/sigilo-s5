// Apertura de la identidad sellada: fundamento obligatorio y aviso de que la persona lo verá.
import { useState } from 'react';
import type { IdentityBlock } from '@sigilo/contracts';
import { Alert } from '../../components/Alert.tsx';
import { TextAreaField } from '../../components/Field.tsx';
import { openSealedIdentity } from '../../crypto/authority.ts';
import { api } from '../../services/api.ts';
import { describeError } from '../../services/api-client.ts';
import type { AuthoritySession } from './authority-session.ts';

interface OpenIdentityPanelProps {
  session: AuthoritySession;
  folio: string;
  onOpened: () => void;
}

const MIN_LEGAL_BASIS = 20;

/** Panel de apertura. */
export function OpenIdentityPanel({ session, folio, onOpened }: OpenIdentityPanelProps) {
  const [legalBasis, setLegalBasis] = useState('');
  const [isAcknowledged, setAcknowledged] = useState(false);
  const [identity, setIdentity] = useState<IdentityBlock | null>(null);
  const [error, setError] = useState('');
  const [isBusy, setBusy] = useState(false);
  const trimmed = legalBasis.trim();

  async function open(): Promise<void> {
    if (trimmed.length < MIN_LEGAL_BASIS) {
      setError(`Escribe el fundamento legal y el motivo (al menos ${MIN_LEGAL_BASIS} caracteres).`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await api.openIdentity(session.token, folio, trimmed);
      setIdentity(await openSealedIdentity(response, session.keys));
      onOpened();
    } catch (failure) {
      setError(describeError(failure, 'No se pudo abrir la identidad.'));
    } finally {
      setBusy(false);
    }
  }

  if (identity !== null) {
    return (
      <section className="card" aria-labelledby="identity-open-title" data-testid="opened-identity">
        <h3 id="identity-open-title">Identidad abierta (solo en este navegador)</h3>
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
      <h3 id="identity-request-title">Abrir identidad</h3>
      <Alert tone="warning" title="La persona denunciante verá esta apertura">
        <p>
          La apertura queda en la bitácora pública con fecha y fundamento, y aparece en el
          seguimiento de la persona. Revelar sin motivo la identidad de un denunciante puede
          constituir obstrucción de la justicia (artículo 64 de la LGRA).
        </p>
      </Alert>
      <TextAreaField
        id="legal-basis"
        label="Fundamento legal y motivo"
        hint={`Obligatorio, al menos ${MIN_LEGAL_BASIS} caracteres. La persona lo leerá tal cual.`}
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
        disabled={!isAcknowledged || isBusy}
        onClick={() => void open()}
        data-testid="open-identity"
      >
        {isBusy ? 'Abriendo...' : 'Abrir identidad'}
      </button>
    </section>
  );
}
