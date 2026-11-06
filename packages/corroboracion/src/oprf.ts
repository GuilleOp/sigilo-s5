// VOPRF de RFC 9497 (ristretto255-SHA512, modo 0x01) con `ristretto255_oprf` de @noble/curves:
// el navegador ciega, verifica la prueba DLEQ contra la llave publicada y deriva la etiqueta; el
// evaluador evalúa elementos cegados. Funciones puras, para navegador y Node.
import { ristretto255_oprf } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import {
  CORROBORATION_OPRF_SUITE,
  CorroborationEvaluationResponseSchema,
  CorroborationEvaluatorKeySchema,
} from '@sigilo/contracts';
import type {
  AuthorityDirectory,
  CorroborationEvaluationRequest,
  CorroborationEvaluationResponse,
  CorroborationEvaluatorKey,
} from '@sigilo/contracts';
import { fromBase64Url, keyIdFor, toBase64Url, toHex, utf8Encode } from '@sigilo/core';
import { corroborationInput } from './identifier.ts';
import type { CorroborationIdentifier } from './identifier.ts';

/** Generador de bytes aleatorios; solo las pruebas lo cambian (vectores de RFC 9497). */
export type RandomSource = (length?: number) => Uint8Array;

const voprf = ristretto255_oprf.voprf;
const PROOF_ERROR = 'La prueba del evaluador no es válida; no se usa su respuesta.';
const TAG_INFO = 'sigilo/v1/corroboration/tag';
const SIMILARITY_INFO = 'sigilo/v1/corroboration/similarity';
const DERIVED_LENGTH = 32;

/** Par de llaves del evaluador en bytes crudos (escalar y elemento de 32 bytes). */
export interface EvaluatorKeyPair {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
}

/** Genera un par de llaves VOPRF nuevo para el evaluador. */
export function generateEvaluatorKeyPair(): EvaluatorKeyPair {
  return voprf.generateKeyPair();
}

/**
 * Deriva el par de llaves de una semilla de 32 bytes (RFC 9497, sección 3.2.1). Permite
 * respaldar solo la semilla. Lanza error si la semilla no mide 32 bytes.
 */
export function deriveEvaluatorKeyPair(seed: Uint8Array, keyInfo: Uint8Array): EvaluatorKeyPair {
  return voprf.deriveKeyPair(seed, keyInfo);
}

/**
 * Evalúa un elemento cegado y produce la prueba DLEQ (lado del evaluador). Lanza error si el
 * elemento no es un punto ristretto255 válido o es la identidad (RFC 9497, sección 3.3).
 * Seguridad: el evaluador solo ve `blinded`, que es un punto uniforme sin relación visible con
 * el identificador.
 */
export function evaluateBlinded(
  keyPair: EvaluatorKeyPair,
  blinded: Uint8Array,
  rng?: RandomSource,
): { evaluated: Uint8Array; proof: Uint8Array } {
  return rng === undefined
    ? voprf.blindEvaluate(keyPair.secretKey, keyPair.publicKey, blinded)
    : voprf.blindEvaluate(keyPair.secretKey, keyPair.publicKey, blinded, rng);
}

/** Estado que el navegador conserva entre la petición y la respuesta. Nunca sale del navegador. */
export interface BlindedCorroboration {
  input: Uint8Array;
  blind: Uint8Array;
  blinded: Uint8Array;
  request: CorroborationEvaluationRequest;
}

/** Etiqueta y llave de similitud de una denuncia. */
export interface CorroborationKeys {
  epoch: number;
  /** Etiqueta en hexadecimal: lo que ve el índice. */
  tag: string;
  /** Llave del resumen difuso; nunca sale del navegador. */
  similarityKey: Uint8Array;
}

/**
 * Comprueba la llave del evaluador: suite, formato y que `keyId` corresponda a la llave pública.
 * Lanza error si algo no cuadra.
 */
export function assertEvaluatorKey(key: CorroborationEvaluatorKey): CorroborationEvaluatorKey {
  const parsed = CorroborationEvaluatorKeySchema.parse(key);
  const publicKey = fromBase64Url(parsed.publicKey);
  if (publicKey.length !== 32 || keyIdFor(publicKey) !== parsed.keyId) {
    throw new Error('La llave del evaluador no corresponde a su identificador.');
  }
  return parsed;
}

