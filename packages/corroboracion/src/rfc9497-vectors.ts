// Vectores oficiales de RFC 9497, apéndice A.1.2 (ristretto255-SHA512, modo VOPRF), copiados del
// texto publicado en rfc-editor.org (SHA-256 del .txt: 95160517…a560432). Solo para las pruebas.

/** Llaves del modo VOPRF: `DeriveKeyPair(Seed, KeyInfo)`. */
export const RFC9497_VOPRF_KEYS = {
  seed: 'a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3',
  keyInfo: '74657374206b6579',
  skSm: 'e6f73f344b79b379f1a0dd37e07ff62e38d9f71345ce62ae3a9bc60b04ccd909',
  pkSm: 'c803e2cc6b05fc15064549b5920659ca4a77b2cca6f04f6b357009335476ad4e',
} as const;

/** Un vector de tamaño de lote 1. */
export interface Rfc9497Vector {
  section: string;
  input: string;
  blind: string;
  blindedElement: string;
  evaluationElement: string;
  proof: string;
  proofRandomScalar: string;
  output: string;
}

/** A.1.2.1 y A.1.2.2 (lote de 1). */
export const RFC9497_VOPRF_VECTORS: readonly Rfc9497Vector[] = [
  {
    section: 'A.1.2.1',
    input: '00',
    blind: '64d37aed22a27f5191de1c1d69fadb899d8862b58eb4220029e036ec4c1f6706',
    blindedElement: '863f330cc1a1259ed5a5998a23acfd37fb4351a793a5b3c090b642ddc439b945',
    evaluationElement: 'aa8fa048764d5623868679402ff6108d2521884fa138cd7f9c7669a9a014267e',
    proof:
      'ddef93772692e535d1a53903db24367355cc2cc78de93b3be5a8ffcc6985dd06' +
      '6d4346421d17bf5117a2a1ff0fcb2a759f58a539dfbe857a40bce4cf49ec600d',
    proofRandomScalar: '222a5e897cf59db8145db8d16e597e8facb80ae7d4e26d9881aa6f61d645fc0e',
    output:
      'b58cfbe118e0cb94d79b5fd6a6dafb98764dff49c14e1770b566e42402da1a7d' +
      'a4d8527693914139caee5bd03903af43a491351d23b430948dd50cde10d32b3c',
  },
  {
    section: 'A.1.2.2',
    input: '5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a',
    blind: '64d37aed22a27f5191de1c1d69fadb899d8862b58eb4220029e036ec4c1f6706',
    blindedElement: 'cc0b2a350101881d8a4cba4c80241d74fb7dcbfde4a61fde2f91443c2bf9ef0c',
    evaluationElement: '60a59a57208d48aca71e9e850d22674b611f752bed48b36f7a91b372bd7ad468',
    proof:
      '401a0da6264f8cf45bb2f5264bc31e109155600babb3cd4e5af7d181a2c9dc0a' +
      '67154fabf031fd936051dec80b0b6ae29c9503493dde7393b722eafdf5a50b02',
    proofRandomScalar: '222a5e897cf59db8145db8d16e597e8facb80ae7d4e26d9881aa6f61d645fc0e',
    output:
      '8a9a2f3c7f085b65933594309041fc1898d42d0858e59f90814ae90571a6df60' +
      '356f4610bf816f27afdd84f47719e480906d27ecd994985890e5f539e7ea74b6',
  },
];

/** A.1.2.3 (lote de 2): una sola prueba DLEQ para las dos evaluaciones. */
export const RFC9497_VOPRF_BATCH = {
  section: 'A.1.2.3',
  inputs: ['00', '5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a'],
  blinds: [
    '64d37aed22a27f5191de1c1d69fadb899d8862b58eb4220029e036ec4c1f6706',
    '222a5e897cf59db8145db8d16e597e8facb80ae7d4e26d9881aa6f61d645fc0e',
  ],
  blindedElements: [
    '863f330cc1a1259ed5a5998a23acfd37fb4351a793a5b3c090b642ddc439b945',
    '90a0145ea9da29254c3a56be4fe185465ebb3bf2a1801f7124bbbadac751e654',
  ],
  evaluationElements: [
    'aa8fa048764d5623868679402ff6108d2521884fa138cd7f9c7669a9a014267e',
    'cc5ac221950a49ceaa73c8db41b82c20372a4c8d63e5dded2db920b7eee36a2a',
  ],
  proof:
    'cc203910175d786927eeb44ea847328047892ddf8590e723c37205cb74600b0a' +
    '5ab5337c8eb4ceae0494c2cf89529dcf94572ed267473d567aeed6ab873dee08',
  proofRandomScalar: '419c4f4f5052c53c45f3da494d2b67b220d02118e0857cdbcf037f9ea84bbe0c',
  outputs: [
    'b58cfbe118e0cb94d79b5fd6a6dafb98764dff49c14e1770b566e42402da1a7d' +
      'a4d8527693914139caee5bd03903af43a491351d23b430948dd50cde10d32b3c',
    '8a9a2f3c7f085b65933594309041fc1898d42d0858e59f90814ae90571a6df60' +
      '356f4610bf816f27afdd84f47719e480906d27ecd994985890e5f539e7ea74b6',
  ],
} as const;

/**
 * Generador que hace que `RandomScalar()` de @noble/curves devuelva exactamente `scalarHex`
 * (escalar en little-endian): la biblioteca reduce 48 bytes con `x mod (n − 1) + 1`, así que se
 * le entregan los bytes de `escalar − 1`. Solo sirve para reproducir los vectores.
 */
export function fixedScalarSource(scalarHex: string): (length?: number) => Uint8Array {
  let value = 0n;
  const bytes = scalarHex.match(/../gu) ?? [];
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    value = (value << 8n) | BigInt(Number.parseInt(bytes[index] ?? '00', 16));
  }
  return (length = 48) => {
    let remaining = value - 1n;
    const out = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) {
      out[index] = Number(remaining & 0xffn);
      remaining >>= 8n;
    }
    return out;
  };
}
