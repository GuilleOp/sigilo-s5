// Pantalla /verificar: descarga la bitácora, verifica la cadena y la cabeza con la llave fijada y,
// si la persona pega un anclaje publicado, comprueba que la bitácora todavía lo contiene.
import { useState } from 'react';
import { Alert } from '../../components/Alert.tsx';
import { TextAreaField } from '../../components/Field.tsx';
import { PINNED_KEYS } from '../../config/pinned-keys.ts';
import { compareWithAnchor, downloadAndVerifyLedger } from '../../crypto/ledger-verification.ts';
import type { AnchorComparison, LedgerVerification } from '../../crypto/ledger-verification.ts';
import { announce } from '../../lib/announce.ts';
import { formatDayDate } from '../../lib/format.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { api } from '../../services/api.ts';
import { describeError } from '../../services/api-client.ts';

const REASONS: Readonly<Record<string, string>> = {
  malformed: 'un registro está mal escrito',
  sequence: 'falta un registro o están desordenados',
  link: 'un registro no está unido al anterior',
  hash: 'alguien cambió el contenido de un registro',
};

/** Frase corta del resultado, para anunciarla al terminar. */
function resultSummary(result: LedgerVerification): string {
  if (result.status === 'valid') return 'La bitácora coincide con el registro firmado.';
  if (result.status === 'broken-chain') return 'Atención: la bitácora fue alterada.';
  return 'Atención: no pudimos comprobar la bitácora.';
}

function anchorSummary(comparison: AnchorComparison): string {
  if (comparison.status === 'matches') return 'La bitácora contiene el anclaje publicado.';
  if (comparison.status === 'invalid') return 'El texto pegado no es un anclaje válido.';
  return 'Atención: la bitácora no coincide con el anclaje publicado.';
}

function Result({ result }: { result: LedgerVerification }) {
  if (result.status === 'valid') {
    return (
      <Alert
        tone="success"
        title="La bitácora coincide con el registro firmado"
        testId="ledger-valid"
      >
        <p>
          Revisamos {result.eventCount} registros. Cada uno está unido al anterior y el último
          coincide con el registro que el sistema firmó el {formatDayDate(result.head.at)}.
        </p>
        <p>
          Esto prueba que lo que descargaste es lo que el sistema firmó. Para saber si lo cambió
          antes de firmarlo, compáralo con un anclaje publicado (abajo).
        </p>
        <p>
          Código de control: <span className="mono">{result.head.hash}</span>
        </p>
      </Alert>
    );
  }
  if (result.status === 'bad-head-signature') {
    return (
      <Alert
        tone="danger"
        title="No pudimos comprobar la firma de la bitácora"
        testId="ledger-invalid"
      >
        <p>El último registro no tiene la firma del sistema que conoce esta aplicación.</p>
      </Alert>
    );
  }
  if (result.status === 'broken-chain') {
    return (
      <Alert tone="danger" title="La bitácora fue alterada" testId="ledger-invalid">
        <p>
          En el registro {result.failedAtSeq} {REASONS[result.reason] ?? 'hay un problema'}.
        </p>
      </Alert>
    );
  }
  return (
    <Alert
      tone="danger"
      title="La bitácora no coincide con el último registro firmado"
      testId="ledger-invalid"
    >
      <p>
        Los {result.eventCount} registros descargados no llegan al último registro, que el sistema
        firmó.
      </p>
    </Alert>
  );
}

