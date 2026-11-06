// Normalización del identificador que se corrobora y su etiqueta de dominio (ADR 0006, paso 1):
// `sigilo/v1/corroboration/<tipo>:<valor>`. La normalización favorece la precisión: variantes de
// un nombre no coinciden, para no unir a personas distintas.
import { textKey } from '@sigilo/anonimato/normalize';
import type { CorroborationIdentifierKind } from '@sigilo/contracts';
import { utf8Encode } from '@sigilo/core';

/** Identificador que la persona eligió corroborar, tal como lo escribió. */
export type CorroborationIdentifier =
  | { kind: 'servidor'; name: string; entityId: string }
  | { kind: 'rfc'; rfc: string }
  | { kind: 'ocid'; ocid: string };

/** Prefijo de la etiqueta de dominio. */
export const CORROBORATION_LABEL_PREFIX = 'sigilo/v1/corroboration/';

const ENTITY_PATTERN = /^[A-Z0-9][A-Z0-9._|-]{0,63}$/u;
const RFC_PATTERN = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/u;
const OCID_PATTERN = /^OCDS-[A-Z0-9]{6}-[A-Z0-9._/-]{1,200}$/u;
const MIN_NAME_WORDS = 2;

/**
 * Nombre de persona servidora pública con la normalización de `@sigilo/anonimato` (`textKey`):
 * sin acentos ni signos, en mayúsculas, sin palabras vacías y con espacios simples.
 * Lanza error si quedan menos de dos palabras: un solo nombre une a demasiadas personas.
 */
export function normalizePersonName(name: string): string {
  const key = textKey(name);
  if (key.split(' ').filter((word) => word.length > 0).length < MIN_NAME_WORDS) {
    throw new Error('El nombre debe tener al menos nombre y apellido.');
  }
  return key;
}

/** Clave del ente del catálogo en mayúsculas. Lanza error si no tiene la forma de una clave. */
export function normalizeEntityId(entityId: string): string {
  const value = entityId.normalize('NFC').trim().toUpperCase();
  if (!ENTITY_PATTERN.test(value)) throw new Error('La clave del ente no es válida.');
  return value;
}

/**
 * RFC en mayúsculas sin espacios ni guiones. Conserva la Ñ y el &, que forman parte del RFC.
 * Lanza error si no tiene la forma de un RFC de persona moral (12) o física (13).
 */
export function normalizeRfc(rfc: string): string {
  const value = rfc.normalize('NFC').toUpperCase().replace(/[\s-]/gu, '');
  if (!RFC_PATTERN.test(value)) throw new Error('El RFC no es válido.');
  return value;
}

/** `ocid` de OCDS en mayúsculas y sin espacios. Lanza error si no tiene la forma `ocds-xxxxxx-…`. */
export function normalizeOcid(ocid: string): string {
  const value = ocid.normalize('NFC').toUpperCase().replace(/\s/gu, '');
  if (!OCID_PATTERN.test(value))
    throw new Error('El identificador del procedimiento no es válido.');
  return value;
}

/** Valor normalizado del identificador, sin el prefijo de dominio. Lanza error si no es válido. */
export function normalizeIdentifier(identifier: CorroborationIdentifier): string {
  switch (identifier.kind) {
    case 'servidor':
      return `${normalizePersonName(identifier.name)}|${normalizeEntityId(identifier.entityId)}`;
    case 'rfc':
      return normalizeRfc(identifier.rfc);
    case 'ocid':
      return normalizeOcid(identifier.ocid);
  }
}

/** Etiqueta de dominio en texto: `sigilo/v1/corroboration/<tipo>:<valor normalizado>`. */
export function corroborationLabel(identifier: CorroborationIdentifier): string {
  const kind: CorroborationIdentifierKind = identifier.kind;
  return `${CORROBORATION_LABEL_PREFIX}${kind}:${normalizeIdentifier(identifier)}`;
}

/**
 * Entrada privada del VOPRF: la etiqueta de dominio en UTF-8.
 * Seguridad: el tipo forma parte de la entrada, así que un RFC y un `ocid` con el mismo texto
 * dan etiquetas distintas.
 */
export function corroborationInput(identifier: CorroborationIdentifier): Uint8Array {
  return utf8Encode(corroborationLabel(identifier));
}
