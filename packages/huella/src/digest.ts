// Digesto SHA-256 de un archivo, para la cadena de custodia de la prueba original.

/**
 * Calcula el SHA-256 de un `Blob` y lo devuelve en hexadecimal en minúsculas.
 * Lanza un error si el entorno no ofrece `crypto.subtle` (por ejemplo, en un origen no seguro).
 */
export async function digestBlob(blob: Blob): Promise<string> {
  if (typeof crypto === 'undefined' || typeof crypto.subtle === 'undefined') {
    throw new Error(
      'Este navegador no permite calcular el digesto del archivo (se requiere HTTPS).',
    );
  }
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  let hex = '';
  for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, '0');
  return hex;
}
