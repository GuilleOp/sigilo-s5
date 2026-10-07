// Archivos sintéticos para adjuntar como pruebas: foto con GPS ficticio, PDF de una página escrito a
// mano, documento de Office falso y texto con caracteres invisibles. Nunca contienen datos reales.
import { buildSyntheticExifJpeg } from '../../packages/huella/test-fixtures/synthetic-exif-jpeg.ts';

/** Nombres de los archivos que genera el `globalSetup` dentro de `fixturesDir()`. */
export const FIXTURE_FILES = {
  photo: 'foto-con-gps.jpg',
  pdf: 'memo-interno.pdf',
  docx: 'memo-interno.docx',
  invisibleText: 'texto-marcado.txt',
  authorityKey: 'authority-demo-key.json',
} as const;

/** Texto sintético marcado con espacios de ancho cero, como un oficio filtrado. */
export const INVISIBLE_TEXT =
  'Se\u200b instruyó\u200c adjudicar\u200d el contrato\u2060 sin\ufeff licitación.';

/**
 * Inserta el bloque EXIF sintético (GPS, equipo y fecha ficticios) en un JPEG real.
 * El JPEG del fixture de `huella` no trae píxeles, así que el navegador no podría decodificarlo
 * ni limpiarlo; aquí se toma solo su segmento APP1 y se coloca justo después del SOI.
 */
export function withSyntheticExif(realJpeg: Uint8Array): Uint8Array {
  const isJpeg = realJpeg[0] === 0xff && realJpeg[1] === 0xd8;
  if (!isJpeg) throw new Error('La imagen base no es un JPEG.');
  const exifOnly = buildSyntheticExifJpeg();
  // Se quitan SOI (2 bytes) y EOI (2 bytes) del fixture para conservar solo el segmento APP1.
  const app1 = exifOnly.subarray(2, exifOnly.length - 2);
  const output = new Uint8Array(realJpeg.length + app1.length);
  output.set(realJpeg.subarray(0, 2), 0);
  output.set(app1, 2);
  output.set(realJpeg.subarray(2), 2 + app1.length);
  return output;
}

/**
 * PDF 1.4 mínimo y válido de una página con un rectángulo de color. Las posiciones de la tabla
 * `xref` se calculan al armarlo. Incluye un diccionario `Info` ficticio para mostrar que la
 * conversión a imagen descarta los metadatos del documento.
 */
export function buildMinimalPdf(): Uint8Array {
  const content = '0.15 0.35 0.65 rg 40 40 220 120 re f\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    '<< /Title (Memo sintetico) /Author (Autor Ficticio) >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = body.length;
  // Cada entrada de la tabla mide exactamente 20 bytes: 10 + 1 + 5 + 1 + 1 + 2 (espacio y LF).
  const entries = offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`);
  body +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${entries.join('')}` +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

/** Documento de Office falso: solo la firma ZIP y texto ficticio; basta su extensión y tipo. */
export function buildFakeDocx(): Uint8Array {
  const signature = [0x50, 0x4b, 0x03, 0x04];
  const filler = new TextEncoder().encode('documento sintetico de prueba');
  return new Uint8Array([...signature, ...filler]);
}
