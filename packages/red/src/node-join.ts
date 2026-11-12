// Alta de un nodo en la red sin secretos que viajen (docs/instalacion-nodo.md, ADR 0011):
// - el paquete de la red (`red.json`), que firma la operación: raíz de confianza, ventanilla y la
//   llave de enlace de la SESNA;
// - la solicitud de alta de un nodo, que firma el propio nodo (prueba de posesión de su llave) y
//   se confirma con una huella leída por teléfono;
// - la rotación de la llave de enlace de un nodo, también firmada por el nodo;
// - los secretos compartidos (HMAC del buzón y secreto OAuth), que cada lado deriva con X25519 y
//   HKDF entre su llave de enlace y la del otro: nunca se transmiten.
// Todo es puro y vale en el navegador y en Node.
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { z } from 'zod';
import {
  Base64UrlSchema,
  DayDateSchema,
  DirectoryAuthoritySchema,
  DirectoryNodeSchema,
  KeyIdSchema,
  NetworkTrustAnchorSchema,
  NodeIdSchema,
  ObserverIdSchema,
  ObserverKindSchema,
  SignedFunctionTableSchema,
  WitnessSignatureSchema,
} from '@sigilo/contracts';
import type { NetworkTrustAnchor } from '@sigilo/contracts';
import {
  canonicalize,
  fromBase64Url,
  groupsOfFour,
  sha256Hex,
  toBase64Url,
  utf8Encode,
} from '@sigilo/core';
import { verifyFunctionTableSignature } from './function-table.ts';
import { keyIdMatches, signWithDomain, verifyWithDomain } from './signatures.ts';

/** Dominio de la firma de la operación sobre el paquete de la red. */
export const NETWORK_PACKAGE_DOMAIN = 'sigilo/red/paquete/v1:';
/** Dominio de la firma del nodo sobre su solicitud de alta. */
export const NODE_JOIN_DOMAIN = 'sigilo/red/solicitud-alta/v1:';
/** Dominio de la firma del nodo sobre la rotación de su llave de enlace. */
export const LINK_ROTATION_DOMAIN = 'sigilo/red/rotacion-enlace/v1:';
/** Sal de la derivación de los secretos de enlace. */
export const LINK_SECRET_SALT = 'sigilo/enlace/v1';
/** Bytes de cada secreto derivado. */
export const LINK_SECRET_BYTES = 32;
/** Caracteres hexadecimales de las huellas de la red y de los nodos (128 bits). */
export const LONG_FINGERPRINT_HEX = 32;

