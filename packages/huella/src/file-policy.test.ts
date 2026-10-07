// Pruebas de la política de archivos admitidos.
import { describe, expect, it } from 'vitest';
import { classifyFile, DEFAULT_MAX_FILE_BYTES } from './file-policy.ts';

const file = (name: string, type: string, size = 1024) => ({ name, type, size });

describe('classifyFile', () => {
  it('acepta JPEG, PNG, WebP y PDF cuando MIME y extensión coinciden', () => {
    expect(classifyFile(file('foto.jpg', 'image/jpeg'))).toEqual({ kind: 'image' });
    expect(classifyFile(file('FOTO.JPEG', 'image/jpeg'))).toEqual({ kind: 'image' });
    expect(classifyFile(file('captura.png', 'image/png'))).toEqual({ kind: 'image' });
    expect(classifyFile(file('imagen.webp', 'image/webp'))).toEqual({ kind: 'image' });
    expect(classifyFile(file('oficio.final.pdf', 'application/pdf'))).toEqual({ kind: 'pdf' });
  });

  it('rechaza si el tipo MIME y la extensión no coinciden', () => {
    const result = classifyFile(file('oficio.pdf', 'image/jpeg'));
    expect(result.kind).toBe('rejected');
    expect(result.reason).toMatch(/no coincide/u);
    expect(classifyFile(file('foto.png', 'image/jpeg')).kind).toBe('rejected');
    expect(classifyFile(file('sin-extension', 'image/png')).kind).toBe('rejected');
    expect(classifyFile(file('foto.jpg', '')).kind).toBe('rejected');
  });

  it('rechaza Office y OpenDocument con la guía de imprimir como PDF', () => {
    for (const [name, type] of [
      ['informe.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      ['tabla.xlsx', ''],
      ['viejo.doc', 'application/msword'],
      ['acta.odt', 'application/vnd.oasis.opendocument.text'],
      ['renombrado.pdf', 'application/vnd.ms-excel'],
    ] as const) {
      const result = classifyFile(file(name, type));
      expect(result.kind).toBe('rejected');
      expect(result.guide).toBe('Abre el documento e imprímelo como PDF.');
    }
  });

  it('rechaza HEIC y HEIF con la guía de captura o JPG', () => {
    for (const result of [
      classifyFile(file('IMG_0001.HEIC', 'image/heic')),
      classifyFile(file('foto.heif', '')),
      classifyFile(file('foto.jpg', 'image/heif')),
    ]) {
      expect(result.kind).toBe('rejected');
      expect(result.guide).toBe('Toma una captura de pantalla o exporta la foto como JPG.');
    }
  });

  it('rechaza video, audio y comprimidos con guías propias', () => {
    const video = classifyFile(file('clip.mp4', 'video/mp4'));
    const audio = classifyFile(file('nota.m4a', 'audio/mp4'));
    const archive = classifyFile(file('pruebas.zip', 'application/zip'));
    expect([video.kind, audio.kind, archive.kind]).toEqual(['rejected', 'rejected', 'rejected']);
    expect(video.guide).toMatch(/capturas de pantalla/u);
    expect(audio.guide).toMatch(/Escribe/u);
    expect(archive.guide).toMatch(/Descomprime/u);
    expect(classifyFile(file('clip.webm', '')).guide).toBe(video.guide);
  });

  it('rechaza tipos desconocidos con una guía general', () => {
    const result = classifyFile(file('script.html', 'text/html'));
    expect(result.kind).toBe('rejected');
    expect(result.guide).toMatch(/JPG, PNG o WebP/u);
    expect(classifyFile(file('dibujo.svg', 'image/svg+xml')).kind).toBe('rejected');
  });

  it('aplica el límite de 10 MiB por defecto y uno configurable', () => {
    expect(DEFAULT_MAX_FILE_BYTES).toBe(10 * 1024 * 1024);
    expect(classifyFile(file('a.jpg', 'image/jpeg', DEFAULT_MAX_FILE_BYTES)).kind).toBe('image');
    const big = classifyFile(file('a.jpg', 'image/jpeg', DEFAULT_MAX_FILE_BYTES + 1));
    expect(big.kind).toBe('rejected');
    expect(big.reason).toMatch(/10 MB/u);
    expect(classifyFile(file('a.pdf', 'application/pdf', 2048), { maxBytes: 1024 }).kind).toBe(
      'rejected',
    );
    expect(classifyFile(file('a.pdf', 'application/pdf', 2048), { maxBytes: 4096 }).kind).toBe(
      'pdf',
    );
  });

  it('rechaza archivos vacíos', () => {
    expect(classifyFile(file('a.png', 'image/png', 0)).reason).toMatch(/vacío/u);
  });
});
