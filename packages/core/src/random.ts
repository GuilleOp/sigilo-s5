// Fuente única de aleatoriedad criptográfica del paquete.

// Límite de bytes por llamada que impone la API Web Crypto.
const MAX_CHUNK = 65536;

/**
 * Devuelve `length` bytes aleatorios de `crypto.getRandomValues`.
 * Lanza error si `length` no es un entero no negativo.
 */
export function randomBytes(length: number): Uint8Array {
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new Error('La longitud debe ser un entero no negativo.');
  }
  const output = new Uint8Array(length);
  for (let offset = 0; offset < length; offset += MAX_CHUNK) {
    globalThis.crypto.getRandomValues(
      output.subarray(offset, Math.min(offset + MAX_CHUNK, length)),
    );
  }
  return output;
}
