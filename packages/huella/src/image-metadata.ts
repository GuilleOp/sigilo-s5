// Inspección de metadatos de una imagen (EXIF, GPS, XMP, IPTC, ICC, miniaturas) con exifr.
// Sirve para mostrar a la persona qué datos la delatarían antes de limpiar la foto.

import exifr from 'exifr';

/** Reporte de metadatos. Los textos están listos para mostrarse en español. */
export interface ImageMetadataReport {
  hasAnyMetadata: boolean;
  gps?: { latitude: number; longitude: number };
  device?: string;
  capturedAt?: string;
  software?: string;
  author?: string;
  /** Etiquetas en español de otros datos presentes (por ejemplo, «Miniatura incrustada»). */
  otherFields: string[];
}

/** Opciones de `inspectImageMetadata`. */
export interface InspectImageMetadataOptions {
  /**
   * Incluir el perfil de color ICC. Por defecto, `true`. Se desactiva al comprobar una copia
   * limpia: el codificador del lienzo (Chromium) agrega su propio perfil sRGB genérico, que no
   * proviene del original ni identifica a nadie.
   */
  includeColorProfile?: boolean;
}

type Block = Record<string, unknown>;

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

// Campos que, además de los principales, pueden identificar a la persona o a su equipo.
const NOTABLE_FIELDS: readonly { block: string; keys: readonly string[]; label: string }[] = [
  {
    block: 'exif',
    keys: ['BodySerialNumber', 'SerialNumber'],
    label: 'Número de serie de la cámara',
  },
  { block: 'exif', keys: ['LensModel', 'LensMake', 'LensSerialNumber'], label: 'Datos del lente' },
  { block: 'exif', keys: ['CameraOwnerName'], label: 'Nombre del propietario de la cámara' },
  { block: 'exif', keys: ['ImageUniqueID'], label: 'Identificador único de la imagen' },
  { block: 'exif', keys: ['UserComment'], label: 'Comentario del usuario' },
  { block: 'exif', keys: ['MakerNote'], label: 'Datos privados del fabricante' },
  { block: 'exif', keys: ['OffsetTimeOriginal', 'OffsetTime'], label: 'Zona horaria' },
  { block: 'ifd0', keys: ['Copyright'], label: 'Derechos de autor' },
  { block: 'ifd0', keys: ['ImageDescription'], label: 'Descripción de la imagen' },
  { block: 'ifd0', keys: ['HostComputer'], label: 'Nombre del equipo' },
  { block: 'gps', keys: ['GPSAltitude'], label: 'Altitud' },
  { block: 'gps', keys: ['GPSDateStamp', 'GPSTimeStamp'], label: 'Fecha y hora del GPS' },
  { block: 'gps', keys: ['GPSImgDirection'], label: 'Dirección de la cámara' },
];

const SEGMENT_LABELS: readonly { block: string; label: string }[] = [
  { block: 'ifd1', label: 'Miniatura incrustada' },
  { block: 'xmp', label: 'Datos XMP (pueden incluir historial de edición)' },
  { block: 'iptc', label: 'Datos IPTC (pueden incluir autor, lugar y palabras clave)' },
  { block: 'icc', label: 'Perfil de color ICC' },
];

function isBlock(value: unknown): value is Block {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function emptyReport(): ImageMetadataReport {
  return { hasAnyMetadata: false, otherFields: [] };
}

function textOf(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.replace(/\0/gu, '').trim();
    return trimmed === '' ? undefined : trimmed;
  }
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    const parts = value.map(textOf).filter((part): part is string => part !== undefined);
    return parts.length === 0 ? undefined : parts.join(', ');
  }
  if (isBlock(value)) {
    // XMP con idioma: { lang: 'x-default', value: '...' }.
    return textOf(value['value']);
  }
  return undefined;
}

function firstText(block: Block | undefined, keys: readonly string[]): string | undefined {
  if (block === undefined) return undefined;
  for (const key of keys) {
    const text = textOf(block[key]);
    if (text !== undefined) return text;
  }
  return undefined;
}

