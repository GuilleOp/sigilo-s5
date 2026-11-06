// Paso 5: envío, comprobante verificado, recibo de una sola vez y su confirmación. Al cambiar de
// fase el foco va al encabezado del resultado; mientras envía, el botón no pierde el foco.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { PATHS } from '../../../app/paths.ts';
import { Alert } from '../../../components/Alert.tsx';
import { ReceiptCard } from '../../../components/ReceiptCard.tsx';
import { ReceiptConfirmation } from '../../../components/ReceiptConfirmation.tsx';
import { KeyMismatchError } from '../../../crypto/key-pinning.ts';
import { focusAfterRender } from '../../../lib/focus.ts';
import { formatDayDate } from '../../../lib/format.ts';
import { setNavigationWarning } from '../../../lib/navigation-guard.ts';
import { api } from '../../../services/api.ts';
import { describeError } from '../../../services/api-client.ts';
import { useMemoryStore } from '../../../state/memory-store.ts';
import { reportDraftStore } from '../../../state/report-draft.ts';
import { usageModesStore } from '../../../state/usage-modes.ts';
import type { ReportDraft } from '../../../state/report-draft.ts';
import { evaluatorKeyFromDirectory } from '@sigilo/corroboracion';
import { identifierFromDraft } from '../../../corroboration/blind-corroboration.ts';
import { workerCorroborationRunner } from '../../../corroboration/corroboration-runner.ts';
import { destinationFor, keysForDestination } from '../../../network/network-keys.ts';
import { createRelayApi, sameOriginRelaySender } from '../../../network/relay-api.ts';
import type { ResolvedDestination } from '../destination.ts';
import {
  ReceiptVerificationError,
  SubmissionBlockedError,
  submitReport,
} from '../submit-report.ts';
import type { NetworkSubmission, SubmittedReport } from '../submit-report.ts';

interface SubmitStepProps {
  draft: ReportDraft;
  destination: ResolvedDestination;
  onSendingChange: (isSending: boolean) => void;
}

/**
 * Envío por la red hacia la autoridad elegida, con la corroboración ciega si la persona la pidió y
 * el directorio publica el evaluador; `undefined` con un solo nodo.
 */
function networkSubmissionFor(
  draft: ReportDraft,
  destination: ResolvedDestination,
): NetworkSubmission | undefined {
  if (destination.kind !== 'network') return undefined;
  const target = destinationFor(destination.directory, destination.selected.authorityId);
  const key = evaluatorKeyFromDirectory(destination.directory);
  const checked = identifierFromDraft(draft.corroboration, draft.facts.entityId);
  const identifier = checked !== null && 'identifier' in checked ? checked.identifier : null;
  return {
    api: createRelayApi(
      { authorityId: target.authority.id, node: target.node },
      sameOriginRelaySender(),
    ),
    keys: keysForDestination(target),
    authorityName: target.authority.name,
    nodeName: target.node.name,
    ...(key === null || identifier === null
      ? {}
      : {
          corroborate: (narrative: string) => workerCorroborationRunner(identifier, key, narrative),
        }),
  };
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'sending'; message: string }
  | { kind: 'key-mismatch' }
  | { kind: 'failed'; message: string }
  | { kind: 'receipt'; result: SubmittedReport; isVerified: boolean }
  | { kind: 'done'; folio: string };

/** Encabezado del resultado: recibe el foco al pasar a `receipt` y a `done`. */
const RESULT_TITLE_ID = 'submit-result-title';

const LEAVE_WARNING =
  'Si sales ahora, ya no podrás ver tus 8 palabras. Sin ellas no podrás dar seguimiento a tu denuncia.';

/** Solo se envía con un destino resuelto: un nodo o una autoridad del directorio verificado. */
function canSend(destination: ResolvedDestination): boolean {
  return destination.kind === 'single-node' || destination.kind === 'network';
}

