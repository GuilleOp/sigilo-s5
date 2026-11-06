// Registro de un nodo ante el enrutador: mensaje firmado con la llave del nodo en el directorio.
import { NodeRegistrationSchema } from '@sigilo/contracts';
import type { DirectoryNode, NodeRegistration } from '@sigilo/contracts';
import { canonicalize, keyIdFor } from '@sigilo/core';
import { signWithDomain, signingPublicKeyOf, verifyWithDomain } from './signatures.ts';

/** Dominio de la firma del registro. */
export const NODE_REGISTRATION_DOMAIN = 'sigilo/red/node-registration/v1:';

function registrationText(registration: Omit<NodeRegistration, 'signature'>): string {
  const { v, nodeId, sequence, standardVersion, acceptsRelay } = registration;
  return canonicalize({ v, nodeId, sequence, standardVersion, acceptsRelay });
}

/** Firma el registro de un nodo. Lanza error si los datos no cumplen el esquema. */
export function signNodeRegistration(
  input: Omit<NodeRegistration, 'signature' | 'v'>,
  signingPrivateKey: Uint8Array,
): NodeRegistration {
  const unsigned = { v: 1 as const, ...input };
  const signature = signWithDomain(
    NODE_REGISTRATION_DOMAIN,
    registrationText(unsigned),
    signingPrivateKey,
  );
  return NodeRegistrationSchema.parse({ ...unsigned, signature });
}

/** Indica si el registro es del nodo y está firmado por su llave del directorio. */
export function verifyNodeRegistration(registration: unknown, node: DirectoryNode): boolean {
  const parsed = NodeRegistrationSchema.safeParse(registration);
  if (!parsed.success || parsed.data.nodeId !== node.id) return false;
  return verifyWithDomain(
    NODE_REGISTRATION_DOMAIN,
    registrationText(parsed.data),
    parsed.data.signature,
    node.signingPublicKey,
  );
}

/** Identificador de la llave de firma de una semilla Ed25519. */
export function signingKeyIdOf(privateKey: Uint8Array): string {
  return keyIdFor(signingPublicKeyOf(privateKey));
}
