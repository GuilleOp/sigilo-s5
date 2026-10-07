// Forma canónica JSON (subconjunto de RFC 8785) usada para hashes y firmas, y SHA-256 en hexadecimal.
import { sha256 } from '@noble/hashes/sha2.js';
import { toHex, utf8Encode } from './encoding.ts';

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function serialize(value: unknown, ancestors: Set<object>): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'string':
      return JSON.stringify(value);
    case 'number':
      // Seguridad: solo enteros seguros, para que la forma canónica se reproduzca igual en
      // cualquier lenguaje (sin reglas de serialización de decimales ni pérdida de precisión).
      if (!Number.isSafeInteger(value)) {
        throw new Error('La forma canónica solo admite enteros seguros.');
      }
      return JSON.stringify(value);
    case 'object':
      break;
    default:
      throw new Error(`La forma canónica no admite valores de tipo ${typeof value}.`);
  }
  if (ancestors.has(value)) {
    throw new Error('La forma canónica no admite referencias circulares.');
  }
  ancestors.add(value);
  let output: string;
  if (Array.isArray(value)) {
    const items: string[] = [];
    for (const item of value as unknown[]) {
      if (item === undefined) {
        throw new Error('La forma canónica no admite elementos undefined en arreglos.');
      }
      items.push(serialize(item, ancestors));
    }
    output = `[${items.join(',')}]`;
  } else if (isPlainObject(value)) {
    // El orden por defecto de `sort` compara unidades de código UTF-16, como exige RFC 8785.
    const keys = Object.keys(value).sort();
    const members: string[] = [];
    for (const key of keys) {
      const member = value[key];
      if (member === undefined) continue;
      members.push(`${JSON.stringify(key)}:${serialize(member, ancestors)}`);
    }
    output = `{${members.join(',')}}`;
  } else {
    throw new Error('La forma canónica solo admite objetos planos.');
  }
  ancestors.delete(value);
  return output;
}

/**
 * Serializa un valor JSON con llaves ordenadas por unidades de código UTF-16 y sin espacios.
 * Admite null, booleanos, cadenas, enteros seguros (`Number.isSafeInteger`), arreglos y objetos
 * planos; omite propiedades `undefined`. Lanza error con cualquier otro tipo, con decimales o
 * enteros fuera del rango seguro y con referencias circulares.
 */
export function canonicalize(value: unknown): string {
  return serialize(value, new Set());
}

/** SHA-256 en hexadecimal minúsculo; las cadenas se codifican en UTF-8. */
export function sha256Hex(data: Uint8Array | string): string {
  return toHex(sha256(typeof data === 'string' ? utf8Encode(data) : data));
}
