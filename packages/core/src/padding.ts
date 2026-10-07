// Relleno a bloques fijos con prefijo de longitud, para ocultar el tamaño del texto en claro.

const LENGTH_PREFIX_BYTES = 4;
const MAX_LENGTH = 0xffffffff;

/**
 * Antepone la longitud (uint32 big endian) y rellena con ceros hasta un múltiplo de `blockSize`.
 * Lanza error si `blockSize` no es un entero positivo o los datos son demasiado grandes.
 */
export function padToBlock(bytes: Uint8Array, blockSize: number): Uint8Array {
  if (!Number.isSafeInteger(blockSize) || blockSize <= 0) {
    throw new Error('El tamaño de bloque debe ser un entero positivo.');
  }
  if (bytes.length > MAX_LENGTH) {
    throw new Error('Los datos exceden el tamaño máximo para rellenar.');
  }
  const unpadded = LENGTH_PREFIX_BYTES + bytes.length;
  const total = Math.ceil(unpadded / blockSize) * blockSize;
  const output = new Uint8Array(total);
  new DataView(output.buffer).setUint32(0, bytes.length, false);
  output.set(bytes, LENGTH_PREFIX_BYTES);
  return output;
}

/**
 * Quita el relleno de `padToBlock`. Lanza error si el prefijo es inconsistente o el relleno no es cero.
 */
export function unpad(bytes: Uint8Array): Uint8Array {
  if (bytes.length < LENGTH_PREFIX_BYTES) {
    throw new Error('Relleno inválido.');
  }
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false);
  const end = LENGTH_PREFIX_BYTES + length;
  if (end > bytes.length) {
    throw new Error('Relleno inválido.');
  }
  let nonZero = 0;
  for (let index = end; index < bytes.length; index += 1) {
    nonZero |= bytes[index] ?? 0;
  }
  if (nonZero !== 0) {
    throw new Error('Relleno inválido.');
  }
  return bytes.slice(LENGTH_PREFIX_BYTES, end);
}
