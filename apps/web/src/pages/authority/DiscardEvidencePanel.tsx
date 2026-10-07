// Descarte de las pruebas de una denuncia (por ejemplo, spam): confirmación explícita y aviso de
// que la persona denunciante y la bitácora pública lo verán.
import { useEffect, useId, useRef, useState } from 'react';
import { Alert } from '../../components/Alert.tsx';
import { focusAfterRender } from '../../lib/focus.ts';
import { api } from '../../services/api.ts';
import { describeError } from '../../services/api-client.ts';

interface DiscardEvidencePanelProps {
  token: string;
  folio: string;
  /** Pruebas cuyo archivo sigue guardado. */
  storedCount: number;
  onDiscarded: () => void;
}

function evidenceCountText(count: number): string {
  return count === 1 ? '1 prueba' : `${count} pruebas`;
}

/** Panel «Descartar pruebas» con casilla de confirmación. */
export function DiscardEvidencePanel({
  token,
  folio,
  storedCount,
  onDiscarded,
}: DiscardEvidencePanelProps) {
  const [isConfirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [isBusy, setBusy] = useState(false);
  /** Seguridad: evita dos peticiones si se pulsa dos veces antes de que React pinte. */
  const isBusyRef = useRef(false);
  const isMounted = useRef(true);
  const warningId = useId();

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  async function discard(): Promise<void> {
    if (isBusyRef.current || !isConfirmed) return;
    isBusyRef.current = true;
    setBusy(true);
    try {
      const { discarded } = await api.discardEvidence(token, folio);
      if (!isMounted.current) return;
      setMessage(`Se descartaron ${evidenceCountText(discarded)}.`);
      setConfirmed(false);
      onDiscarded();
      // El botón desaparece al recargar el detalle: el foco va al encabezado del panel.
      focusAfterRender('discard-evidence-title');
    } catch (failure) {
      if (isMounted.current) {
        setMessage(describeError(failure, 'No pudimos descartar las pruebas. Inténtalo de nuevo.'));
      }
    } finally {
      isBusyRef.current = false;
      if (isMounted.current) setBusy(false);
    }
  }

  // El panel sigue montado tras descartar y el aviso de estado ocupa siempre el mismo lugar, para
  // que los lectores de pantalla lo anuncien.
  return (
    <section className="card" aria-labelledby="discard-evidence-title">
      <h3 id="discard-evidence-title" tabIndex={-1}>
        Descartar pruebas
      </h3>
      {storedCount === 0 ? (
        <p>Esta denuncia ya no tiene archivos de pruebas guardados.</p>
      ) : (
        <>
          <div id={warningId}>
            <Alert tone="warning" title="No se puede deshacer">
              <p>
                Se borrarán los archivos de {evidenceCountText(storedCount)} de esta denuncia y se
                liberará su espacio. Úsalo solo con envíos sin valor, como spam. La persona
                denunciante verá en su seguimiento cuántas pruebas descartaste y en qué fecha, y el
                descarte queda en la bitácora pública.
              </p>
            </Alert>
          </div>
          <label className="choice">
            <input
              type="checkbox"
              checked={isConfirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              aria-describedby={warningId}
              data-testid="confirm-discard-evidence"
            />
            <span>Entiendo que los archivos se borran para siempre y que la persona lo verá.</span>
          </label>
          <button
            type="button"
            className="button button--danger"
            disabled={!isConfirmed}
            aria-disabled={isBusy ? true : undefined}
            onClick={() => void discard()}
            data-testid="discard-evidence"
          >
            {isBusy ? 'Descartando...' : 'Descartar pruebas'}
          </button>
        </>
      )}
      <p role="status" aria-live="polite" data-testid="discard-evidence-status">
        {message}
      </p>
    </section>
  );
}
