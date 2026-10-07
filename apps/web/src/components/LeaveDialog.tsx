// Diálogo propio para confirmar la salida de una pantalla con algo que no se puede recuperar.
// Usa <dialog> nativo: el navegador atrapa el foco, cierra con Esc y lo devuelve al enlace.
import { useEffect, useRef } from 'react';

interface LeaveDialogProps {
  /** Texto del aviso; `null` cierra el diálogo. */
  message: string | null;
  onStay: () => void;
  onLeave: () => void;
}

/** Diálogo modal "¿Seguro que quieres salir?". */
export function LeaveDialog({ message, onStay, onLeave }: LeaveDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (message !== null && !dialog.open) dialog.showModal();
    if (message === null && dialog.open) dialog.close();
  }, [message]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="leave-dialog-title"
      aria-describedby="leave-dialog-text"
      onClose={onStay}
      data-testid="leave-dialog"
    >
      <h2 id="leave-dialog-title">¿Ya anotaste tus 8 palabras?</h2>
      <p id="leave-dialog-text">{message}</p>
      <div className="actions">
        {/* Seguridad: la opción por omisión es quedarse, para no perder el recibo por error. */}
        <button type="button" className="button" onClick={onStay} autoFocus>
          Quedarme aquí
        </button>
        <button
          type="button"
          className="button button--secondary"
          onClick={onLeave}
          data-testid="leave-confirm"
        >
          Salir sin anotarlas
        </button>
      </div>
    </dialog>
  );
}
