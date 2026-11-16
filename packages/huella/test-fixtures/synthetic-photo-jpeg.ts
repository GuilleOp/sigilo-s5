// Generador byte a byte de una foto JPEG pequeña y decodificable, con EXIF sintético opcional.
// No usa fotos reales: los píxeles se dibujan con código (una «cotización» esquemática en papel) y
// los metadatos son los ficticios de `synthetic-exif-jpeg.ts` (GPS, equipo, fecha y autor).
//
// A diferencia de `buildSyntheticExifJpeg`, que solo trae metadatos, esta imagen sí tiene píxeles:
// el navegador la puede decodificar y Huella Cero la puede limpiar en un lienzo.
//
// Codificación: JPEG base (SOF0) de 8 bits, YCbCr 4:4:4, una tabla de cuantización de unos y
// tablas de Huffman mínimas. Cada bloque de 8×8 es de un solo color, así que solo lleva el
// coeficiente DC y el fin de bloque (EOB); no hace falta la transformada completa.
import { buildSyntheticExifJpeg } from './synthetic-exif-jpeg.ts';

/** Ancho y alto de la foto sintética, en píxeles (múltiplos de 8). */
export const SYNTHETIC_PHOTO_SIZE = { width: 160, height: 120 } as const;

type Rgb = readonly [number, number, number];

const PAPER: Rgb = [244, 241, 232];
const HEADER: Rgb = [38, 84, 124];
const INK: Rgb = [70, 70, 78];
const TOTAL: Rgb = [176, 52, 44];
const TABLE: Rgb = [214, 222, 230];

/** Color de cada bloque de 8×8: una hoja con encabezado, renglones, tabla y total. */
function blockColor(column: number, row: number): Rgb {
  const columns = SYNTHETIC_PHOTO_SIZE.width / 8;
  const rows = SYNTHETIC_PHOTO_SIZE.height / 8;
  const margin = column === 0 || column === columns - 1 || row === 0 || row === rows - 1;
  if (margin) return [120, 104, 86]; // Mesa de madera alrededor de la hoja.
  if (row === 1 || row === 2) return HEADER;
  if ((row === 4 || row === 6) && column >= 2 && column <= 12) return INK;
  if (row >= 8 && row <= 11 && column >= 2 && column <= columns - 3) {
    return (row + column) % 2 === 0 ? TABLE : PAPER;
  }
  if (row === 12 && column >= 13 && column <= columns - 3) return TOTAL;
  return PAPER;
}

function toYCbCr([r, g, b]: Rgb): [number, number, number] {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return [y, cb, cr];
}

/** Tabla DC de luminancia estándar (ITU-T T.81, anexo K): longitudes y símbolos 0 a 11. */
const DC_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const DC_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
/** Tabla AC mínima: un solo símbolo, el EOB (0x00), con código de 2 bits «00». */
const AC_BITS = [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const AC_VALUES = [0x00];

/** Códigos canónicos de Huffman a partir de las longitudes (anexo C de T.81). */
function huffmanCodes(
  bits: readonly number[],
  values: readonly number[],
): Map<number, [number, number]> {
  const codes = new Map<number, [number, number]>();
  let code = 0;
  let k = 0;
  for (let length = 1; length <= 16; length++) {
    for (let i = 0; i < (bits[length - 1] ?? 0); i++) {
      codes.set(values[k++] ?? 0, [code, length]);
      code++;
    }
    code <<= 1;
  }
  return codes;
}

class BitWriter {
  readonly bytes: number[] = [];
  private current = 0;
  private count = 0;
  write(value: number, length: number): void {
    for (let bit = length - 1; bit >= 0; bit--) {
      this.current = (this.current << 1) | ((value >> bit) & 1);
      this.count++;
      if (this.count === 8) this.flushByte();
    }
  }
  private flushByte(): void {
    this.bytes.push(this.current);
    // Relleno de bytes: un 0xFF dentro de los datos va seguido de 0x00.
    if (this.current === 0xff) this.bytes.push(0x00);
    this.current = 0;
    this.count = 0;
  }
  finish(): number[] {
    // Los bits sobrantes del último byte se rellenan con unos.
    while (this.count !== 0) this.write(1, 1);
    return this.bytes;
  }
}

function segment(marker: number, payload: readonly number[]): number[] {
  const length = payload.length + 2;
  return [0xff, marker, (length >> 8) & 0xff, length & 0xff, ...payload];
}

/** Datos entrópicos de la imagen: por bloque, la diferencia de DC y el EOB. */
function scanData(): number[] {
  const dc = huffmanCodes(DC_BITS, DC_VALUES);
  const ac = huffmanCodes(AC_BITS, AC_VALUES);
  const eob = ac.get(0x00);
  if (eob === undefined) throw new Error('Falta el código EOB.');
  const writer = new BitWriter();
  const previous = [0, 0, 0];
  const columns = SYNTHETIC_PHOTO_SIZE.width / 8;
  const rows = SYNTHETIC_PHOTO_SIZE.height / 8;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const components = toYCbCr(blockColor(column, row));
      components.forEach((value, index) => {
        // Con cuantización 1, el DC de un bloque uniforme es 8 × (valor − 128).
        const coefficient = Math.round(8 * (value - 128));
        const diff = coefficient - (previous[index] ?? 0);
        previous[index] = coefficient;
        const magnitude = Math.abs(diff);
        const category = magnitude === 0 ? 0 : Math.floor(Math.log2(magnitude)) + 1;
        const code = dc.get(category);
        if (code === undefined) throw new Error(`Categoría DC fuera de tabla: ${category}.`);
        writer.write(code[0], code[1]);
        if (category > 0) {
          const extra = diff > 0 ? diff : diff + (1 << category) - 1;
          writer.write(extra, category);
        }
        writer.write(eob[0], eob[1]);
      });
    }
  }
  return writer.finish();
}

/** Segmento APP1 con el EXIF sintético (GPS, equipo, fecha, software y autor ficticios). */
function syntheticExifSegment(): number[] {
  const exifOnly = buildSyntheticExifJpeg();
  // Se quitan SOI y EOI del JPEG de solo metadatos para conservar únicamente el APP1.
  return [...exifOnly.subarray(2, exifOnly.length - 2)];
}

/** Opciones de `buildSyntheticPhotoJpeg`. */
export interface SyntheticPhotoOptions {
  /** Si se incluye el bloque EXIF ficticio. Por defecto, sí. */
  exif?: boolean;
}

/** Construye una foto JPEG real y pequeña; con EXIF ficticio salvo que se pida lo contrario. */
export function buildSyntheticPhotoJpeg(
  options: SyntheticPhotoOptions = {},
): Uint8Array<ArrayBuffer> {
  const { width, height } = SYNTHETIC_PHOTO_SIZE;
  const quantization = segment(0xdb, [0x00, ...new Array<number>(64).fill(1)]);
  const frame = segment(0xc0, [
    8,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    3,
    ...[1, 2, 3].flatMap((id) => [id, 0x11, 0]),
  ]);
  const huffman = segment(0xc4, [0x00, ...DC_BITS, ...DC_VALUES, 0x10, ...AC_BITS, ...AC_VALUES]);
  const scanHeader = segment(0xda, [3, ...[1, 2, 3].flatMap((id) => [id, 0x00]), 0, 63, 0]);
  return new Uint8Array([
    0xff,
    0xd8,
    ...(options.exif === false ? [] : syntheticExifSegment()),
    ...quantization,
    ...frame,
    ...huffman,
    ...scanHeader,
    ...scanData(),
    0xff,
    0xd9,
  ]);
}
