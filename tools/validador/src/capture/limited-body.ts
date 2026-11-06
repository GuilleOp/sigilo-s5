// Lectura en flujo del cuerpo de una respuesta `fetch` con un tope de bytes: un sitio malicioso no
// puede agotar la memoria del validador con una respuesta enorme.

/** Cuerpo leído hasta el tope. */
export interface LimitedBody {
  text: string;
  isTruncated: boolean;
}

/** Lee como mucho `maxBytes` del cuerpo y cancela el resto del flujo. */
export async function readLimitedText(response: Response, maxBytes: number): Promise<LimitedBody> {
  if (response.body === null) return { text: '', isTruncated: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let isTruncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = maxBytes - total;
    if (value.length > room) {
      chunks.push(value.subarray(0, room));
      total += room;
      isTruncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
    total += value.length;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { text: new TextDecoder().decode(bytes), isTruncated };
}
