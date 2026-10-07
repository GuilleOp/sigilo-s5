// Tarjeta de una prueba: estado, metadatos, botón de limpieza y vista de antes y después.
import { removeEvidence } from '../../../state/report-draft.ts';
import type { EvidenceItem } from '../../../state/report-draft.ts';
import { cleanEvidence } from '../evidence-processing.ts';
import { MetadataPanel } from './MetadataPanel.tsx';

interface EvidenceItemCardProps {
  item: EvidenceItem;
}

const STATUS_TEXT: Readonly<Record<EvidenceItem['status'], string>> = {
  inspecting: 'Revisando el archivo en tu equipo.',
  'needs-cleaning': 'Pendiente de limpiar.',
  cleaning: 'Limpiando en tu equipo.',
  clean: 'Lista: se enviará solo la copia limpia.',
  error: 'No se pudo procesar.',
};

/** Muestra una prueba y sus acciones. */
export function EvidenceItemCard({ item }: EvidenceItemCardProps) {
  const isPdf = item.kind === 'pdf';
  return (
    <li className="card" data-testid="evidence-item" data-status={item.status}>
      <h3>{item.fileName}</h3>
      <p role="status">{STATUS_TEXT[item.status]}</p>
      {item.status === 'error' && <p className="field__error">{item.error}</p>}
      {item.metadata && item.status !== 'clean' && <MetadataPanel report={item.metadata} />}
      {isPdf && item.status === 'needs-cleaning' && (
        <p>
          Convertiremos cada página en imagen. Se pierde el texto seleccionable, pero se borran
          autores, capas ocultas, adjuntos y marcas del documento.
        </p>
      )}
      {item.status === 'clean' && (
        <>
          {item.cleanVerified && (
            <p className="alert alert--success" data-testid="clean-verified">
              Comprobado: la copia limpia no tiene metadatos.
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
            onClick={() => void cleanEvidence(item.id)}
            data-testid="clean-evidence"
          >
            {isPdf ? 'Convertir a imágenes' : 'Limpiar foto'}
          </button>
        )}
        <button
          type="button"
          className="button button--secondary"
          onClick={() => removeEvidence(item.id)}
          disabled={item.status === 'cleaning'}
        >
          Quitar
        </button>
      </div>
    </li>
  );
}