/** Convierte «2026:10:03 10:15:00» (formato EXIF) en «3 de octubre de 2026, 10:15». */
function formatExifDate(raw: string): string {
  const match = /^(\d{4})[:-](\d{2})[:-](\d{2})(?:[ T](\d{2}):(\d{2}))?/u.exec(raw);
  if (match === null) return raw;
  const [, year, month, day, hour, minute] = match;
  const monthName = MONTHS[Number(month) - 1];
  if (monthName === undefined) return raw;
  const date = `${Number(day)} de ${monthName} de ${year ?? ''}`;
  return hour !== undefined && minute !== undefined ? `${date}, ${hour}:${minute}` : date;
}

function joinDevice(make: string | undefined, model: string | undefined): string | undefined {
  if (make === undefined) return model;
  if (model === undefined) return make;
  return model.toLowerCase().startsWith(make.toLowerCase()) ? model : `${make} ${model}`;
}

/**
 * Lee los metadatos de una imagen y resume lo que podría identificar a la persona.
 * Nunca lanza por un archivo sin metadatos o ilegible: en ese caso devuelve un reporte vacío.
 *
 * Seguridad: a exifr se le entrega siempre un `ArrayBuffer`, nunca una cadena, porque con una
 * cadena intentaría descargar una URL o leer una ruta.
 */
export async function inspectImageMetadata(
  blob: Blob,
  options: InspectImageMetadataOptions = {},
): Promise<ImageMetadataReport> {
  const includeColorProfile = options.includeColorProfile ?? true;
  let output: unknown;
  try {
    const buffer = await blob.arrayBuffer();
    output = await exifr.parse(buffer, {
      tiff: true,
      ifd1: true,
      exif: true,
      gps: true,
      interop: false,
      xmp: true,
      iptc: true,
      icc: includeColorProfile,
      jfif: false,
      ihdr: false,
      makerNote: true,
      userComment: true,
      mergeOutput: false,
      translateKeys: true,
      translateValues: false,
      reviveValues: false,
      sanitize: true,
    });
  } catch {
    return emptyReport();
  }
  if (!isBlock(output)) return emptyReport();

  const block = (key: string): Block | undefined => {
    const value = output[key];
    return isBlock(value) && Object.keys(value).length > 0 ? value : undefined;
  };
  const ifd0 = block('ifd0');
  const exif = block('exif');
  const gpsBlock = block('gps');
  const xmp = block('xmp');
  const iptc = block('iptc');

  const report = emptyReport();
  const presentBlocks = ['ifd0', 'ifd1', 'exif', 'gps', 'xmp', 'iptc', 'icc'].filter(
    (key) => block(key) !== undefined,
  );
  report.hasAnyMetadata = presentBlocks.length > 0;

  const latitude = gpsBlock?.['latitude'];
  const longitude = gpsBlock?.['longitude'];
  if (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  ) {
    report.gps = { latitude, longitude };
  }

  const device = joinDevice(firstText(ifd0, ['Make']), firstText(ifd0, ['Model']));
  if (device !== undefined) report.device = device;

  const captured =
    firstText(exif, ['DateTimeOriginal', 'CreateDate', 'DateTimeDigitized']) ??
    firstText(ifd0, ['DateTime', 'ModifyDate']) ??
    firstText(xmp, ['DateCreated', 'CreateDate']);
  if (captured !== undefined) report.capturedAt = formatExifDate(captured);

  const software = firstText(ifd0, ['Software']) ?? firstText(xmp, ['CreatorTool']);
  if (software !== undefined) report.software = software;

  const author =
    firstText(ifd0, ['Artist']) ??
    firstText(xmp, ['creator', 'Creator', 'Artist']) ??
    firstText(iptc, ['Byline', 'byline', 'ByLine']);
  if (author !== undefined) report.author = author;

  const blocks: Record<string, Block | undefined> = { ifd0, exif, gps: gpsBlock };
  for (const field of NOTABLE_FIELDS) {
    const source = blocks[field.block];
    if (source !== undefined && field.keys.some((key) => source[key] !== undefined)) {
      report.otherFields.push(field.label);
    }
  }
  for (const segment of SEGMENT_LABELS) {
    if (block(segment.block) !== undefined) report.otherFields.push(segment.label);
  }
  return report;
}
