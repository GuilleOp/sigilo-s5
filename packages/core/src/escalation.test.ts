// Pruebas del sobre de escalamiento: relleno fijo, AAD ligado al recibo y a las llaves del buzón,
// manipulación, llave equivocada y recálculo del digesto del envío por la supervisora.
import type { SubmitComplaintRequest } from '@sigilo/contracts';
import { describe, expect, it } from 'vitest';
import { canonicalize, sha256Hex } from './canonical-json.ts';
import { fromBase64Url, toBase64Url } from './encoding.ts';
import {
  ESCALATION_PADDED_SIZE,
  escalationEnvelopeDigest,
  openEscalation,
  sealEscalation,
  submissionDigestFromEscalation,
} from './escalation.ts';
import type { EscalationContext } from './escalation.ts';
import { generateBoxKeyPair, keyIdFor } from './keys.ts';
import { deriveReceiptKeys } from './receipt-keys.ts';
import { randomBytes } from './random.ts';
import { computeSubmissionDigest, corroborationDigest } from './signed-receipt.ts';

const OPEN_ERROR = 'No se pudo abrir el sobre.';

function scenario() {
  const reporter = deriveReceiptKeys(randomBytes(11));
  const supervisor = generateBoxKeyPair();
  const recipient = { keyId: keyIdFor(supervisor.publicKey), publicKey: supervisor.publicKey };
  const request: SubmitComplaintRequest = {
    version: 1,
    mode: 'anonymous',
    facts: {
      stateCode: '22',
      entityId: 'VE-OBRAS',
      offenseCode: 'LGRA-59',
      occurredPeriod: '2026-03',
      accused: 'Titular ficticio del departamento de compras',
      description: 'Hechos sintéticos: una adjudicación directa justificada como urgente.',
    },
    evidence: [],
    protectionRequested: false,
    reporterKeys: {
      boxPublicKey: toBase64Url(reporter.box.publicKey),
      signingPublicKey: toBase64Url(reporter.signing.publicKey),
    },
    authVerifier: reporter.authVerifier,
  };
  const context: EscalationContext = {
    authVerifier: request.authVerifier,
    reporterKeys: request.reporterKeys,
  };
  return { supervisor, recipient, request, context };
}

describe('sobre de escalamiento', () => {
  it('abre con la llave de la supervisora y el mismo contexto, con tamaño fijo', async () => {
    const { supervisor, recipient, request, context } = scenario();
    const envelope = await sealEscalation(request, recipient, context);
    expect(fromBase64Url(envelope.ct).length).toBe(ESCALATION_PADDED_SIZE + 16);
    const content = await openEscalation(envelope, supervisor.privateKey, context);
    expect(content).toEqual({
      version: 1,
      mode: 'anonymous',
      facts: request.facts,
      evidence: [],
      protectionRequested: false,
      evidenceKeys: [],
    });
    // Nunca lleva campos fuera del contenido (la identidad sellada no entra).
    expect(Object.keys(content).sort()).toEqual([
      'evidence',
      'evidenceKeys',
      'facts',
      'mode',
      'protectionRequested',
      'version',
    ]);
  });

  it('lleva las llaves de los archivos de prueba para la supervisora', async () => {
    const { supervisor, recipient, request, context } = scenario();
    const evidenceKeys = [{ evidenceId: 'a'.repeat(32), fileKey: toBase64Url(randomBytes(32)) }];
    const envelope = await sealEscalation(request, recipient, context, evidenceKeys);
    expect(fromBase64Url(envelope.ct).length).toBe(ESCALATION_PADDED_SIZE + 16);
    const content = await openEscalation(envelope, supervisor.privateKey, context);
    expect(content.evidenceKeys).toEqual(evidenceKeys);
  });

  it('el tamaño no depende de la longitud del relato', async () => {
    const { recipient, request, context } = scenario();
    const short = await sealEscalation(request, recipient, context);
    const long = await sealEscalation(
      { ...request, facts: { ...request.facts, description: 'á'.repeat(10_000) } },
      recipient,
      context,
    );
    expect(long.ct.length).toBe(short.ct.length);
  });

  it('no abre con otra llave, con otro recibo, con otras llaves del buzón ni con un bit cambiado', async () => {
    const { supervisor, recipient, request, context } = scenario();
    const envelope = await sealEscalation(request, recipient, context);
    const other = generateBoxKeyPair();
    await expect(openEscalation(envelope, other.privateKey, context)).rejects.toThrow(OPEN_ERROR);
    const otherReporter = deriveReceiptKeys(randomBytes(11));
    await expect(
      openEscalation(envelope, supervisor.privateKey, {
        ...context,
        authVerifier: otherReporter.authVerifier,
      }),
    ).rejects.toThrow(OPEN_ERROR);
    await expect(
      openEscalation(envelope, supervisor.privateKey, {
        ...context,
        reporterKeys: {
          ...context.reporterKeys,
          boxPublicKey: toBase64Url(otherReporter.box.publicKey),
        },
      }),
    ).rejects.toThrow(OPEN_ERROR);
    const bytes = fromBase64Url(envelope.ct);
    bytes[10] = (bytes[10] ?? 0) ^ 1;
    await expect(
      openEscalation({ ...envelope, ct: toBase64Url(bytes) }, supervisor.privateKey, context),
    ).rejects.toThrow(OPEN_ERROR);
  });

  it('rechaza un contenido inválido sin citarlo', async () => {
    const { recipient, request, context } = scenario();
    await expect(
      sealEscalation(
        { ...request, facts: { ...request.facts, description: 'corto' } },
        recipient,
        context,
      ),
    ).rejects.toThrow('El contenido del sobre de escalamiento no es válido.');
  });

  it('la supervisora recalcula el digesto del envío que firmó el servidor', async () => {
    const { supervisor, recipient, request, context } = scenario();
    const escalationEnvelope = await sealEscalation(request, recipient, context);
    const sent = { ...request, escalationEnvelope };
    const content = await openEscalation(escalationEnvelope, supervisor.privateKey, context);
    expect(submissionDigestFromEscalation(content, { ...context, escalationEnvelope })).toBe(
      computeSubmissionDigest(sent),
    );
    expect(escalationEnvelopeDigest(escalationEnvelope)).toBe(
      sha256Hex(canonicalize(escalationEnvelope)),
    );
    // Un sobre sustituido por el nodo ya no coincide con el digesto firmado.
    const swapped = await sealEscalation(request, recipient, context);
    expect(
      submissionDigestFromEscalation(content, { ...context, escalationEnvelope: swapped }),
    ).not.toBe(computeSubmissionDigest(sent));
  });

  it('con corroboración ciega, la recalcula con el digesto de la etiqueta', async () => {
    const { supervisor, recipient, request, context } = scenario();
    const escalationEnvelope = await sealEscalation(request, recipient, context);
    const corroboration = { epoch: 1, tag: 'AAAA', similarity: null };
    const sent = { ...request, escalationEnvelope, corroboration };
    const content = await openEscalation(escalationEnvelope, supervisor.privateKey, context);
    const delivery = {
      ...context,
      escalationEnvelope,
      corroborationDigest: corroborationDigest(corroboration),
    };
    expect(submissionDigestFromEscalation(content, delivery)).toBe(computeSubmissionDigest(sent));
  });
});
