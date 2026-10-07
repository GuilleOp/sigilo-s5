// Inspección de metadatos de una imagen (EXIF, GPS, XMP, IPTC, ICC, miniaturas) con exifr.
// Sirve para mostrar a la persona qué datos la delatarían antes de limpiar la foto.

import exifr from 'exifr';
import { SPANISH_MONTHS } from './months.ts';

/** Reporte de metadatos. Los textos están listos para mostrarse en español. */
export interface ImageMetadataReport {
  hasAnyMetadata: boolean;
  gps?: { latitude: number; longitude: number };
  device?: string;
  capturedAt?: string;
  software?: string;
  author?: string;
  /**
   * Etiquetas en español de otros datos presentes (por ejemplo, «Una copia pequeña escondida de
   * la foto»).
   */
  otherFields: string[];
}

/** Opciones de `inspectImageMetadata`. */
export interface InspectImageMetadataOptions {
  /**
   * Incluir el perfil de color ICC. Por defecto, `true`. Con `false` se ignora cualquier perfil,
   * aunque no sea genérico; para comprobar una copia limpia conviene `allowGenericSrgbProfile`.
   */
  includeColorProfile?: boolean;
  /**
   * Aceptar sin reportarlo un perfil ICC sRGB genérico de los que agregan los codificadores de
   * los navegadores (ver `isGenericSrgbProfile`). Por defecto, `false`. Cualquier otro perfil
   * cuenta como metadato. No tiene efecto con `includeColorProfile: false`, que ignora todo
   * perfil.
   */
  allowGenericSrgbProfile?: boolean;
}

type Block = Record<string, unknown>;

/**
 * Texto principal, en lectura fácil, para cada campo de `ImageMetadataReport`. La interfaz lo
 * muestra junto al valor (las coordenadas GPS siguen llegando como números en `gps`).
 */
export const IMAGE_METADATA_LABELS = {
  gps: 'El lugar exacto donde tomaste la foto',
  device: 'La marca y el modelo de tu celular o cámara',
  capturedAt: 'El día y la hora en que tomaste la foto',
  software: 'La aplicación con que se hizo o editó',
  author: 'El nombre de quien tomó o editó la foto',
} as const;

// Campos que, además de los principales, pueden identificar a la persona o a su equipo.
const NOTABLE_FIELDS: readonly { block: string; keys: readonly string[]; label: string }[] = [
  {
    block: 'exif',
    keys: ['BodySerialNumber', 'SerialNumber'],
    label: 'El número de serie de tu cámara',
  },
  { block: 'exif', keys: ['LensModel', 'LensMake', 'LensSerialNumber'], label: 'Datos del lente' },
  { block: 'exif', keys: ['CameraOwnerName'], label: 'El nombre de la persona dueña de la cámara' },
  { block: 'exif', keys: ['ImageUniqueID'], label: 'Un código único de la foto' },
  { block: 'exif', keys: ['UserComment'], label: 'Un comentario escrito en la foto' },
  {
    block: 'exif',
    keys: ['MakerNote'],
    label: 'Datos escondidos de la marca de tu celular o cámara',
  },
  { block: 'exif', keys: ['OffsetTimeOriginal', 'OffsetTime'], label: 'Zona horaria' },
  { block: 'ifd0', keys: ['Copyright'], label: 'Derechos de autor' },
  { block: 'ifd0', keys: ['ImageDescription'], label: 'Descripción de la imagen' },
  { block: 'ifd0', keys: ['HostComputer'], label: 'El nombre de tu computadora' },
  { block: 'gps', keys: ['GPSAltitude'], label: 'Altitud' },
  { block: 'gps', keys: ['GPSDateStamp', 'GPSTimeStamp'], label: 'Fecha y hora del GPS' },
  { block: 'gps', keys: ['GPSImgDirection'], label: 'Dirección de la cámara' },
];

const SEGMENT_LABELS: readonly { block: string; label: string }[] = [
  { block: 'ifd1', label: 'Una copia pequeña escondida de la foto' },
  { block: 'xmp', label: 'Historial de cambios de la foto' },
  { block: 'iptc', label: 'Autor, lugar o palabras clave' },
  { block: 'icc', label: 'Datos técnicos de color' },
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
  const monthName = SPANISH_MONTHS[Number(month) - 1];
  if (monthName === undefined) return raw;
  const date = `${Number(day)} de ${monthName} de ${year ?? ''}`;
  return hour !== undefined && minute !== undefined ? `${date}, ${hour}:${minute}` : date;
}

function joinDevice(make: string | undefined, model: string | undefined): string | undefined {
  if (make === undefined) return model;
  if (model === undefined) return make;
  return model.toLowerCase().startsWith(make.toLowerCase()) ? model : `${make} ${model}`;
}