function AnchorResult({ comparison }: { comparison: AnchorComparison }) {
  if (comparison.status === 'invalid') {
    return (
      <Alert tone="danger" title="No es un anclaje válido" testId="anchor-invalid">
        <p>
          Pega el contenido completo de un archivo{' '}
          <span className="mono">anchors/AAAA-MM-DD.json</span>.
        </p>
      </Alert>
    );
  }
  if (comparison.status === 'bad-signature') {
    return (
      <Alert tone="danger" title="El anclaje no tiene una firma válida" testId="anchor-mismatch">
        <p>Ese anclaje no lo firmó el sistema que conoce esta aplicación.</p>
      </Alert>
    );
  }
  const { seq, at } = comparison.anchor.head;
  if (comparison.status === 'matches') {
    return (
      <Alert tone="success" title="La bitácora contiene el anclaje" testId="anchor-matches">
        <p>
          El registro {seq}, anclado el {formatDayDate(comparison.anchor.anchoredOn)} (firmado el{' '}
          {formatDayDate(at)}), sigue igual: la bitácora no se reescribió hasta ese registro desde
          que se publicó el anclaje.
        </p>
      </Alert>
    );
  }
  return (
    <Alert tone="danger" title="La bitácora no coincide con el anclaje" testId="anchor-mismatch">
      <p>
        {comparison.status === 'missing'
          ? `La bitácora ya no tiene el registro ${seq} que se ancló.`
          : `El registro ${seq} es distinto del que se ancló.`}{' '}
        Alguien reescribió la bitácora después de publicar el anclaje.
      </p>
    </Alert>
  );
}

/** Verificador de la bitácora pública. */
export function VerifyPage() {
  useDocumentTitle('Verificar bitácora');
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<LedgerVerification | null>(null);
  const [anchorText, setAnchorText] = useState('');
  const [comparison, setComparison] = useState<AnchorComparison | null>(null);
  const [error, setError] = useState('');
  const [isBusy, setBusy] = useState(false);

  async function download(): Promise<LedgerVerification | null> {
    setResult(null);
    setComparison(null);
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
      return outcome;
    } catch (failure) {
      const message = describeError(
        failure,
        'No pudimos descargar la bitácora. Inténtalo de nuevo.',
      );
      setError(message);
      announce(message);
      setProgress('');
      return null;
    }
  }

  async function verify(): Promise<void> {
    if (isBusy) return;
    setBusy(true);
    try {
      const outcome = await download();
      if (outcome !== null) announce(resultSummary(outcome));
    } finally {
      setBusy(false);
    }
  }

  async function compare(): Promise<void> {
    if (isBusy) return;
    setBusy(true);
    try {
      // Se descarga de nuevo para comparar contra la bitácora vigente.
      const outcome = await download();
      if (outcome === null) return;
      if (outcome.status !== 'valid') {
        announce(resultSummary(outcome));
        return;
      }
      const compared = compareWithAnchor(
        outcome.events,
        anchorText,
        PINNED_KEYS.serverSigningPublicKey,
      );
      setComparison(compared);
      announce(anchorSummary(compared));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Verificar la bitácora pública</h1>
      <p>
        Cada denuncia, cambio de estatus, mensaje y apertura de un nombre queda anotado en un
        registro público. Cada registro está unido al anterior y el sistema firma el último. Tu
        equipo puede comprobar que lo que descargas coincide con el registro firmado. El registro no
        tiene folios ni datos personales.
      </p>
      <p>
        Para no revelar a qué hora llega cada denuncia, el registro se publica una vez al día: lo de
        hoy se publica mañana.
      </p>
      {/* aria-disabled: mientras verifica, el botón conserva el foco. */}
      <button
        type="button"
        className="button"
        onClick={() => void verify()}
        aria-disabled={isBusy ? true : undefined}
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

      <section className="card" aria-labelledby="anchor-title">
        <h2 id="anchor-title">Comparar con un anclaje publicado (opcional)</h2>
        <p>
          Cada día se publica fuera del sistema una copia del último registro firmado, en un archivo{' '}
          <span className="mono">anchors/AAAA-MM-DD.json</span>. Si la bitácora todavía contiene ese
          registro, no se reescribió hasta ese punto.
        </p>
        <TextAreaField
          id="anchor-json"
          label="Contenido del anclaje"
          hint="Abre el archivo del anclaje, copia todo su contenido y pégalo aquí."
          rows={6}
          className="mono"
          value={anchorText}
          onChange={(event) => setAnchorText(event.target.value)}
          data-testid="anchor-input"
        />
        <button
          type="button"
          className="button button--secondary"
          onClick={() => void compare()}
          aria-disabled={isBusy ? true : undefined}
          data-testid="compare-anchor"
        >
          Comparar con el anclaje
        </button>
        {comparison !== null && <AnchorResult comparison={comparison} />}
      </section>
    </>
  );
}
