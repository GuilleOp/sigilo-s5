// Limpieza de imágenes: se decodifica y se vuelve a codificar en canvas, sin copiar metadatos.
// Solo funciona en el navegador; se prueba con Playwright.

/** Opciones de `sanitizeImage`. */
export interface SanitizeImageOptions {
  /** Lado mayor máximo en píxeles. Por defecto, 2560. */
  maxDimension?: number;
  /** Formato de salida. Por defecto, `image/jpeg`. */
  outputType?: 'image/jpeg' | 'image/png';
  /** Calidad JPEG entre 0 y 1. Por defecto, 0.9. Se ignora en PNG. */
  quality?: number;
}

/** Imagen limpia y sus dimensiones finales. */
export interface SanitizedImage {
  blob: Blob;
  width: number;
  height: number;
}

/** Lado mayor por defecto de la imagen limpia. */
export const DEFAULT_MAX_IMAGE_DIMENSION = 2560;
/** Calidad JPEG por defecto. */
export const DEFAULT_JPEG_QUALITY = 0.9;

type Canvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function validateOptions(options: SanitizeImageOptions): Required<SanitizeImageOptions> {
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_IMAGE_DIMENSION;
  const quality = options.quality ?? DEFAULT_JPEG_QUALITY;
  if (!Number.isInteger(maxDimension) || maxDimension < 1) {
    throw new Error('La dimensión máxima debe ser un número entero positivo.');
  }
  if (!(quality > 0 && quality <= 1)) {
    throw new Error('La calidad debe estar entre 0 y 1.');
  }
  return { maxDimension, quality, outputType: options.outputType ?? 'image/jpeg' };
}

function createCanvas(
  width: number,
  height: number,
): { context: Canvas2D; encode: (type: string, quality: number) => Promise<Blob> } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('No se pudo preparar el lienzo para limpiar la imagen.');
    return { context, encode: (type, quality) => canvas.convertToBlob({ type, quality }) };
  }
  if (typeof document === 'undefined') {
    throw new Error('Este entorno no permite limpiar imágenes: falta un lienzo (canvas).');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('No se pudo preparar el lienzo para limpiar la imagen.');
  return {
    context,
    encode: (type, quality) =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob === null) reject(new Error('No se pudo codificar la imagen limpia.'));
            else resolve(blob);
          },
          type,
          quality,
        );
      }),
  };
}

/**
 * Decodifica la imagen, la reduce si excede `maxDimension` y la vuelve a codificar.
 *
 * Seguridad: el lienzo solo contiene píxeles, así que la imagen resultante no conserva EXIF
 * (GPS, dispositivo, fecha), XMP, IPTC, el perfil ICC del original ni miniaturas. El codificador
 * JPEG de Chromium sí agrega su propio perfil sRGB genérico, igual para cualquier imagen, que no
 * identifica a nadie. La rotación EXIF se aplica
 * antes de descartarla (`imageOrientation: 'from-image'`) para que la foto no quede girada.
 * Lanza un error en español si el navegador no tiene las capacidades o la imagen no se lee.
 */
export async function sanitizeImage(
  blob: Blob,
  options: SanitizeImageOptions = {},
): Promise<SanitizedImage> {
  const { maxDimension, quality, outputType } = validateOptions(options);
  if (typeof createImageBitmap !== 'function') {
    throw new Error('Tu navegador no puede limpiar imágenes. Actualízalo o usa otro navegador.');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, {
      imageOrientation: 'from-image',
      colorSpaceConversion: 'default',
      premultiplyAlpha: 'default',
    });
  } catch {
    throw new Error('No se pudo leer la imagen. Puede estar dañada o en un formato no compatible.');
  }

  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const { context, encode } = createCanvas(width, height);
    if (outputType === 'image/jpeg') {
      // JPEG no tiene transparencia: sin fondo, las zonas transparentes saldrían negras.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);

    const output = await encode(outputType, quality);
    // Seguridad: si el navegador no soporta el formato pedido, devolvería otro sin avisar.
    if (output.type !== outputType) {
      throw new Error('Tu navegador no pudo generar la imagen limpia en el formato solicitado.');
    }
    return { blob: output, width, height };
  } finally {
    bitmap.close();
  }
}
