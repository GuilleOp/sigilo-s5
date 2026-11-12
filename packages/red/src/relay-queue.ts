// Acuse de la cola de entrega del enrutador: cuando el nodo destino no responde, el enrutador guarda
// el sobre cerrado y firma con la llave de la operación que lo recibió. El navegador lo verifica con
// la llave de la operación de su raíz de confianza fijada.
import { RelayQueueReceiptSchema } from '@sigilo/contracts';
import type { HpkeEnvelope, RelayQueueReceipt } from '@sigilo/contracts';
import { canonicalize, sha256Hex } from '@sigilo/core';
import { signWithDomain, verifyWithDomain } from './signatures.ts';

/** Dominio de la firma del acuse de la cola. */
export const RELAY_QUEUE_RECEIPT_DOMAIN = 'sigilo/red/relay-queue/v1:';

/** SHA-256 de la forma canónica del sobre cerrado: liga el acuse al sobre exacto que se envió. */
export function relayEnvelopeDigest(sealed: HpkeEnvelope): string {
  return sha256Hex(canonicalize(sealed));
}

function receiptText(receipt: Omit<RelayQueueReceipt, 'signature'>): string {
  const { v, queueId, node, acceptedOn, expiresOn, envelopeDigest, operatorKeyId } = receipt;
  return canonicalize({ v, queueId, node, acceptedOn, expiresOn, envelopeDigest, operatorKeyId });
}

/** Firma el acuse con la llave de la operación. Lanza error si no cumple el esquema. */
export function signRelayQueueReceipt(
  unsigned: Omit<RelayQueueReceipt, 'signature' | 'v'>,
  operatorPrivateKey: Uint8Array,
): RelayQueueReceipt {
  const body = { v: 1 as const, ...unsigned };
  const signature = signWithDomain(
    RELAY_QUEUE_RECEIPT_DOMAIN,
    receiptText(body),
    operatorPrivateKey,
  );
  return RelayQueueReceiptSchema.parse({ ...body, signature });
}

/**
 * Indica si el acuse lo firmó la operación y corresponde al sobre que se envió a ese nodo.
 * Seguridad: un acuse de otro sobre o de otro nodo no vale, aunque esté bien firmado.
 */
export function verifyRelayQueueReceipt(
  receipt: unknown,
  operator: { keyId: string; signingPublicKey: string },
  expected: { node: string; sealed: HpkeEnvelope },
): receipt is RelayQueueReceipt {
  const parsed = RelayQueueReceiptSchema.safeParse(receipt);
  if (!parsed.success) return false;
  const value = parsed.data;
  return (
    value.operatorKeyId === operator.keyId &&
    value.node === expected.node &&
    value.envelopeDigest === relayEnvelopeDigest(expected.sealed) &&
    verifyWithDomain(
      RELAY_QUEUE_RECEIPT_DOMAIN,
      receiptText(value),
      value.signature,
      operator.signingPublicKey,
    )
  );
}
