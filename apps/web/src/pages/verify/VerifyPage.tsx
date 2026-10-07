// Pantalla /verificar: descarga la bitácora, verifica la cadena y la cabeza con la llave fijada.
import { useState } from 'react';
import { Alert } from '../../components/Alert.tsx';
import { PINNED_KEYS } from '../../config/pinned-keys.ts';
import { downloadAndVerifyLedger } from '../../crypto/ledger-verification.ts';
import type { LedgerVerification } from '../../crypto/ledger-verification.ts';
import { formatDayDate } from '../../lib/format.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { api } from '../../services/api.ts';
import { describeError } from '../../services/api-client.ts';

const REASONS: Readonly<Record<string, string>> = {
  malformed: 'un registro tiene un formato inválido',
  sequence: 'falta un registro o están desordenados',
  link: 'un registro no apunta al anterior',
  hash: 'el contenido de un registro fue modificado',
};

function Result({ result }: { result: LedgerVerification }) {
  if (result.status === 'valid') {
    return (
      <Alert tone="success" title="La bitácora está íntegra" role="status" testId="ledger-valid">
        <p>
          Revisamos {result.eventCount} registros: cada uno está encadenado con el anterior y el
          último coincide con la cabeza firmada por el servidor el {formatDayDate(result.head.at)}.
          Nadie la ha alterado desde entonces.
        </p>
        <p className="mono">Cabeza: {result.head.hash}</p>
      </Alert>
    );
  }
  if (result.status === 'bad-head-signature') {
    return (
      <Alert
        tone="danger"
        title="La firma de la bitácora no es válida"
        role="alert"
        testId="ledger-invalid"
      >
        <p>La cabeza no está firmada con la llave del servidor fijada en esta aplicación.</p>
      </Alert>
    );
  }
  if (result.status === 'broken-chain') {
    return (
      <Alert tone="danger" title="La bitácora fue alterada" role="alert" testId="ledger-invalid">
        <p>
          En el registro {result.failedAtSeq} {REASONS[result.reason] ?? 'hay un problema'}.
        </p>
      </Alert>
    );
  }
  return (
    <Alert
      tone="danger"
      title="La bitácora no coincide con su cabeza firmada"
      role="alert"
      testId="ledger-invalid"
    >
      <p>
        Los {result.eventCount} registros descargados no terminan en la cabeza que firmó el
        servidor.
      </p>
    </Alert>
  );
}

/** Verificador de la bitácora pública. */
export function VerifyPage() {
  useDocumentTitle('Verificar bitácora');
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<LedgerVerification | null>(null);
  const [error, setError] = useState('');
  const [isBusy, setBusy] = useState(false);

  async function verify(): Promise<void> {
    setBusy(true);
    setResult(null);
    setError('');
    setProgress('Descargando la bitácora.');
    try {
      const outcome = await downloadAndVerifyLedger(
        () => api.getLedgerHead(),
        (from, limit) => api.getLedgerEvents(from, limit),
        PINNED_KEYS.serverSigningPublicKey,
        (count) => setProgress(`Registros descargados: ${count}.`),
      );
      setResult(outcome);
      setProgress('');
    } catch (failure) {
      setError(describeError(failure, 'No se pudo descargar la bitácora.'));
      setProgress('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Verificar la bitácora pública</h1>
      <p>
        Cada denuncia, cambio de estatus, mensaje y apertura de identidad queda registrado en una
        cadena en la que cada registro depende del anterior. El servidor firma el último. Tu
        navegador puede comprobar que nadie borró ni cambió nada. La bitácora no contiene folios ni
        datos personales.
      </p>
      <button
        type="button"
        className="button"
        onClick={() => void verify()}
        disabled={isBusy}
        data-testid="verify-ledger"
      >
        {isBusy ? 'Verificando...' : 'Verificar ahora'}
      </button>
      <p role="status" aria-live="polite">
        {progress}
      </p>
      {error && (
        <Alert tone="danger" title="Error" role="alert">
          <p>{error}</p>
        </Alert>
      )}
      {result !== null && <Result result={result} />}
    </>
  );
}
