// Punto de entrada público de Huella Cero: limpieza de pruebas, marcas invisibles y revisión de riesgo.
// Las funciones de canvas y pdf.js solo funcionan en el navegador.

export { findInvisibleCharacters, stripInvisibleCharacters } from './invisible-characters.ts';
export type {
  InvisibleCharacter,
  InvisibleCharacterKind,
  InvisibleCharacterReport,
} from './invisible-characters.ts';

export { reviewText } from './text-review.ts';
export type { TextFinding, TextFindingKind, TextFindingSeverity } from './text-review.ts';

export { classifyFile, DEFAULT_MAX_FILE_BYTES } from './file-policy.ts';
export type { FileClassification, FileDescriptor, FilePolicyOptions } from './file-policy.ts';

export { inspectImageMetadata } from './image-metadata.ts';
export type { ImageMetadataReport } from './image-metadata.ts';

export {
  DEFAULT_JPEG_QUALITY,
  DEFAULT_MAX_IMAGE_DIMENSION,
  sanitizeImage,
} from './image-sanitize.ts';
export type { SanitizedImage, SanitizeImageOptions } from './image-sanitize.ts';

export {
  DEFAULT_MAX_PDF_PAGES,
  DEFAULT_PDF_QUALITY,
  DEFAULT_PDF_SCALE,
  MAX_PAGE_DIMENSION,
  rasterizePdf,
} from './pdf-rasterize.ts';
export type { RasterizePdfOptions } from './pdf-rasterize.ts';

export { digestBlob } from './digest.ts';

export {
  assessRisk,
  CAP_TEXT_HIGH,
  CAP_TEXT_LOW,
  CAP_TEXT_MEDIUM,
  THRESHOLD_HIGH,
  THRESHOLD_MEDIUM,
  WEIGHT_INVISIBLE_CHARACTERS,
  WEIGHT_MUNICIPALITY,
  WEIGHT_TEXT_HIGH,
  WEIGHT_TEXT_LOW,
  WEIGHT_TEXT_MEDIUM,
  WEIGHT_UNSANITIZED_DEVICE,
  WEIGHT_UNSANITIZED_GPS,
  WEIGHT_UNSANITIZED_OTHER,
  WEIGHT_WORK_HOURS,
} from './risk.ts';
export type { EvidenceSignal, RiskAssessment, RiskReason, RiskSignals } from './risk.ts';