/**
 * Llave del evaluador publicada en el directorio, o `null` si la red no ofrece corroboración.
 * Seguridad: el directorio debe estar ya verificado (firma y cofirmas m de n); así una llave
 * distinta por persona sería visible para todos.
 */
export function evaluatorKeyFromDirectory(
  directory: AuthorityDirectory,
): CorroborationEvaluatorKey | null {
  const corroboration = directory.corroboration;
  return corroboration === undefined ? null : assertEvaluatorKey(corroboration.evaluator);
}

/**
 * Ciega el identificador para pedir su evaluación. Lanza error si el identificador no es válido.
 * `rng` solo se usa en pruebas.
 */
export function blindCorroboration(
  identifier: CorroborationIdentifier,
  key: CorroborationEvaluatorKey,
  rng?: RandomSource,
): BlindedCorroboration {
  return blindInput(corroborationInput(identifier), key, rng);
}

/** Igual que `blindCorroboration`, con la entrada en bytes. */
export function blindInput(
  input: Uint8Array,
  key: CorroborationEvaluatorKey,
  rng?: RandomSource,
): BlindedCorroboration {
  const checked = assertEvaluatorKey(key);
  const { blind, blinded } = rng === undefined ? voprf.blind(input) : voprf.blind(input, rng);
  return {
    input,
    blind,
    blinded,
    request: { v: 1, keyId: checked.keyId, blinded: toBase64Url(blinded) },
  };
}

/**
 * Verifica la respuesta del evaluador y devuelve la salida VOPRF de 64 bytes.
 * Seguridad: rechaza una respuesta con otra suite, época o llave, y una prueba DLEQ que no
 * corresponda a la llave publicada; así el evaluador no puede marcar a una persona con una llave
 * propia. Lanza error en cualquiera de esos casos.
 */
export function finalizeEvaluation(
  state: BlindedCorroboration,
  response: CorroborationEvaluationResponse,
  key: CorroborationEvaluatorKey,
): Uint8Array {
  const checked = assertEvaluatorKey(key);
  const parsed = CorroborationEvaluationResponseSchema.safeParse(response);
  if (
    !parsed.success ||
    parsed.data.suite !== CORROBORATION_OPRF_SUITE ||
    parsed.data.keyId !== checked.keyId ||
    parsed.data.epoch !== checked.epoch
  ) {
    throw new Error(PROOF_ERROR);
  }
  try {
    return voprf.finalize(
      state.input,
      state.blind,
      fromBase64Url(parsed.data.evaluated),
      state.blinded,
      fromBase64Url(checked.publicKey),
      fromBase64Url(parsed.data.proof),
    );
  } catch {
    throw new Error(PROOF_ERROR);
  }
}

/**
 * Deriva de la salida VOPRF la etiqueta (para el índice) y la llave de similitud (solo para el
 * navegador) con HKDF-SHA256 y contextos distintos.
 * Seguridad: el índice conoce la etiqueta pero no puede obtener de ella la llave de similitud.
 */
export function deriveCorroborationKeys(output: Uint8Array, epoch: number): CorroborationKeys {
  if (output.length !== 64) throw new Error('La salida del evaluador debe medir 64 bytes.');
  const empty = new Uint8Array(0);
  return {
    epoch,
    tag: toHex(hkdf(sha256, output, empty, utf8Encode(TAG_INFO), DERIVED_LENGTH)),
    similarityKey: hkdf(sha256, output, empty, utf8Encode(SIMILARITY_INFO), DERIVED_LENGTH),
  };
}

/** `finalizeEvaluation` seguido de `deriveCorroborationKeys`. Lanza error si la prueba falla. */
export function finalizeCorroboration(
  state: BlindedCorroboration,
  response: CorroborationEvaluationResponse,
  key: CorroborationEvaluatorKey,
): CorroborationKeys {
  return deriveCorroborationKeys(finalizeEvaluation(state, response, key), key.epoch);
}