/** Envío y entrega del recibo. */
export function SubmitStep({ draft, destination, onSendingChange }: SubmitStepProps) {
  const modes = useMemoryStore(usageModesStore);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const isSending = useRef(false);

  useEffect(() => {
    if (phase.kind === 'receipt' || phase.kind === 'done') return focusAfterRender(RESULT_TITLE_ID);
  }, [phase.kind]);

  // Seguridad: mientras el recibo no esté confirmado, el menú interno pregunta antes de salir.
  useEffect(() => {
    if (phase.kind === 'receipt') return setNavigationWarning(LEAVE_WARNING);
  }, [phase.kind]);

  async function send(): Promise<void> {
    if (isSending.current || phase.kind === 'key-mismatch' || !canSend(destination)) return;
    isSending.current = true;
    onSendingChange(true);
    try {
      const network = networkSubmissionFor(draft, destination);
      const result = await submitReport(
        draft,
        api,
        (message) => setPhase({ kind: 'sending', message }),
        network === undefined ? {} : { network },
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
      } else if (error instanceof SubmissionBlockedError) {
        setPhase({ kind: 'failed', message: error.message });
      } else {
        setPhase({
          kind: 'failed',
          message: describeError(error, 'No pudimos enviar tu denuncia. Inténtalo de nuevo.'),
        });
      }
    } finally {
      isSending.current = false;
      onSendingChange(false);
    }
  }

  if (phase.kind === 'receipt') {
    const { result } = phase;
    return (
      <>
        <h3 id={RESULT_TITLE_ID} tabIndex={-1}>
          {phase.isVerified
            ? 'Tu denuncia fue recibida'
            : 'Tu denuncia fue enviada, pero no pudimos comprobarla'}
        </h3>
        {phase.isVerified ? (
          <Alert tone="success" title="Llegó completa" testId="submit-success">
            <p>
              Comprobamos que tu denuncia llegó completa. Fecha: {formatDayDate(result.receivedOn)}.
            </p>
          </Alert>
        ) : (
          <Alert
            tone="danger"
            title="Atención: no pudimos comprobar que tu denuncia llegó bien"
            testId="submit-unverified"
          >
            <p>Guarda tu recibo. Más tarde entra a «Dar seguimiento» para revisar.</p>
          </Alert>
        )}
        {result.destination !== undefined && (
          <p data-testid="submit-destination">
            Llegó a <strong>{result.destination.authorityName}</strong> (
            {result.destination.nodeName}). Viajó cerrada con llave: nadie en medio pudo leerla.
          </p>
        )}
        {result.corroboration === 'sent' && (
          <p data-testid="submit-corroboration">
            Comparamos tu dato sin revelarlo. Si otras personas denunciaron lo mismo por separado,
            la autoridad lo verá como una coincidencia, sin saber quiénes son.
          </p>
        )}
        {result.corroboration === 'failed' && (
          <p data-testid="submit-corroboration-failed">
            No pudimos hacer la comparación con otras denuncias. Tu denuncia se envió igual.
          </p>
        )}
        {modes.isAssisted && (
          <Alert tone="warning" title="Antes de ver tus palabras" testId="assisted-receipt">
            <p>
              Pide a la persona que te ayuda que se aparte de la pantalla. Tus 8 palabras son solo
              para ti: con ellas cualquiera podría leer los mensajes de tu denuncia.
            </p>
          </Alert>
        )}
        {modes.isKiosk && (
          <Alert tone="info" title="Estás en un equipo compartido" testId="kiosk-receipt">
            <p>
              Anota tus palabras en papel. Al terminar, pulsa «Terminar y borrar todo» para que la
              siguiente persona no vea nada.
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
      <>
        <h3 id={RESULT_TITLE_ID} tabIndex={-1}>
          Tu denuncia fue recibida
        </h3>
        <Alert
          tone="success"
          title="Listo. Ya borramos tu recibo de esta pantalla."
          testId="submit-done"
        >
          <p>
            Folio: <strong className="mono folio">{phase.folio}</strong>. Para ver cómo va tu
            denuncia o responder a la autoridad, entra a{' '}
            <Link to={PATHS.tracking}>Dar seguimiento</Link> con tu folio y tus 8 palabras.
          </p>
        </Alert>
      </>
    );
  }

  const isBlocked =
    phase.kind === 'sending' || phase.kind === 'key-mismatch' || !canSend(destination);
  return (
    <>
      {destination.kind === 'network' && (
        <p data-testid="submit-target">
          Se enviará a <strong>{destination.selected.name}</strong> ({destination.selected.nodeName}
          ). Puedes cambiarla en el paso anterior.
        </p>
      )}
      {(destination.kind === 'blocked' || destination.kind === 'needs-choice') && (
        <Alert tone="danger" title="Todavía no podemos enviar" testId="submit-routing-blocked">
          <p>{destination.reason}</p>
        </Alert>
      )}
      <p>
        Al enviar, te daremos 8 palabras. Con ellas y tu folio podrás ver cómo va tu denuncia y leer
        mensajes.
        {draft.mode === 'sealed' &&
          ' También guardaremos tu nombre bajo llave: solo se abre con dos aprobaciones de la autoridad competente, o si tú decides inconformarte.'}
      </p>
      {phase.kind === 'key-mismatch' && (
        <Alert
          tone="danger"
          title="Por seguridad no enviamos nada"
          role="alert"
          testId="key-mismatch"
        >
          <p>
            Alguien podría estar espiando esta conexión. No lo intentes desde esta red. Usa otra
            conexión, por ejemplo los datos de tu celular.
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
      {/* aria-disabled en lugar de disabled: un botón deshabilitado pierde el foco. */}
      <button
        type="button"
        className="button"
        onClick={() => void send()}
        aria-disabled={isBlocked ? true : undefined}
        data-testid="submit-report"
      >
        {phase.kind === 'sending' ? 'Enviando...' : 'Enviar denuncia'}
      </button>
    </>
  );
}
