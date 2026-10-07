// Pruebas de inspectImageMetadata con un JPEG sintético generado byte a byte (sin fotos reales).
import { describe, expect, it } from 'vitest';
import { inspectImageMetadata } from './image-metadata.ts';
import {
  buildBareJpeg,
  buildSyntheticExifJpeg,
  SYNTHETIC_EXIF,
} from '../test-fixtures/synthetic-exif-jpeg.ts';

describe('inspectImageMetadata', () => {
  it('detecta GPS, equipo, fecha, software y autor ficticios', async () => {
    const report = await inspectImageMetadata(
      new Blob([buildSyntheticExifJpeg()], { type: 'image/jpeg' }),
    );
    expect(report.hasAnyMetadata).toBe(true);
    expect(report.gps?.latitude).toBeCloseTo(SYNTHETIC_EXIF.latitude, 6);
    expect(report.gps?.longitude).toBeCloseTo(SYNTHETIC_EXIF.longitude, 6);
    expect(report.device).toBe('Marca Ficticia Modelo X1');
    expect(report.capturedAt).toBe('3 de octubre de 2026, 10:15');
    expect(report.software).toBe(SYNTHETIC_EXIF.software);
    expect(report.author).toBe(SYNTHETIC_EXIF.artist);
  });

  it('sin el perfil de color sigue detectando el resto de los metadatos', async () => {
    const report = await inspectImageMetadata(
      new Blob([buildSyntheticExifJpeg()], { type: 'image/jpeg' }),
      { includeColorProfile: false },
    );
    expect(report.hasAnyMetadata).toBe(true);
    expect(report.gps?.latitude).toBeCloseTo(SYNTHETIC_EXIF.latitude, 6);
    expect(report.device).toBe('Marca Ficticia Modelo X1');
  });

  it('devuelve un reporte vacío para un JPEG sin metadatos', async () => {
    const report = await inspectImageMetadata(new Blob([buildBareJpeg()], { type: 'image/jpeg' }));
    expect(report).toEqual({ hasAnyMetadata: false, otherFields: [] });
  });

  it('no lanza con datos que no son imagen ni con un archivo vacío', async () => {
    const garbage = new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])]);
    await expect(inspectImageMetadata(garbage)).resolves.toEqual({
      hasAnyMetadata: false,
      otherFields: [],
    });
    await expect(inspectImageMetadata(new Blob([]))).resolves.toEqual({
      hasAnyMetadata: false,
      otherFields: [],
    });
  });
});
