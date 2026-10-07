// Panel "Esta foto revela": lo que los metadatos dirían de la persona.
import type { ImageMetadataReport } from '@sigilo/huella';

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
      <p className="alert__title">Esta foto revela:</p>
      <ul>
        {report.gps && (
          <li>
            Dónde se tomó: latitud {report.gps.latitude.toFixed(5)}, longitud{' '}
            {report.gps.longitude.toFixed(5)}
          </li>
        )}
        {report.device && <li>El equipo: {report.device}</li>}
        {report.capturedAt && <li>Cuándo se tomó: {report.capturedAt}</li>}
        {report.software && <li>Programa usado: {report.software}</li>}
        {report.author && <li>Autor: {report.author}</li>}
        {report.otherFields.map((field) => (
          <li key={field}>{field}</li>
        ))}
      </ul>
    </div>
  );
}
