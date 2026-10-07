// Pruebas de inspectImageMetadata con un JPEG sintético generado byte a byte (sin fotos reales).
import { describe, expect, it } from 'vitest';
import { IMAGE_METADATA_LABELS, inspectImageMetadata } from './image-metadata.ts';
import {
  buildBareJpeg,
  buildSyntheticExifJpeg,
  SYNTHETIC_EXIF,
} from '../test-fixtures/synthetic-exif-jpeg.ts';
import {
  buildSyntheticIccJpeg,
  type SyntheticIccProfile,
} from '../test-fixtures/synthetic-icc-jpeg.ts';

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

describe('IMAGE_METADATA_LABELS', () => {
  it('da un texto principal en lectura fácil para cada dato del reporte', () => {
    expect(IMAGE_METADATA_LABELS.gps).toBe('El lugar exacto donde tomaste la foto');
    expect(IMAGE_METADATA_LABELS.software).toBe('La aplicación con que se hizo o editó');
    expect(Object.keys(IMAGE_METADATA_LABELS).sort()).toEqual(
      ['author', 'capturedAt', 'device', 'gps', 'software'].sort(),
    );
    for (const label of Object.values(IMAGE_METADATA_LABELS)) {
      expect(label).not.toMatch(/GPS|EXIF|XMP|IPTC|ICC|metadatos/u);
    }
  });
});

describe('inspectImageMetadata con allowGenericSrgbProfile', () => {
  const jpegWith = (profile: SyntheticIccProfile): Blob =>
    new Blob([buildSyntheticIccJpeg(profile)], { type: 'image/jpeg' });
  const ALLOW = { allowGenericSrgbProfile: true };
  const COLOR_LABEL = 'Datos técnicos de color';

  // Forma del perfil que agrega Chromium (Skia): ICC v4 con textos `mluc`.
  const CHROMIUM_LIKE: SyntheticIccProfile = {
    texts: [
      { signature: 'desc', type: 'mluc', text: 'sRGB' },
      { signature: 'cprt', type: 'mluc', text: 'Google Inc. 2016' },
    ],
  };
  // Forma del perfil que agrega WebKit en macOS e iOS (ImageIO).
  const WEBKIT_LIKE: SyntheticIccProfile = {
    texts: [
      { signature: 'desc', type: 'mluc', text: 'sRGB IEC61966-2.1' },
      { signature: 'cprt', type: 'mluc', text: 'Copyright Apple Inc., 2017' },
    ],
  };
  // Forma del perfil sRGB clásico de HP/Microsoft (ICC v2).
  const HP_LIKE: SyntheticIccProfile = {
    version: [2, 1],
    texts: [
      { signature: 'desc', type: 'desc', text: 'sRGB IEC61966-2.1' },
      { signature: 'cprt', type: 'text', text: 'Copyright (c) 1998 Hewlett-Packard Company' },
      { signature: 'dmnd', type: 'desc', text: 'IEC http://www.iec.ch' },
      { signature: 'dmdd', type: 'desc', text: 'IEC 61966-2.1 Default RGB colour space - sRGB' },
      { signature: 'vued', type: 'desc', text: 'Reference Viewing Condition in IEC61966-2.1' },
    ],
  };

  for (const [name, profile] of [
    ['Chromium', CHROMIUM_LIKE],
    ['WebKit', WEBKIT_LIKE],
    ['HP/Microsoft', HP_LIKE],
  ] as const) {
    it(`acepta el perfil sRGB genérico con forma de ${name}`, async () => {
      await expect(inspectImageMetadata(jpegWith(profile), ALLOW)).resolves.toEqual({
        hasAnyMetadata: false,
        otherFields: [],
      });
    });
  }

  it('sin la opción, el perfil genérico se sigue reportando', async () => {
    const report = await inspectImageMetadata(jpegWith(CHROMIUM_LIKE));
    expect(report).toEqual({ hasAnyMetadata: true, otherFields: [COLOR_LABEL] });
  });

  const UNKNOWN_PROFILE: SyntheticIccProfile = {
    texts: [{ signature: 'desc', type: 'mluc', text: 'Monitor de Persona de Prueba' }],
  };

  const NOT_GENERIC: readonly [string, SyntheticIccProfile][] = [
    ['una descripción desconocida', UNKNOWN_PROFILE],
    [
      'un copyright con un nombre',
      {
        texts: [
          { signature: 'desc', type: 'mluc', text: 'sRGB' },
          { signature: 'cprt', type: 'mluc', text: 'Copyright 2026 Persona de Prueba' },
        ],
      },
    ],
    [
      'una etiqueta de texto adicional',
      {
        texts: [
          { signature: 'desc', type: 'mluc', text: 'sRGB' },
          { signature: 'meta', type: 'text', text: 'equipo-0042' },
        ],
      },
    ],
    [
      'un texto de fabricante que no es el de IEC',
      {
        texts: [
          { signature: 'desc', type: 'desc', text: 'sRGB IEC61966-2.1' },
          { signature: 'dmnd', type: 'desc', text: 'Marca Ficticia' },
        ],
      },
    ],
    [
      'un perfil de escáner',
      { profileClass: 'scnr', texts: [{ signature: 'desc', type: 'mluc', text: 'sRGB' }] },
    ],
    [
      'un perfil en escala de grises',
      { colorSpace: 'GRAY', texts: [{ signature: 'desc', type: 'mluc', text: 'sRGB' }] },
    ],
    ['un perfil sin descripción', { texts: [] }],
  ];

  for (const [name, profile] of NOT_GENERIC) {
    it(`trata como metadato ${name}`, async () => {
      const report = await inspectImageMetadata(jpegWith(profile), ALLOW);
      expect(report).toEqual({ hasAnyMetadata: true, otherFields: [COLOR_LABEL] });
    });
  }

  it('un perfil genérico no oculta el resto de los metadatos', async () => {
    const report = await inspectImageMetadata(
      new Blob([buildSyntheticExifJpeg()], { type: 'image/jpeg' }),
      ALLOW,
    );
    expect(report.hasAnyMetadata).toBe(true);
    expect(report.device).toBe('Marca Ficticia Modelo X1');
  });

  it('con includeColorProfile: false se ignora cualquier perfil', async () => {
    const report = await inspectImageMetadata(jpegWith(UNKNOWN_PROFILE), {
      includeColorProfile: false,
      allowGenericSrgbProfile: true,
    });
    expect(report.hasAnyMetadata).toBe(false);
  });
});
