// URL del worker de pdf.js servido desde el propio origen (Vite lo copia como archivo del build).
// Seguridad: nunca se carga desde un CDN; `rasterizePdf` además verifica el mismo origen.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/** Ruta del worker de pdf.js. */
export const PDF_WORKER_URL: string = pdfWorkerUrl;
