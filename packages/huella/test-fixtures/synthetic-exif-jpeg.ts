// Generador byte a byte de un JPEG mínimo con bloque EXIF sintético (GPS, equipo y fecha ficticios).
// No usa fotos reales: los valores son inventados y el archivo no contiene imagen, solo metadatos.
//
// Estructura generada: SOI (FFD8) + APP1 «Exif\0\0» con TIFF little-endian (IFD0 con Make, Model,
// Software, Artist y punteros a los IFD de EXIF y GPS) + EOI (FFD9).

type EntryValue =
  | { kind: 'ascii'; text: string }
  | { kind: 'long'; value: number }
  | {
      kind: 'rational';
      values: readonly [number, number][];
    };

interface Entry {
  tag: number;
  value: EntryValue;
}

const TYPE_ASCII = 2;
const TYPE_LONG = 4;
const TYPE_RATIONAL = 5;

class ByteWriter {
  readonly bytes: number[] = [];
  u16(value: number): void {
    this.bytes.push(value & 0xff, (value >> 8) & 0xff);
  }
  u32(value: number): void {
    this.bytes.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff);
  }
}

function payloadOf(value: EntryValue): { type: number; count: number; data: number[] } {
  if (value.kind === 'ascii') {
    const data = [...value.text].map((character) => character.charCodeAt(0) & 0x7f);
    data.push(0);
    return { type: TYPE_ASCII, count: data.length, data };
  }
  if (value.kind === 'long') {
    const writer = new ByteWriter();
    writer.u32(value.value);
    return { type: TYPE_LONG, count: 1, data: writer.bytes };
  }
  const writer = new ByteWriter();
  for (const [numerator, denominator] of value.values) {
    writer.u32(numerator);
    writer.u32(denominator);
  }
  return { type: TYPE_RATIONAL, count: value.values.length, data: writer.bytes };
}

/** Tamaño en bytes de un IFD con sus datos externos. */
function ifdSize(entries: readonly Entry[]): number {
  let size = 2 + entries.length * 12 + 4;
  for (const entry of entries) {
    const { data } = payloadOf(entry.value);
    if (data.length > 4) size += data.length + (data.length % 2);
  }
  return size;
}

/** Serializa un IFD que comienza en `offset` (relativo al inicio del TIFF). */
function writeIfd(entries: readonly Entry[], offset: number): number[] {
  const writer = new ByteWriter();
  const external: number[] = [];
  let dataOffset = offset + 2 + entries.length * 12 + 4;
  writer.u16(entries.length);
  for (const entry of [...entries].sort((a, b) => a.tag - b.tag)) {
    const { type, count, data } = payloadOf(entry.value);
    writer.u16(entry.tag);
    writer.u16(type);
    writer.u32(count);
    if (data.length <= 4) {
      writer.bytes.push(...data, ...new Array<number>(4 - data.length).fill(0));
    } else {
      writer.u32(dataOffset);
      external.push(...data);
      if (data.length % 2 === 1) external.push(0);
      dataOffset += data.length + (data.length % 2);
    }
  }
  writer.u32(0);
  return [...writer.bytes, ...external];
}

/** Datos ficticios que se incrustan en el JPEG. */
export const SYNTHETIC_EXIF = {
  make: 'Marca Ficticia',
  model: 'Modelo X1',
  software: 'Editor Sintetico 1.0',
  artist: 'Persona de Prueba',
  dateTimeOriginal: '2026:10:03 10:15:00',
  // 20° 30' 0" N, 100° 15' 0" O: coordenadas ficticias.
  latitude: 20.5,
  longitude: -100.25,
} as const;

/** Construye un JPEG mínimo con EXIF, GPS y equipo ficticios. */
export function buildSyntheticExifJpeg(): Uint8Array<ArrayBuffer> {
  const gpsEntries: Entry[] = [
    { tag: 0x0001, value: { kind: 'ascii', text: 'N' } },
    {
      tag: 0x0002,
      value: {
        kind: 'rational',
        values: [
          [20, 1],
          [30, 1],
          [0, 1],
        ],
      },
    },
    { tag: 0x0003, value: { kind: 'ascii', text: 'W' } },
    {
      tag: 0x0004,
      value: {
        kind: 'rational',
        values: [
          [100, 1],
          [15, 1],
          [0, 1],
        ],
      },
    },
  ];
  const exifEntries: Entry[] = [
    { tag: 0x9003, value: { kind: 'ascii', text: SYNTHETIC_EXIF.dateTimeOriginal } },
  ];
  const ifd0Base: Entry[] = [
    { tag: 0x010f, value: { kind: 'ascii', text: SYNTHETIC_EXIF.make } },
    { tag: 0x0110, value: { kind: 'ascii', text: SYNTHETIC_EXIF.model } },
    { tag: 0x0131, value: { kind: 'ascii', text: SYNTHETIC_EXIF.software } },
    { tag: 0x013b, value: { kind: 'ascii', text: SYNTHETIC_EXIF.artist } },
    { tag: 0x8769, value: { kind: 'long', value: 0 } },
    { tag: 0x8825, value: { kind: 'long', value: 0 } },
  ];
  const ifd0Offset = 8;
  const exifOffset = ifd0Offset + ifdSize(ifd0Base);
  const gpsOffset = exifOffset + ifdSize(exifEntries);
  const ifd0Entries = ifd0Base.map((entry) => {
    if (entry.tag === 0x8769)
      return { tag: entry.tag, value: { kind: 'long', value: exifOffset } } as Entry;
    if (entry.tag === 0x8825)
      return { tag: entry.tag, value: { kind: 'long', value: gpsOffset } } as Entry;
    return entry;
  });

  const tiff = new ByteWriter();
  tiff.bytes.push(0x49, 0x49); // «II»: little-endian.
  tiff.u16(42);
  tiff.u32(ifd0Offset);
  tiff.bytes.push(
    ...writeIfd(ifd0Entries, ifd0Offset),
    ...writeIfd(exifEntries, exifOffset),
    ...writeIfd(gpsEntries, gpsOffset),
  );

  const exifHeader = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // «Exif\0\0».
  const segmentLength = 2 + exifHeader.length + tiff.bytes.length;
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe1,
    (segmentLength >> 8) & 0xff,
    segmentLength & 0xff,
    ...exifHeader,
    ...tiff.bytes,
    0xff,
    0xd9,
  ]);
}

/** JPEG mínimo sin ningún segmento de metadatos (solo SOI y EOI). */
export function buildBareJpeg(): Uint8Array<ArrayBuffer> {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
}
