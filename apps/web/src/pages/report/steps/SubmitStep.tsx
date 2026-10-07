// Paso 5: envío, comprobante verificado, recibo de una sola vez y su confirmación.
import { useState } from 'react';
import { Link } from 'react-router';
import { PATHS } from '../../../app/paths.ts';
import { Alert } from '../../../components/Alert.tsx';
import { ReceiptCard } from '../../../components/ReceiptCard.tsx';
import { ReceiptConfirmation } from '../../../components/ReceiptConfirmation.tsx';
import { KeyMismatchError } from '../../../crypto/key-pinning.ts';
import { formatDayDate } from '../../../lib/format.ts';
import { api } from '../../../services/api.ts';
import { describeError } from '../../../services/api-client.ts';
import { reportDraftStore } from '../../../state/report-draft.ts';
import type { ReportDraft } from '../../../state/report-draft.ts';
import { ReceiptVerificationError, submitReport } from '../submit-report.ts';
import type { SubmittedReport } from '../submit-report.ts';

interface SubmitStepProps {
  draft: ReportDraft;
  onSendingChange: (isSending: boolean) => void;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'sending'; message: string }
  | { kind: 'key-mismatch' }
  | { kind: 'failed'; message: string }
  | { kind: 'receipt'; result: SubmittedReport; isVerified: boolean }
  | { kind: 'done'; folio: string };

/** Envío y entrega del recibo. */
export function SubmitStep({ draft, onSendingChange }: SubmitStepProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  async function send(): Promise<void> {
    onSendingChange(true);
    try {
      const result = await submitReport(draft, api, (message) =>
        setPhase({ kind: 'sending', message }),
      );
      reportDraftStore.reset();
      setPhase({ kind: 'receipt', result, isVerified: true });
    } catch (error) {
      if (error instanceof KeyMismatchError) setPhase({ kind: 'key-mismatch' });
      else if (error instanceof ReceiptVerificationError) {
        reportDraftStore.reset();
        setPhase({
          kind: 'receipt',
          result: { folio: error.folio, words: error.words, receivedOn: '' },
          isVerified: false,
        });
      } else {
        setPhase({
          kind: 'failed',
          message: describeError(error, 'No pudimos enviar tu denuncia. Inténtalo de nuevo.'),
        });
      }
    } finally {
      onSendingChange(false);
    }
  }

  if (phase.kind === 'receipt') {
    const { result } = phase;
    return (
      <>
        {phase.isVerified ? (
          <Alert
            tone="success"
            title="Tu denuncia fue recibida"
            role="status"
            testId="submit-success"
          >
            <p>
              El servidor firmó un comprobante y lo verificamos con su llave fijada en esta
              aplicación. Fecha de recepción: {formatDayDate(result.receivedOn)}.
            </p>
          </Alert>
        ) : (
          <Alert
            tone="danger"
            title="Alerta de seguridad: el comprobante no es válido"
            role="alert"
          >
            <p>
              El servidor respondió, pero su firma no coincide. Guarda tu recibo y verifica tu folio
              en "Dar seguimiento" más tarde.
            </p>
          </Alert>
        )}
        <ReceiptCard folio={result.folio} words={result.words} />
        <ReceiptConfirmation
          words={result.words}
          onConfirmed={() => setPhase({ kind: 'done', folio: result.folio })}
        />
      </>
    );
  }

  if (phase.kind === 'done') {
    return (
      <Alert
        tone="success"
        title="Listo. Ya borramos tu recibo de esta pantalla."
        role="status"
        testId="submit-done"
      >
        <p>
          Folio: <strong className="mono">{phase.folio}</strong>. Para ver el avance o responder a
          la autoridad entra a <Link to={PATHS.tracking}>Dar seguimiento</Link> con tu folio y tus 8
          palabras.
        </p>
      </Alert>
    );
  }

  return (
    <>
      <p>
        Al enviar, tu navegador genera un recibo de 8 palabras y las llaves de tu buzón anónimo.
        {draft.mode === 'sealed' && ' También cifra tu identidad hacia la autoridad competente.'}
      </p>
      {phase.kind === 'key-mismatch' && (
        <Alert
          tone="danger"
          title="Alerta de seguridad: no enviamos nada"
          role="alert"
          testId="key-mismatch"
        >
          <p>
            Las llaves que publica el servidor no coinciden con las de esta aplicación. Alguien
            podría estar interceptando la conexión. No intentes de nuevo desde esta red y avisa a la
            autoridad por otro medio.
          </p>
        </Alert>
      )}
      {phase.kind === 'failed' && (
        <Alert tone="danger" title="No se pudo enviar" role="alert">
          <p>{phase.message}</p>
        </Alert>
      )}
      <p role="status" aria-live="polite" data-testid="submit-progress">
        {phase.kind === 'sending' ? phase.message : ''}
      </p>
      <button
        type="button"
        className="button"
        onClick={() => void send()}
        disabled={phase.kind === 'sending' || phase.kind === 'key-mismatch'}
        data-testid="submit-report"
      >
        {phase.kind === 'sending' ? 'Enviando...' : 'Enviar denuncia'}
      </button>
    </>
  );
}
