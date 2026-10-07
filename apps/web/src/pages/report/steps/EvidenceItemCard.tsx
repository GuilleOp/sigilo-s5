// Tarjeta de una prueba: estado, metadatos, botón de limpieza y vista de antes y después.
import { focusAfterRender } from '../../../lib/focus.ts';
import { removeEvidence } from '../../../state/report-draft.ts';
import type { EvidenceItem } from '../../../state/report-draft.ts';
import { cleanEvidence } from '../evidence-processing.ts';
import { MetadataPanel } from './MetadataPanel.tsx';

interface EvidenceItemCardProps {
  item: EvidenceItem;
  /** Destino del foco al quitar esta prueba: la siguiente tarjeta o el campo de archivo. */
  nextFocusId: () => string;
}

const STATUS_TEXT: Readonly<Record<EvidenceItem['status'], string>> = {
  inspecting: 'Revisando el archivo en tu equipo.',
  'needs-cleaning': 'Falta limpiarla.',
  cleaning: 'Limpiando en tu equipo.',
  clean: 'Lista: se enviará solo la copia limpia.',
  error: 'No podemos usar esta prueba.',
};

/** Identificador del título de la tarjeta (destino del foco). */
export function evidenceTitleId(id: string): string {
  return `evidence-${id}-title`;
}

/** Muestra una prueba y sus acciones. */
export function EvidenceItemCard({ item, nextFocusId }: EvidenceItemCardProps) {
  const isPdf = item.kind === 'pdf';
  const titleId = evidenceTitleId(item.id);
  const isCleaning = item.status === 'cleaning';
  return (
    <li className="card" data-testid="evidence-item" data-status={item.status}>
      <h3 id={titleId} tabIndex={-1}>
        {item.fileName}
      </h3>
      <p>{STATUS_TEXT[item.status]}</p>
      {item.status === 'error' && <p className="field__error">{item.error}</p>}
      {item.metadata && item.status !== 'clean' && <MetadataPanel report={item.metadata} />}
      {isPdf && item.status === 'needs-cleaning' && (
        <p>
          Convertiremos cada hoja en una foto. Así borramos el nombre de quien lo hizo y otros datos
          escondidos.
        </p>
      )}
      {item.status === 'clean' && (
        <>
          {item.cleanVerified && (
            <p className="alert alert--success" data-testid="clean-verified">
              Revisado: la copia limpia ya no tiene datos escondidos.
            </p>
          )}
          <div className="compare">
            {item.originalUrl && (
              <figure>
                <img src={item.originalUrl} alt={`Original de ${item.fileName}`} />
                <figcaption>Antes: original (no se envía)</figcaption>
              </figure>
            )}
            {item.clean.map((image, index) => (
              <figure key={image.id}>
                <img
                  src={image.url}
                  alt={
                    isPdf
                      ? `Página ${index + 1} convertida en imagen`
                      : `Copia limpia de ${item.fileName}`
                  }
                />
                <figcaption>
                  {isPdf ? `Página ${index + 1} (se envía)` : 'Después: copia limpia (se envía)'}
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      )}
      <div className="actions">
        {item.status === 'needs-cleaning' && (
          <button
            type="button"
            className="button"
            onClick={() => {
              // El botón desaparece mientras se limpia: el foco queda en el título de la tarjeta.
              focusAfterRender(titleId);
              void cleanEvidence(item.id);
            }}
            data-testid="clean-evidence"
          >
            {isPdf ? 'Convertir a imágenes' : 'Limpiar foto'}
          </button>
        )}
        <button
          type="button"
          className="button button--secondary"
          aria-disabled={isCleaning ? true : undefined}
          onClick={() => {
            if (isCleaning) return;
            const target = nextFocusId();
            removeEvidence(item.id);
            focusAfterRender(target);
          }}
          data-testid="remove-evidence"
        >
          Quitar
        </button>
      </div>
    </li>
  );
}
