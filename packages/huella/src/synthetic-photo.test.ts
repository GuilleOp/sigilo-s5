// Pruebas de la foto sintética de la demo (`.red-demo/fixtures/cotizacion-con-exif.jpg`): debe ser un
// JPEG con píxeles, que el navegador pueda decodificar y limpiar, y con EXIF ficticio detectable.
import { describe, expect, it } from 'vitest';
import { inspectImageMetadata } from './image-metadata.ts';
import { SYNTHETIC_EXIF } from '../test-fixtures/synthetic-exif-jpeg.ts';
import {
  buildSyntheticPhotoJpeg,
  SYNTHETIC_PHOTO_SIZE,
} from '../test-fixtures/synthetic-photo-jpeg.ts';

/** Marcadores de segmento del JPEG, en orden, hasta el inicio del barrido (SOS). */
function markers(jpeg: Uint8Array): { marker: number; payload: Uint8Array; end: number }[] {
  const found: { marker: number; payload: Uint8Array; end: number }[] = [];
  let offset = 2;
  while (offset < jpeg.length) {
    expect(jpeg[offset]).toBe(0xff);
    const marker = jpeg[offset + 1] ?? 0;
    const length = ((jpeg[offset + 2] ?? 0) << 8) | (jpeg[offset + 3] ?? 0);
    found.push({
      marker,
      payload: jpeg.subarray(offset + 4, offset + 2 + length),
      end: offset + 2 + length,
    });
    if (marker === 0xda) break;
    offset += 2 + length;
  }
  return found;
}

describe('buildSyntheticPhotoJpeg', () => {
  it('es un JPEG base con cuadro de imagen, tablas, barrido y fin de imagen', () => {
    const jpeg = buildSyntheticPhotoJpeg();
    expect([jpeg[0], jpeg[1]]).toEqual([0xff, 0xd8]);
    expect([jpeg.at(-2), jpeg.at(-1)]).toEqual([0xff, 0xd9]);
    const found = markers(jpeg);
    expect(found.map((segment) => segment.marker)).toEqual([0xe1, 0xdb, 0xc0, 0xc4, 0xda]);
    const frame = found.find((segment) => segment.marker === 0xc0)?.payload;
    expect(frame?.[0]).toBe(8);
    expect(((frame?.[1] ?? 0) << 8) | (frame?.[2] ?? 0)).toBe(SYNTHETIC_PHOTO_SIZE.height);
    expect(((frame?.[3] ?? 0) << 8) | (frame?.[4] ?? 0)).toBe(SYNTHETIC_PHOTO_SIZE.width);
    expect(frame?.[5]).toBe(3);
  });

  it('lleva GPS, equipo, fecha y autor ficticios', async () => {
    const report = await inspectImageMetadata(
      new Blob([buildSyntheticPhotoJpeg()], { type: 'image/jpeg' }),
    );
    expect(report.gps?.latitude).toBeCloseTo(SYNTHETIC_EXIF.latitude, 6);
    expect(report.gps?.longitude).toBeCloseTo(SYNTHETIC_EXIF.longitude, 6);
    expect(report.device).toBe('Marca Ficticia Modelo X1');
    expect(report.capturedAt).toBe('3 de octubre de 2026, 10:15');
    expect(report.author).toBe(SYNTHETIC_EXIF.artist);
  });

  it('sin EXIF conserva la misma imagen y no trae metadatos', async () => {
    const clean = buildSyntheticPhotoJpeg({ exif: false });
    expect(markers(clean).map((segment) => segment.marker)).toEqual([0xdb, 0xc0, 0xc4, 0xda]);
    const withExif = buildSyntheticPhotoJpeg();
    const tail = (jpeg: Uint8Array) => jpeg.subarray(jpeg.length - 400);
    expect(tail(clean)).toEqual(tail(withExif));
    const report = await inspectImageMetadata(new Blob([clean], { type: 'image/jpeg' }));
    expect(report.hasAnyMetadata).toBe(false);
  });

  it('se decodifica: cada bloque trae su DC y el fin de bloque, con colores de papel y tinta', () => {
    const jpeg = buildSyntheticPhotoJpeg({ exif: false });
    const found = markers(jpeg);
    const sos = found.at(-1);
    expect(sos?.marker).toBe(0xda);
    // Quita el relleno de bytes (0xFF 0x00) de los datos entrópicos.
    const raw = jpeg.subarray(sos?.end ?? 0, jpeg.length - 2);
    const data: number[] = [];
    for (let i = 0; i < raw.length; i++) {
      data.push(raw[i] ?? 0);
      if (raw[i] === 0xff) {
        expect(raw[i + 1]).toBe(0x00);
        i++;
      }
    }
    // Tablas de Huffman declaradas en el DHT: [clase/id, 16 longitudes, símbolos]…
    const dht = found.find((segment) => segment.marker === 0xc4)?.payload ?? new Uint8Array();
    const tables = new Map<number, Map<string, number>>();
    let cursor = 0;
    while (cursor < dht.length) {
      const id = dht[cursor] ?? 0;
      const lengths = [...dht.subarray(cursor + 1, cursor + 17)];
      const symbols = [...dht.subarray(cursor + 17, cursor + 17 + lengths.reduce((a, b) => a + b))];
      const codes = new Map<string, number>();
      let code = 0;
      let k = 0;
      lengths.forEach((count, index) => {
        for (let n = 0; n < count; n++) {
          codes.set((code++).toString(2).padStart(index + 1, '0'), symbols[k++] ?? 0);
        }
        code <<= 1;
      });
      tables.set(id, codes);
      cursor += 17 + symbols.length;
    }
    let bit = 0;
    const readBit = () => ((data[bit >> 3] ?? 0) >> (7 - (bit++ & 7))) & 1;
    const decode = (table: Map<string, number> | undefined) => {
      let prefix = '';
      while (prefix.length <= 16) {
        prefix += String(readBit());
        const symbol = table?.get(prefix);
        if (symbol !== undefined) return symbol;
      }
      throw new Error('Código de Huffman inválido.');
    };
    const blocks = (SYNTHETIC_PHOTO_SIZE.width / 8) * (SYNTHETIC_PHOTO_SIZE.height / 8);
    const previous = [0, 0, 0];
    const luma: number[] = [];
    for (let block = 0; block < blocks; block++) {
      for (let component = 0; component < 3; component++) {
        const category = decode(tables.get(0x00));
        let diff = 0;
        if (category > 0) {
          for (let n = 0; n < category; n++) diff = (diff << 1) | readBit();
          if (diff < 1 << (category - 1)) diff -= (1 << category) - 1;
        }
        previous[component] = (previous[component] ?? 0) + diff;
        expect(decode(tables.get(0x10))).toBe(0x00); // EOB: el bloque es de un solo color.
        if (component === 0) luma.push(128 + (previous[0] ?? 0) / 8);
      }
    }
    // Los bits que sobran solo son el relleno de unos del último byte.
    expect(data.length - Math.ceil(bit / 8)).toBe(0);
    for (const value of luma) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(255);
    }
    // Hay papel claro y tinta oscura: no es una imagen vacía ni de un solo tono.
    expect(Math.max(...luma)).toBeGreaterThan(220);
    expect(Math.min(...luma)).toBeLessThan(100);
  });
});
