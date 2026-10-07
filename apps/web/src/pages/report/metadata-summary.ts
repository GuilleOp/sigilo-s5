// Resumen de los metadatos de una foto con las etiquetas en lectura fácil de Huella Cero.
import { IMAGE_METADATA_LABELS } from '@sigilo/huella';
import type { ImageMetadataReport } from '@sigilo/huella';

/** Dato de texto encontrado en la foto: etiqueta y valor. */
export interface MetadataLine {
  field: 'device' | 'capturedAt' | 'software' | 'author';
  label: string;
  value: string;
}

const TEXT_FIELDS = ['device', 'capturedAt', 'software', 'author'] as const;

/** Datos de texto presentes, en el orden en que se muestran (el lugar exacto va aparte). */
export function metadataLines(report: ImageMetadataReport): MetadataLine[] {
  return TEXT_FIELDS.flatMap((field) => {
    const value = report[field];
    return value === undefined ? [] : [{ field, label: IMAGE_METADATA_LABELS[field], value }];
  });
}

/** Cuántos datos ocultos se muestran en el panel (para anunciarlo). */
export function revealedCount(report: ImageMetadataReport): number {
  return (
    (report.gps === undefined ? 0 : 1) + metadataLines(report).length + report.otherFields.length
  );
}
