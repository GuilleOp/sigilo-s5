// Política de archivos admitidos como prueba: solo formatos que Huella Cero sabe limpiar.
// Todo lo demás se rechaza con una guía para convertirlo.

/** Datos mínimos de un archivo; coincide con las propiedades de `File`. */
export interface FileDescriptor {
  name: string;
  type: string;
  size: number;
}

/** Opciones de `classifyFile`. */
export interface FilePolicyOptions {
  /** Tamaño máximo en bytes. Por defecto, `DEFAULT_MAX_FILE_BYTES`. */
  maxBytes?: number;
}

/** Resultado de la clasificación. `reason` y `guide` solo aparecen cuando `kind` es `rejected`. */
export interface FileClassification {
  kind: 'image' | 'pdf' | 'rejected';
  reason?: string;
  guide?: string;
}

/** Límite por defecto: 10 MiB. */
export const DEFAULT_MAX_FILE_BYTES = 10 * 1024 * 1024;

type AcceptedFormat = 'jpeg' | 'png' | 'webp' | 'pdf';
type RejectedGroup = 'office' | 'heic' | 'video' | 'audio' | 'archive';

const ACCEPTED_EXTENSIONS: Readonly<Record<string, AcceptedFormat>> = {
  jpg: 'jpeg',
  jpeg: 'jpeg',
  png: 'png',
  webp: 'webp',
  pdf: 'pdf',
};

const ACCEPTED_MIME_TYPES: Readonly<Record<string, AcceptedFormat>> = {
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/pjpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

const REJECTED_EXTENSIONS: Readonly<Record<string, RejectedGroup>> = Object.fromEntries([
  ...'doc docx docm dot dotx xls xlsx xlsm xlt ppt pptx pptm pps ppsx rtf odt ods odp odg odf pages numbers key'
    .split(' ')
    .map((extension) => [extension, 'office'] as const),
  ...'heic heif hif'.split(' ').map((extension) => [extension, 'heic'] as const),
  ...'mp4 m4v mov avi mkv webm wmv flv 3gp 3g2 mpg mpeg'
    .split(' ')
    .map((extension) => [extension, 'video'] as const),
  ...'mp3 m4a wav ogg oga opus aac flac amr wma aiff'
    .split(' ')
    .map((extension) => [extension, 'audio'] as const),
  ...'zip rar 7z tar gz tgz bz2 xz zst cab iso'
    .split(' ')
    .map((extension) => [extension, 'archive'] as const),
]);

const REJECTION_TEXT: Readonly<Record<RejectedGroup, { reason: string; guide: string }>> = {
  office: {
    reason:
      'Los documentos de Office y OpenDocument guardan autores, revisiones y rutas de archivo.',
    guide: 'Abre el documento e imprímelo como PDF.',
  },
  heic: {
    reason: 'Las fotos HEIC o HEIF no se pueden limpiar en este navegador.',
    guide: 'Toma una captura de pantalla o exporta la foto como JPG.',
  },
  video: {
    reason: 'Los videos no se admiten: pueden contener voz, rostros, ubicación y datos del equipo.',
    guide: 'Toma capturas de pantalla de los cuadros importantes y adjúntalas como imágenes.',
  },
  audio: {
    reason:
      'Los audios no se admiten: la voz puede identificarte y el archivo guarda datos del equipo.',
    guide: 'Escribe en la denuncia lo que se escucha en la grabación.',
  },
  archive: {
    reason: 'Los archivos comprimidos no se admiten porque no se puede revisar su contenido.',
    guide: 'Descomprime el archivo y adjunta cada imagen o PDF por separado.',
  },
};

const UNSUPPORTED = {
  reason: 'Este tipo de archivo no se admite.',
  guide: 'Adjunta una foto JPG, PNG o WebP, o un documento PDF.',
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

function groupFromMime(type: string): RejectedGroup | null {
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type === 'image/heic' || type === 'image/heif' || type.startsWith('image/heic-'))
    return 'heic';
  if (type.startsWith('image/heif-')) return 'heic';
  if (
    type === 'application/msword' ||
    type === 'application/rtf' ||
    type === 'text/rtf' ||
    type.startsWith('application/vnd.ms-') ||
    type.startsWith('application/vnd.openxmlformats-officedocument.') ||
    type.startsWith('application/vnd.oasis.opendocument.') ||
    type.startsWith('application/vnd.apple.')
  ) {
    return 'office';
  }
  if (
    /^application\/(?:zip|x-zip-compressed|x-rar-compressed|vnd\.rar|x-7z-compressed|x-tar|gzip|x-gzip|x-bzip2|x-xz|zstd)$/u.test(
      type,
    )
  ) {
    return 'archive';
  }
  return null;
}

function rejected(text: { reason: string; guide: string }): FileClassification {
  return { kind: 'rejected', reason: text.reason, guide: text.guide };
}

/**
 * Clasifica un archivo como `image`, `pdf` o `rejected`.
 *
 * Seguridad: exige que el tipo MIME y la extensión coincidan; una discrepancia puede indicar un
 * archivo renombrado cuyo contenido real no pasaría por el limpiador correcto. Esto no sustituye
 * a la decodificación: el limpiador vuelve a validar el contenido al procesarlo.
 */
export function classifyFile(
  file: FileDescriptor,
  options: FilePolicyOptions = {},
): FileClassification {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_FILE_BYTES;
  const extension = extensionOf(file.name);
  const type = file.type.trim().toLowerCase();

  const group = groupFromMime(type) ?? REJECTED_EXTENSIONS[extension] ?? null;
  if (group !== null) return rejected(REJECTION_TEXT[group]);

  const fromExtension = ACCEPTED_EXTENSIONS[extension];
  const fromMime = ACCEPTED_MIME_TYPES[type];
  if (fromExtension === undefined || fromMime === undefined) return rejected(UNSUPPORTED);
  if (fromExtension !== fromMime) {
    return rejected({
      reason: 'La extensión del archivo no coincide con su tipo real.',
      guide: 'Abre el archivo y guárdalo de nuevo como JPG, PNG o PDF con su extensión correcta.',
    });
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    return rejected({
      reason: 'El archivo está vacío.',
      guide: 'Revisa que el archivo se abra correctamente y vuelve a adjuntarlo.',
    });
  }
  if (file.size > maxBytes) {
    const megabytes = Math.floor((maxBytes / (1024 * 1024)) * 10) / 10;
    return rejected({
      reason: `El archivo supera el límite de ${megabytes} MB.`,
      guide:
        fromMime === 'pdf'
          ? 'Divide el PDF en partes más pequeñas o imprímelo como PDF con menor calidad.'
          : 'Toma una captura de pantalla de la imagen o redúcela antes de adjuntarla.',
    });
  }

  return { kind: fromMime === 'pdf' ? 'pdf' : 'image' };
}