// Descripciones de los perfiles sRGB que escriben los codificadores de los navegadores:
// - Chromium (Skia, `SkICC`): «sRGB», con copyright «Google Inc. 2016».
// - WebKit en macOS e iOS (ImageIO de Apple): «sRGB IEC61966-2.1», con copyright de Apple.
// - Firefox no incrusta perfil al codificar un lienzo; el perfil sRGB clásico de HP/Microsoft
//   («sRGB IEC61966-2.1», «Copyright (c) 1998 Hewlett-Packard Company») cubre los codificadores
//   del sistema que lo reutilizan.
const GENERIC_SRGB_DESCRIPTIONS: ReadonlySet<string> = new Set(['sRGB', 'sRGB IEC61966-2.1']);
// Copyright de proveedor, con año opcional. Cualquier otro texto se trata como metadato.
const GENERIC_ICC_COPYRIGHT =
  /^(?:Copyright\s+)?(?:\(c\)\s*)?(?:\d{4}\s+)?(?:Google Inc\.|Apple Inc\.|Apple Computer,? Inc\.|Hewlett-Packard Company)(?:,?\s*\d{4})?\.?$/u;
// Textos fijos del perfil sRGB de HP/Microsoft.
const GENERIC_ICC_TEXTS: Readonly<Record<string, ReadonlySet<string>>> = {
  DeviceMfgDesc: new Set(['IEC http://www.iec.ch']),
  DeviceModelDesc: new Set(['IEC 61966-2.1 Default RGB colour space - sRGB']),
  ViewingCondDesc: new Set(['Reference Viewing Condition in IEC61966-2.1']),
};
// Campos de la cabecera ICC (firmas de 4 bytes, versión, fecha) y etiquetas colorimétricas sin
// texto libre. Una etiqueta fuera de esta lista o de las de texto anteriores no es genérica.
const ICC_STRUCTURAL_KEYS: ReadonlySet<string> = new Set([
  'ProfileCMMType',
  'ProfileVersion',
  'ProfileClass',
  'ColorSpaceData',
  'ProfileConnectionSpace',
  'ProfileDateTime',
  'ProfileFileSignature',
  'PrimaryPlatform',
  'DeviceManufacturer',
  'DeviceModel',
  'RenderingIntent',
  'ProfileCreator',
  'MediaWhitePoint',
  'MediaBlackPoint',
  'RedMatrixColumn',
  'GreenMatrixColumn',
  'BlueMatrixColumn',
  'RedTRC',
  'GreenTRC',
  'BlueTRC',
  'ChromaticAdaptation',
  'Chromaticity',
  'Luminance',
  'Measurement',
  'Technology',
  'ViewingConditions',
  'cicp',
]);

/** Textos de una etiqueta ICC: cadena simple o lista multilingüe (`mluc`) de exifr. */
function iccTexts(value: unknown): string[] | undefined {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return undefined;
  const texts: string[] = [];
  for (const entry of value) {
    if (!isBlock(entry) || typeof entry['text'] !== 'string') return undefined;
    texts.push(entry['text']);
  }
  return texts.length === 0 ? undefined : texts;
}

/**
 * Indica si un bloque ICC de exifr es un perfil sRGB genérico de navegador: perfil de monitor
 * RGB con espacio de conexión XYZ, descripción conocida, copyright de proveedor (o ninguno) y
 * sin otras etiquetas de texto.
 *
 * Seguridad: se decide por descripción y estructura, no por una huella binaria, porque los bytes
 * cambian entre versiones de Skia e ImageIO. Un perfil con cualquier texto desconocido (nombre de
 * persona, modelo de monitor, etiquetas privadas) se trata como metadato y la copia no se acepta.
 */
function isGenericSrgbProfile(icc: Block): boolean {
  if (icc['ProfileClass'] !== 'mntr') return false;
  if (icc['ColorSpaceData'] !== 'RGB' || icc['ProfileConnectionSpace'] !== 'XYZ') return false;
  let hasDescription = false;
  for (const [key, value] of Object.entries(icc)) {
    if (value === undefined || ICC_STRUCTURAL_KEYS.has(key)) continue;
    const texts = iccTexts(value);
    if (texts === undefined) return false;
    if (key === 'ProfileDescription' || key === 'ProfileDescriptionML') {
      if (!texts.every((text) => GENERIC_SRGB_DESCRIPTIONS.has(text))) return false;
      hasDescription = true;
    } else if (key === 'ProfileCopyright') {
      if (!texts.every((text) => GENERIC_ICC_COPYRIGHT.test(text))) return false;
    } else {
      const allowed = GENERIC_ICC_TEXTS[key];
      if (allowed === undefined || !texts.every((text) => allowed.has(text))) return false;
    }
  }
  return hasDescription;
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

  const icc = block('icc');
  const isIgnoredColorProfile =
    icc !== undefined && options.allowGenericSrgbProfile === true && isGenericSrgbProfile(icc);
  const isPresent = (key: string): boolean =>
    block(key) !== undefined && !(key === 'icc' && isIgnoredColorProfile);

  const report = emptyReport();
  const presentBlocks = ['ifd0', 'ifd1', 'exif', 'gps', 'xmp', 'iptc', 'icc'].filter(isPresent);
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
    if (isPresent(segment.block)) report.otherFields.push(segment.label);
  }
  return report;
}