const VersionSchema = z.string().regex(/^\d{1,6}\.\d{1,6}\.\d{1,6}$/u, 'Versión inválida');
const OriginSchema = z.string().regex(/^https?:\/\/[^\s/?#]+$/u, 'Origen inválido');

/** Llave pública X25519 de enlace (la del nodo lleva su época). */
export const LinkPublicKeySchema = z
  .object({ keyId: KeyIdSchema, boxPublicKey: Base64UrlSchema })
  .strict();
export const NodeLinkKeySchema = LinkPublicKeySchema.extend({
  epoca: z.number().int().min(1).max(1_000_000),
}).strict();
export type NodeLinkKey = z.infer<typeof NodeLinkKeySchema>;

/** Contenido firmado de `red.json`. */
export const NetworkPackageBodySchema = z
  .object({
    tipo: z.literal('sigilo/paquete-de-red'),
    v: z.literal(1),
    nombre: z.string().min(1).max(200),
    ventanillaUrl: OriginSchema,
    trust: NetworkTrustAnchorSchema,
    enlace: LinkPublicKeySchema,
    indiceUrl: OriginSchema.optional(),
    versionMinima: VersionSchema.optional(),
    emitido: DayDateSchema,
  })
  .strict();
export type NetworkPackageBody = z.infer<typeof NetworkPackageBodySchema>;

export const NetworkPackageSchema = NetworkPackageBodySchema.extend({
  firma: Base64UrlSchema,
}).strict();
export type NetworkPackage = z.infer<typeof NetworkPackageSchema>;

/** Contacto institucional de una solicitud: va al expediente de altas, nunca al directorio. */
export const JoinContactSchema = z
  .object({
    institucion: z.string().min(1).max(300),
    responsable: z.string().min(1).max(200),
    cargo: z.string().min(1).max(200),
    correo: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/u, 'Correo inválido'),
    telefono: z.string().regex(/^\d{10}$/u, 'Teléfono de 10 dígitos'),
  })
  .strict();
export type JoinContact = z.infer<typeof JoinContactSchema>;

/** Contenido firmado de la solicitud de alta de un nodo. */
export const NodeJoinRequestBodySchema = z
  .object({
    tipo: z.literal('sigilo/solicitud-alta-nodo'),
    v: z.literal(1),
    creada: DayDateSchema,
    software: VersionSchema,
    nodo: DirectoryNodeSchema,
    buzon: DirectoryAuthoritySchema,
    tablaDeFunciones: SignedFunctionTableSchema,
    enlace: NodeLinkKeySchema,
    contacto: JoinContactSchema,
  })
  .strict();
export type NodeJoinRequestBody = z.infer<typeof NodeJoinRequestBodySchema>;

export const NodeJoinRequestSchema = NodeJoinRequestBodySchema.extend({
  firma: Base64UrlSchema,
}).strict();
export type NodeJoinRequest = z.infer<typeof NodeJoinRequestSchema>;

/** Contenido firmado de la rotación de la llave de enlace de un nodo. */
export const LinkRotationBodySchema = z
  .object({
    tipo: z.literal('sigilo/rotacion-enlace'),
    v: z.literal(1),
    nodeId: NodeIdSchema,
    creada: DayDateSchema,
    enlace: NodeLinkKeySchema,
  })
  .strict();
export type LinkRotationBody = z.infer<typeof LinkRotationBodySchema>;

export const LinkRotationSchema = LinkRotationBodySchema.extend({
  firma: Base64UrlSchema,
}).strict();
export type LinkRotation = z.infer<typeof LinkRotationSchema>;

/** Tabla de funciones nueva de un nodo (la firma el nodo dentro de `tabla`). */
export const FunctionTableUpdateSchema = z
  .object({
    tipo: z.literal('sigilo/tabla-de-funciones'),
    v: z.literal(1),
    tabla: SignedFunctionTableSchema,
  })
  .strict();
export type FunctionTableUpdate = z.infer<typeof FunctionTableUpdateSchema>;

/** Parte pública de un testigo: la entrega a la SESNA para el directorio. */
export const WitnessPublicFileSchema = z
  .object({
    tipo: z.literal('sigilo/testigo'),
    v: z.literal(1),
    id: ObserverIdSchema,
    nombre: z.string().min(1).max(300),
    clase: ObserverKindSchema,
    signingKeyId: KeyIdSchema,
    signingPublicKey: Base64UrlSchema,
  })
  .strict();
export type WitnessPublicFile = z.infer<typeof WitnessPublicFileSchema>;

/** Cofirma de un testigo sobre una versión propuesta del directorio. */
export const DirectoryCosignatureFileSchema = z
  .object({
    tipo: z.literal('sigilo/cofirma-directorio'),
    v: z.literal(1),
    serial: z.number().int().min(1),
    digest: z.string().regex(/^[0-9a-f]{64}$/u),
    cofirma: WitnessSignatureSchema,
  })
  .strict();
export type DirectoryCosignatureFile = z.infer<typeof DirectoryCosignatureFileSchema>;

function bodyDigest(body: unknown): string {
  return sha256Hex(canonicalize(body));
}

function withoutSignature<T extends { firma: string }>(value: T): Omit<T, 'firma'> {
  const body: Partial<T> = { ...value };
  delete body.firma;
  return body as Omit<T, 'firma'>;
}

/** Firma el paquete de la red con la llave de la operación. */
export function signNetworkPackage(
  body: NetworkPackageBody,
  operatorPrivateKey: Uint8Array,
): NetworkPackage {
  const parsed = NetworkPackageBodySchema.parse(body);
  return {
    ...parsed,
    firma: signWithDomain(NETWORK_PACKAGE_DOMAIN, bodyDigest(parsed), operatorPrivateKey),
  };
}

/**
 * Valida el paquete de la red y su firma con la llave de la operación que él mismo trae. Devuelve
 * el paquete o `null`. Seguridad: la firma solo prueba integridad; la autenticidad la da la huella
 * de la red, que la persona compara con la del oficio de la SESNA.
 */
export function verifyNetworkPackage(raw: unknown): NetworkPackage | null {
  const parsed = NetworkPackageSchema.safeParse(raw);
  if (!parsed.success) return null;
  const pkg = parsed.data;
  if (!keyIdMatches(pkg.trust.operatorKeyId, pkg.trust.operatorSigningPublicKey)) return null;
  if (!keyIdMatches(pkg.enlace.keyId, pkg.enlace.boxPublicKey)) return null;
  const isSigned = verifyWithDomain(
    NETWORK_PACKAGE_DOMAIN,
    bodyDigest(withoutSignature(pkg)),
    pkg.firma,
    pkg.trust.operatorSigningPublicKey,
  );
  return isSigned ? pkg : null;
}

/**
 * Huella de la red: SHA-256 de la forma canónica de la raíz de confianza (sin los campos de
 * frescura, que cambian con el tiempo), 32 caracteres hexadecimales en grupos de 4.
 */
export function networkFingerprint(trust: NetworkTrustAnchor): string {
  const fixed: Partial<NetworkTrustAnchor> = { ...trust };
  delete fixed.minDirectorySerial;
  delete fixed.maxDirectoryAgeDays;
  return groupsOfFour(sha256Hex(canonicalize(fixed)).slice(0, LONG_FINGERPRINT_HEX));
}

/** Firma la solicitud de alta con la llave de firma del nodo (la de `nodo.signingPublicKey`). */
export function signJoinRequest(
  body: NodeJoinRequestBody,
  nodeSigningPrivateKey: Uint8Array,
): NodeJoinRequest {
  const parsed = NodeJoinRequestBodySchema.parse(body);
  return {
    ...parsed,
    firma: signWithDomain(NODE_JOIN_DOMAIN, bodyDigest(parsed), nodeSigningPrivateKey),
  };
}

/** Resultado de revisar una solicitud de alta. */
export type JoinRequestCheck =
  { valid: true; request: NodeJoinRequest } | { valid: false; problems: string[] };

/** Opciones de la revisión de una solicitud. */
export interface JoinRequestCheckOptions {
  /** Acepta un `baseUrl` con `http://` (solo pruebas y redes privadas cifradas). */
  allowHttp?: boolean;
}

/**
 * Revisa una solicitud de alta: formato, firma del nodo, que cada `keyId` corresponda a su llave,
 * que el buzón sea del nodo y tenga papel `inbox`, que la tabla de funciones sea del nodo, de la
 * misma entidad que el buzón y esté firmada por él, y que el nodo se publique con https.
 */
export function verifyJoinRequest(
  raw: unknown,
  options: JoinRequestCheckOptions = {},
): JoinRequestCheck {
  const parsed = NodeJoinRequestSchema.safeParse(raw);
  if (!parsed.success) return { valid: false, problems: ['La solicitud no tiene el formato.'] };
  const request = parsed.data;
  const { nodo, buzon, tablaDeFunciones, enlace } = request;
  const problems: string[] = [];
  const isSigned = verifyWithDomain(
    NODE_JOIN_DOMAIN,
    bodyDigest(withoutSignature(request)),
    request.firma,
    nodo.signingPublicKey,
  );
  if (!isSigned) problems.push('La firma no es la de la llave del nodo.');
  if (!keyIdMatches(nodo.boxKeyId, nodo.boxPublicKey)) {
    problems.push('La llave de cifrado del nodo no corresponde a su identificador.');
  }
  if (!keyIdMatches(nodo.signingKeyId, nodo.signingPublicKey)) {
    problems.push('La llave de firma del nodo no corresponde a su identificador.');
  }
  if (!keyIdMatches(buzon.keyId, buzon.boxPublicKey)) {
    problems.push('La llave del buzón no corresponde a su identificador.');
  }
  if (!keyIdMatches(enlace.keyId, enlace.boxPublicKey)) {
    problems.push('La llave de enlace no corresponde a su identificador.');
  }
  if (buzon.nodeId !== nodo.id) problems.push('El buzón es de otro nodo.');
  if (buzon.role !== 'inbox') problems.push('La autoridad de la solicitud no es un buzón general.');
  if (tablaDeFunciones.table.nodeId !== nodo.id) problems.push('La tabla es de otro nodo.');
  if (tablaDeFunciones.table.stateCode !== buzon.stateCode) {
    problems.push('La tabla y el buzón son de entidades distintas.');
  }
  if (!verifyFunctionTableSignature(tablaDeFunciones, nodo)) {
    problems.push('La tabla de funciones no tiene la firma del nodo.');
  }
  if (!nodo.baseUrl.startsWith('https://') && options.allowHttp !== true) {
    problems.push('El nodo debe publicarse con https://.');
  }
  return problems.length === 0 ? { valid: true, request } : { valid: false, problems };
}

/**
 * Huella del nodo: SHA-256 de su llave de firma, su llave de red y su llave de enlace (los bytes,
 * en ese orden), 32 caracteres hexadecimales en grupos de 4. La lee el estado por teléfono.
 */
export function nodeFingerprint(keys: {
  signingPublicKey: string;
  boxPublicKey: string;
  linkPublicKey: string;
}): string {
  const parts = [keys.signingPublicKey, keys.boxPublicKey, keys.linkPublicKey].map(fromBase64Url);
  const joined = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return groupsOfFour(sha256Hex(joined).slice(0, LONG_FINGERPRINT_HEX));
}

/** Huella de una solicitud de alta (la del nodo que la firma). */
export function joinRequestFingerprint(request: NodeJoinRequest): string {
  return nodeFingerprint({
    signingPublicKey: request.nodo.signingPublicKey,
    boxPublicKey: request.nodo.boxPublicKey,
    linkPublicKey: request.enlace.boxPublicKey,
  });
}

/** Compara dos huellas sin importar espacios ni mayúsculas. */
export function sameFingerprint(left: string, right: string): boolean {
  const normalize = (value: string): string => value.replace(/\s+/gu, '').toLowerCase();
  return normalize(left) !== '' && normalize(left) === normalize(right);
}

/** Firma la rotación de la llave de enlace con la llave de firma del nodo. */
export function signLinkRotation(
  body: LinkRotationBody,
  nodeSigningPrivateKey: Uint8Array,
): LinkRotation {
  const parsed = LinkRotationBodySchema.parse(body);
  return {
    ...parsed,
    firma: signWithDomain(LINK_ROTATION_DOMAIN, bodyDigest(parsed), nodeSigningPrivateKey),
  };
}

/** Valida una rotación contra la llave de firma del nodo en el directorio. Devuelve `null` si no. */
export function verifyLinkRotation(raw: unknown, signingPublicKey: string): LinkRotation | null {
  const parsed = LinkRotationSchema.safeParse(raw);
  if (!parsed.success) return null;
  const rotation = parsed.data;
  if (!keyIdMatches(rotation.enlace.keyId, rotation.enlace.boxPublicKey)) return null;
  const isSigned = verifyWithDomain(
    LINK_ROTATION_DOMAIN,
    bodyDigest(withoutSignature(rotation)),
    rotation.firma,
    signingPublicKey,
  );
  return isSigned ? rotation : null;
}

/** Secretos compartidos de un nodo con la SESNA, derivados en ambos lados. */
export interface LinkSecrets {
  /** Secreto HMAC del buzón (`relay-secret.json` y `relay-secrets.json`), en Base64URL. */
  relaySecret: string;
  /** Secreto del cliente OAuth de la SESNA en el nodo, en Base64URL. */
  oauthClientSecret: string;
}

/**
 * Deriva los secretos de enlace de un nodo: `ss = X25519(privada propia, pública del otro)` y cada
 * secreto es `HKDF-SHA256(ss, sal "sigilo/enlace/v1", info "<uso>|<nodeId>|<época>", 32)`. El nodo
 * usa su privada de enlace y la pública de la SESNA; la SESNA, la suya y la del nodo: el resultado
 * es el mismo. Lanza error si una llave no mide 32 bytes o el secreto común es nulo.
 * Seguridad: nada secreto viaja ni se dicta; la época separa cada rotación.
 */
export function deriveLinkSecrets(options: {
  ownPrivateKey: Uint8Array;
  peerPublicKey: Uint8Array;
  nodeId: string;
  epoch: number;
}): LinkSecrets {
  const { ownPrivateKey, peerPublicKey, nodeId, epoch } = options;
  if (ownPrivateKey.length !== 32 || peerPublicKey.length !== 32) {
    throw new Error('Las llaves de enlace deben medir 32 bytes.');
  }
  if (!NodeIdSchema.safeParse(nodeId).success || !Number.isInteger(epoch) || epoch < 1) {
    throw new Error('Nodo o época de enlace inválidos.');
  }
  const shared = x25519.getSharedSecret(ownPrivateKey, peerPublicKey);
  if (shared.every((byte) => byte === 0)) throw new Error('Llave de enlace inválida.');
  const derive = (use: string): string =>
    toBase64Url(
      hkdf(
        sha256,
        shared,
        utf8Encode(LINK_SECRET_SALT),
        utf8Encode(`${use}|${nodeId}|${epoch}`),
        LINK_SECRET_BYTES,
      ),
    );
  try {
    return { relaySecret: derive('relay'), oauthClientSecret: derive('oauth') };
  } finally {
    shared.fill(0);
  }
}
