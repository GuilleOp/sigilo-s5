// Panel "Esta foto revela": lo que los metadatos dirían de la persona, con las etiquetas en lectura
// fácil de Huella Cero. El lugar exacto va primero; las cifras quedan en un desplegable.
import { IMAGE_METADATA_LABELS } from '@sigilo/huella';
import type { ImageMetadataReport } from '@sigilo/huella';
import { metadataLines } from '../metadata-summary.ts';

interface MetadataPanelProps {
  report: ImageMetadataReport;
}

/** Lista legible de los metadatos encontrados. */
export function MetadataPanel({ report }: MetadataPanelProps) {
  if (!report.hasAnyMetadata) {
    return <p>No encontramos datos ocultos en esta foto. De todos modos la limpiaremos.</p>;
  }
  return (
    <div className="alert alert--warning" data-testid="metadata-panel">
      <h4 className="alert__title">Esta foto revela:</h4>
      <ul>
        {report.gps && (
          <li>
            <strong>{IMAGE_METADATA_LABELS.gps}.</strong>
            <details className="metadata-figures">
              <summary>Ver las coordenadas</summary>
              <p>
                latitud {report.gps.latitude.toFixed(5)}, longitud {report.gps.longitude.toFixed(5)}
              </p>
            </details>
          </li>
        )}
        {metadataLines(report).map((line) => (
          <li key={line.field}>
            {line.label}: {line.value}
          </li>
        ))}
        {report.otherFields.map((field) => (
          <li key={field}>{field}</li>
        ))}
      </ul>
    </div>
  );
}
