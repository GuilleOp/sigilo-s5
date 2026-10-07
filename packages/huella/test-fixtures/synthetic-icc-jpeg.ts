// Generador byte a byte de un JPEG mínimo con un perfil de color ICC sintético en APP2.
// Imita la forma de los perfiles sRGB que agregan los navegadores, sin copiar perfiles reales.

/** Etiqueta de texto del perfil. `mluc` (ICC v4), `desc` (v2) o `text`. */
export interface SyntheticIccText {
  signature: string;
  type: 'mluc' | 'desc' | 'text';
  text: string;
}

/** Descripción del perfil sintético. Los campos omitidos toman valores de un perfil sRGB. */
export interface SyntheticIccProfile {
  version?: readonly [number, number];
  profileClass?: string;
  colorSpace?: string;
  connectionSpace?: string;
  texts: readonly SyntheticIccText[];
}

const ascii = (text: string): number[] => [...text].map((character) => character.charCodeAt(0));

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function u16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

/** Firma de 4 bytes rellenada con espacios, como en el formato ICC. */
function signature(text: string): number[] {
  return ascii(text.padEnd(4, ' ').slice(0, 4));
}

function encodeText({ type, text }: SyntheticIccText): number[] {
  if (type === 'text') return [...signature('text'), ...u32(0), ...ascii(text), 0];
  if (type === 'desc') {
    // ASCII con terminador, luego los campos Unicode y ScriptCode vacíos (4 + 4 + 2 + 1 + 67).
    return [
      ...signature('desc'),
      ...u32(0),
      ...u32(text.length + 1),
      ...ascii(text),
      0,
      ...new Array<number>(78).fill(0),
    ];
  }
  const utf16 = [...text].flatMap((character) => u16(character.charCodeAt(0)));
  return [
    ...signature('mluc'),
    ...u32(0),
    ...u32(1),
    ...u32(12),
    ...ascii('enUS'),
    ...u32(utf16.length),
    ...u32(28),
    ...utf16,
  ];
}

// Punto blanco D50 en s15Fixed16: los valores no importan para la prueba, solo el tipo.
const WHITE_POINT = [
  ...signature('XYZ '),
  ...u32(0),
  ...u32(0xf6d6),
  ...u32(0x10000),
  ...u32(0xd32d),
];
// Curva de tono con una sola gamma (2.2 en u8Fixed8).
const GAMMA_CURVE = [...signature('curv'), ...u32(0), ...u32(1), ...u16(0x0233), 0, 0];

/** Construye los bytes del perfil ICC. */
export function buildSyntheticIccProfile(profile: SyntheticIccProfile): number[] {
  const tags: { signature: string; data: number[] }[] = [
    ...profile.texts.map((text) => ({ signature: text.signature, data: encodeText(text) })),
    { signature: 'wtpt', data: WHITE_POINT },
    { signature: 'rTRC', data: GAMMA_CURVE },
  ];
  const tableSize = 4 + tags.length * 12;
  let offset = 128 + tableSize;
  const table: number[] = [...u32(tags.length)];
  const data: number[] = [];
  for (const tag of tags) {
    const padded = [...tag.data, ...new Array<number>((4 - (tag.data.length % 4)) % 4).fill(0)];
    table.push(...signature(tag.signature), ...u32(offset), ...u32(tag.data.length));
    data.push(...padded);
    offset += padded.length;
  }
  const [major, minor] = profile.version ?? [4, 3];
  const header = [
    ...u32(offset),
    ...u32(0),
    major,
    minor << 4,
    0,
    0,
    ...signature(profile.profileClass ?? 'mntr'),
    ...signature(profile.colorSpace ?? 'RGB '),
    ...signature(profile.connectionSpace ?? 'XYZ '),
    // Fecha 2016-01-01 00:00:00.
    ...u16(2016),
    ...u16(1),
    ...u16(1),
    ...u16(0),
    ...u16(0),
    ...u16(0),
    ...signature('acsp'),
    ...new Array<number>(128 - 40).fill(0),
  ];
  return [...header, ...table, ...data];
}

/** JPEG mínimo (SOI + APP2 «ICC_PROFILE» + EOI) con el perfil indicado. */
export function buildSyntheticIccJpeg(profile: SyntheticIccProfile): Uint8Array<ArrayBuffer> {
  const icc = buildSyntheticIccProfile(profile);
  const payload = [...ascii('ICC_PROFILE'), 0, 1, 1, ...icc];
  const length = payload.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe2, ...u16(length), ...payload, 0xff, 0xd9]);
}
