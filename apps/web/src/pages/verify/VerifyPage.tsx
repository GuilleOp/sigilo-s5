// Pantalla /verificar: descarga la bitácora, verifica la cadena y la cabeza con la llave fijada y,
// si la persona pega uno o varios anclajes publicados, comprueba que la bitácora todavía los
// contiene todos.
import { useState } from 'react';
import { Link } from 'react-router';
import type { LedgerEvent } from '@sigilo/contracts';
import { PATHS } from '../../app/paths.ts';
import { Alert } from '../../components/Alert.tsx';
import { AnchorsField } from '../../components/AnchorsField.tsx';
import { PINNED_KEYS } from '../../config/pinned-keys.ts';
import { compareWithAnchors, downloadAndVerifyLedger } from '../../crypto/ledger-verification.ts';
import type {
  AnchorComparison,
  AnchorsComparison,
  LedgerVerification,
} from '../../crypto/ledger-verification.ts';
import { announce } from '../../lib/announce.ts';
import { formatDayDate } from '../../lib/format.ts';
import { summarizeLedger } from '../../lib/ledger-summary.ts';
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

function anchorSummary(comparison: AnchorsComparison): string {
  if (comparison.status === 'invalid') return 'El texto pegado no es un anclaje válido.';
  const failed = comparison.results.filter((result) => result.status !== 'matches').length;
  const total = comparison.results.length;
  if (failed === 0) {
    return total === 1
      ? 'La bitácora contiene el anclaje publicado.'
      : `La bitácora contiene los ${total} anclajes publicados.`;
  }
  return `Atención: la bitácora no coincide con ${failed} de ${total} anclajes publicados.`;
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

/**
 * Cifras de la bitácora que el navegador acaba de verificar: no son números que el sistema afirma,
 * sino conteos de los registros firmados que descargó esta pantalla.
 */
function LedgerFigures({ events }: { events: readonly LedgerEvent[] }) {
  const summary = summarizeLedger(events);
  return (
    <section className="card" aria-labelledby="figures-title" data-testid="ledger-figures">
      <h2 id="figures-title">Lo que dice la bitácora que acabas de comprobar</h2>
      <p>
        Estas cifras no te las da el sistema: las contó tu equipo con los registros firmados que
        descargó. Son las de este nodo; cada nodo de la red publica su propia bitácora.
      </p>
      <dl className="ledger-figures">
        <div>
          <dt>Denuncias recibidas</dt>
          <dd data-testid="figure-complaints">{summary.complaints}</dd>
        </div>
        <div>
          <dt>
            Aperturas de un nombre sellado (incluye las que pidió la propia persona para su
            inconformidad)
          </dt>
          <dd data-testid="figure-opened">{summary.identitiesOpened}</dd>
        </div>
        <div>
          <dt>Entregas del sobre con el nombre a una persona de la autoridad</dt>
          <dd data-testid="figure-released">{summary.identitiesReleased}</dd>
        </div>
      </dl>
      <p>
        Las denuncias anónimas no tienen nombre que abrir. Cada apertura que pasa por el sistema
        deja un registro aquí. Quien robara la llave de la autoridad y una copia de la base podría
        abrir un nombre sin dejar registro; por eso la llave no vive en el servidor y se piden dos
        aprobaciones. Con tu folio y tus 8 palabras, en <Link to={PATHS.tracking}>Mi denuncia</Link>{' '}
        puedes comprobar si abrieron el tuyo.
      </p>
    </section>
  );
}

function AnchorResult({ comparison }: { comparison: AnchorComparison }) {
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

function AnchorsResult({ comparison }: { comparison: AnchorsComparison }) {
  if (comparison.status === 'invalid') {
    return (
      <Alert tone="danger" title="No es un anclaje válido" testId="anchor-invalid">
        <p>
          Pega el contenido completo de uno o varios archivos{' '}
          <span className="mono">anchors/AAAA-MM-DD.json</span>, uno tras otro.
        </p>
      </Alert>
    );
  }
  const count = comparison.results.length;
  return (
    <div data-testid="anchor-results">
      <p>Comparamos la bitácora con {count === 1 ? '1 anclaje' : `${count} anclajes`}.</p>
      {comparison.results.map((item) => (
        <AnchorResult
          key={`${item.anchor.anchoredOn}-${item.anchor.head.seq}-${item.anchor.head.hash}`}
          comparison={item}
        />
      ))}
    </div>
  );
}

/** Verificador de la bitácora pública. */
export function VerifyPage() {
  useDocumentTitle('Registro público');
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<LedgerVerification | null>(null);
  const [anchorText, setAnchorText] = useState('');
  const [comparison, setComparison] = useState<AnchorsComparison | null>(null);
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

  /**
   * Descarga y verifica la bitácora y, si hay anclajes pegados, la compara automáticamente con
   * todos. Se descarga cada vez para comparar contra la bitácora vigente.
   */
  async function verify(): Promise<void> {
    if (isBusy) return;
    setBusy(true);
    try {
      const outcome = await download();
      if (outcome === null) return;
      if (outcome.status !== 'valid' || anchorText.trim() === '') {
        announce(resultSummary(outcome));
        return;
      }
      const compared = compareWithAnchors(
        outcome.events,
        anchorText,
        PINNED_KEYS.serverSigningPublicKey,
      );
      setComparison(compared);
      announce(`${resultSummary(outcome)} ${anchorSummary(compared)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Comprueba el registro público</h1>
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
      {result?.status === 'valid' && <LedgerFigures events={result.events} />}

      <section className="card" aria-labelledby="anchor-title">
        <h2 id="anchor-title">Comparar con anclajes publicados (opcional)</h2>
        <p>
          Cada día se publica fuera del sistema una copia del último registro firmado, en un archivo{' '}
          <span className="mono">anchors/AAAA-MM-DD.json</span>. Si la bitácora todavía contiene
          esos registros, no se reescribió hasta ese punto. Si pegas anclajes, al verificar los
          comparamos todos.
        </p>
        <AnchorsField
          id="anchor-json"
          value={anchorText}
          onChange={setAnchorText}
          testId="anchor-input"
        />
        <button
          type="button"
          className="button button--secondary"
          onClick={() => void verify()}
          aria-disabled={isBusy ? true : undefined}
          data-testid="compare-anchor"
        >
          Comparar con los anclajes
        </button>
        {comparison !== null && <AnchorsResult comparison={comparison} />}
      </section>
    </>
  );
}
