// Rasterización de PDF con pdf.js: cada página se convierte en una imagen JPEG.
// Solo funciona en el navegador; se prueba con Playwright.

import type { PDFDocumentLoadingTask } from 'pdfjs-dist';

/** Opciones de `rasterizePdf`. */
export interface RasterizePdfOptions {
  /** URL del worker de pdf.js servido desde el propio origen de la aplicación. */
  workerSrc: string;
  /** Escala de renderizado (1 = 72 ppp). Por defecto, 2. */
  scale?: number;
  /** Máximo de páginas admitidas. Por defecto, 20. */
  maxPages?: number;
  /** Calidad JPEG entre 0 y 1. Por defecto, 0.85. */
  quality?: number;
}

/** Páginas admitidas por defecto. */
export const DEFAULT_MAX_PDF_PAGES = 20;
/** Escala por defecto (aproximadamente 144 ppp). */
export const DEFAULT_PDF_SCALE = 2;
/** Calidad JPEG por defecto de cada página. */
export const DEFAULT_PDF_QUALITY = 0.85;
/** Lado mayor máximo de una página rasterizada, para acotar la memoria. */
export const MAX_PAGE_DIMENSION = 4096;

function assertSameOrigin(workerSrc: string): void {
  if (typeof location === 'undefined') return;
  let url: URL;
  try {
    url = new URL(workerSrc, location.href);
  } catch {
    throw new Error('La dirección del componente para leer PDF no es válida.');
  }
  // Seguridad: el worker debe venir del mismo origen; nunca de un CDN ni de un tercero.
  if (url.origin !== location.origin) {
    throw new Error('El componente para leer PDF debe servirse desde este mismo sitio.');
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null || blob.type !== 'image/jpeg') {
          reject(new Error('No se pudo convertir una página del PDF en imagen.'));
        } else {
          resolve(blob);
        }
      },
      'image/jpeg',
      quality,
    );
  });
}

function describeLoadError(error: unknown): Error {
  const name = error instanceof Error ? error.name : '';
  if (name === 'PasswordException') {
    return new Error(
      'El PDF está protegido con contraseña. Ábrelo e imprímelo como PDF sin contraseña.',
    );
  }
  if (name === 'InvalidPDFException') {
    return new Error('El archivo no es un PDF válido o está dañado.');
  }
  return new Error('No se pudo abrir el PDF. Intenta imprimirlo de nuevo como PDF.');
}

/**
 * Renderiza cada página del PDF en un canvas y devuelve un JPEG por página, en orden.
 *
 * Seguridad: el resultado son solo píxeles; se pierden texto seleccionable, capas ocultas,
 * adjuntos, formularios, JavaScript y metadatos del PDF. pdf.js se configura sin red: no se
 * indican URL de CMaps, fuentes estándar, perfiles ICC ni WebAssembly, se desactivan las
 * descargas desde el worker, las fuentes del sistema y la carga de fuentes como `FontFace`
 * (los glifos se dibujan con trazos). pdf.js v6 ya no evalúa código (`isEvalSupported` dejó de
 * existir). Lanza un error si el PDF excede `maxPages` en lugar de truncarlo en silencio.
 */
export async function rasterizePdf(blob: Blob, options: RasterizePdfOptions): Promise<Blob[]> {
  const scale = options.scale ?? DEFAULT_PDF_SCALE;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PDF_PAGES;
  const quality = options.quality ?? DEFAULT_PDF_QUALITY;
  if (
    !(scale > 0) ||
    !Number.isInteger(maxPages) ||
    maxPages < 1 ||
    !(quality > 0 && quality <= 1)
  ) {
    throw new Error('Opciones inválidas para convertir el PDF.');
  }
  if (typeof document === 'undefined' || typeof Worker === 'undefined') {
    throw new Error('Tu navegador no puede convertir PDF. Actualízalo o usa otro navegador.');
  }
  assertSameOrigin(options.workerSrc);

  // Carga diferida: pdf.js es pesado y solo se necesita si la persona adjunta un PDF.
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = options.workerSrc;

  const data = new Uint8Array(await blob.arrayBuffer());
  let loadingTask: PDFDocumentLoadingTask | undefined;
  try {
    loadingTask = pdfjs.getDocument({
      data,
      useSystemFonts: false,
      disableFontFace: true,
      useWorkerFetch: false,
      useWasm: false,
      enableXfa: false,
      disableRange: true,
      disableStream: true,
      disableAutoFetch: true,
      stopAtErrors: false,
      verbosity: pdfjs.VerbosityLevel.ERRORS,
    });
    let pdfDocument;
    try {
      pdfDocument = await loadingTask.promise;
    } catch (error) {
      throw describeLoadError(error);
    }
    if (pdfDocument.numPages > maxPages) {
      throw new Error(
        `El PDF tiene ${pdfDocument.numPages} páginas y el máximo es ${maxPages}. Divídelo en partes más pequeñas.`,
      );
    }

    const pages: Blob[] = [];
    for (let number = 1; number <= pdfDocument.numPages; number++) {
      const page = await pdfDocument.getPage(number);
      try {
        const base = page.getViewport({ scale: 1 });
        const pageScale = Math.min(
          scale,
          MAX_PAGE_DIMENSION / Math.max(base.width, base.height, 1),
        );
        const viewport = page.getViewport({ scale: pageScale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        await page.render({
          canvas,
          viewport,
          intent: 'display',
          annotationMode: pdfjs.AnnotationMode.ENABLE,
          background: '#ffffff',
        }).promise;
        pages.push(await canvasToJpeg(canvas, quality));
        // Libera la memoria del lienzo de inmediato; algunos navegadores tardan en recolectarla.
        canvas.width = 0;
        canvas.height = 0;
      } finally {
        page.cleanup();
      }
    }
    return pages;
  } finally {
    await loadingTask?.destroy();
  }
}
