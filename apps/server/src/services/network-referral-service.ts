// Vista al Ministerio Público hacia una fiscalía de otro nodo de la red. Reutiliza el transporte del
// turnado entre nodos (enrutador ciego, sobre cifrado hacia la llave del nodo destino), pero no es un
// turnado: la denuncia, su vía administrativa, su buzón y su identidad sellada se quedan en el
// origen. El navegador de quien investiga ya re-cifró y subió las pruebas hacia la llave de la
// fiscalía destino; aquí el nodo de origen arma el paquete (hechos y descriptores, que ya conoce),
// lo firma con su llave del directorio y lo entrega. El nodo destino verifica la firma con el
// directorio y crea una copia de lectura para su fiscalía, con un folio propio de la vista.
//
// Limitación (documentada en docs/ciclo-de-vida-legal.md): las etapas penales que la fiscalía
// registra en su nodo no regresan al origen, que solo guarda «Vista enviada al nodo …».
import {
  canonicalize,
  fromBase64Url,
  randomBytes,
  sha256Hex,
  sign,
  signReceipt,
  toBase64Url,
  toDayDate,
  toHex,
  toMexicoCentralDay,
  utf8Encode,
  verify,
} from '@sigilo/core';
import {
  NETWORK_REFERRAL_SIGNATURE_PREFIX,
  NETWORK_REFERRAL_VERSION,
  NETWORK_ROUTES,
  NetworkReferralDeliverySchema,
  NetworkReferralReceiptSchema,
  RelayResponseSchema,
  hasAnyFunction,
} from '@sigilo/contracts';
import type {
  NetworkReferralPackage,
  NetworkReferralReceipt,
  NetworkReferralRequest,
  ProcedureActionRequest,
  ProcedureState,
  RoutedReply,
} from '@sigilo/contracts';
import { isAuthorityValidOn, openRoutedReply, sealRoutedRequest } from '@sigilo/red';
import type { AppContext } from '../context.ts';
import { withTransaction } from '../db/database.ts';
import { ApiFailure } from '../http/errors.ts';
import { directoryAuthority } from '../network/network-context.ts';
import { hasInvisibleCharacters } from '../security/invisible-text.ts';
import type { AuthorityAccount } from '../security/authority-registry.ts';
import { associateEvidence } from './complaint-service.ts';
import { anchorReceivedEvidence } from './evidence-service.ts';
import { applyProcedureAction, checkProcedureAction, isCompetent } from './procedure-service.ts';
import type { NetworkReferralDelivered } from './procedure-service.ts';
import { isProsecutionAuthority } from './prosecution.ts';

/** Días de diferencia que admite el nodo destino entre `sentOn` y su propio día. */
const MAX_SENT_SKEW_DAYS = 2;

/**
 * Folios con una vista a otro nodo en curso (mientras se espera al enrutador), por contexto.
 * Seguridad: sin esto, dos peticiones simultáneas pasarían ambas la comprobación y saldrían dos
 * copias hacia la fiscalía destino.
 */
const referralsInFlight = new WeakMap<AppContext, Set<string>>();

/** Mensaje que firma el nodo de origen: prefijo de dominio y forma canónica del paquete. */
export function networkReferralMessage(pkg: NetworkReferralPackage): Uint8Array {
  return utf8Encode(`${NETWORK_REFERRAL_SIGNATURE_PREFIX}${canonicalize(pkg)}`);
}

const UNDELIVERED =
  'El nodo de la fiscalía no recibió la vista. No se registró nada; inténtalo de nuevo más tarde.';

/**
 * Da vista al Ministerio Público a una fiscalía de otro nodo: comprueba que la acción procede,
 * firma y entrega el paquete por el enrutador ciego y, solo con el acuse del nodo destino, registra
 * la vista en el trámite («Vista enviada al nodo …», con el folio de la copia allá).
 * Lanza `conflict` si el nodo no está en una red con enrutador o el destino no recibió la vista;
 * `not_found` si la denuncia es de otra autoridad; `bad_request` si el destino no es una fiscalía
 * vigente de otro nodo del directorio o las pruebas no son una por cada prueba guardada.
 * Seguridad: el paquete no lleva la identidad sellada, las llaves de seguimiento ni los mensajes.
 */
export async function referToNetworkProsecutor(
  ctx: AppContext,
  account: AuthorityAccount,
  folio: string,
  request: NetworkReferralRequest,
): Promise<ProcedureState> {
  const network = ctx.deps.network;
  if (network === undefined || network.routerUrl === null) throw new ApiFailure('conflict');
  if (!hasAnyFunction(account, ['investigation', 'substantiation'])) {
    throw new ApiFailure('forbidden');
  }
  const complaint = ctx.complaints.find(folio);
  if (complaint === null || !isCompetent(ctx, account, complaint)) {
    throw new ApiFailure('not_found');
  }
  const today = toDayDate(ctx.deps.now());
  const target = directoryAuthority(network, request.toAuthorityId);
  const node = network.directory.nodes.find((item) => item.id === target?.nodeId);
  const isRemoteProsecution =
    target !== undefined &&
    node !== undefined &&
    target.role === 'prosecution' &&
    target.nodeId !== network.nodeId &&
    isAuthorityValidOn(target, today);
  // La autoridad de origen debe estar en el directorio: el destino la reconoce por él.
  const origin = directoryAuthority(network, account.authorityId);
  const stored = ctx.evidence.listStoredIdsForFolio(folio);
  const ids = request.evidence.map((item) => item.evidenceId);
  const isComplete = request.evidence.length === stored.length && new Set(ids).size === ids.length;
  if (!isRemoteProsecution || origin?.nodeId !== network.nodeId || !isComplete) {
    throw new ApiFailure('bad_request');
  }
  const delivered: NetworkReferralDelivered = {
    toAuthorityId: target.id,
    toAuthorityName: target.name,
    toNodeId: node.id,
    toNodeName: node.name,
    referralFolio: request.referralFolio,
  };
  const procedureRequest: ProcedureActionRequest = {
    action: 'refer_to_prosecutor',
    basis: request.basis,
    prosecutor: `${target.name} (${node.name})`.slice(0, 300),
    ...(request.note === undefined ? {} : { note: request.note }),
  };
  // Las mismas validaciones que la vista dentro del nodo, antes de que nada salga.
  checkProcedureAction(ctx, account, folio, procedureRequest, delivered);
  const inFlight = referralsInFlight.get(ctx) ?? new Set<string>();
  referralsInFlight.set(ctx, inFlight);
  if (inFlight.has(folio)) throw new ApiFailure('conflict');
  inFlight.add(folio);
  try {
    const pkg: NetworkReferralPackage = {
      v: NETWORK_REFERRAL_VERSION,
      referralId: toHex(randomBytes(16)),
      referralFolio: request.referralFolio,
      fromNodeId: network.nodeId,
      fromAuthorityId: account.authorityId,
      toAuthorityId: target.id,
      sentOn: today,
      basis: request.basis,
      originMode: complaint.mode,
      facts: complaint.facts,
      evidence: request.evidence,
    };
    const signature = sign(networkReferralMessage(pkg), ctx.deps.keys.serverSigningPrivateKey);
    const sealed = await sealRoutedRequest(
      {
        to: target.id,
        operationId: 'receiveReferral',
        query: {},
        proofOfWork: null,
        body: { kind: 'json', value: { package: pkg, signature: toBase64Url(signature) } },
      },
      node,
    );
    let reply: RoutedReply;
    try {
      const response = await network.fetch(`${network.routerUrl}${NETWORK_ROUTES.relay}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sealed.relay),
      });
      if (!response.ok) throw new Error('enrutador');
      const relay = RelayResponseSchema.parse(await response.json());
      reply = await openRoutedReply(relay, sealed.replyPrivateKey, target.id);
    } catch {
      throw new ApiFailure('conflict', UNDELIVERED);
    } finally {
      sealed.replyPrivateKey.fill(0);
    }
    const receipt =
      reply.status === 201 && reply.body.kind === 'json'
        ? NetworkReferralReceiptSchema.safeParse(reply.body.value)
        : null;
    if (receipt?.success !== true || receipt.data.referralFolio !== request.referralFolio) {
      throw new ApiFailure('conflict', UNDELIVERED);
    }
    return applyProcedureAction(ctx, account, folio, procedureRequest, delivered);
  } finally {
    inFlight.delete(folio);
  }
}

/** Respuesta del nodo destino dentro del sobre de vuelta. */
export interface ReferralReply {
  status: number;
  body: unknown;
}

const REJECTED: ReferralReply = {
  status: 400,
  body: { error: { code: 'bad_request', message: 'Solicitud inválida.' } },
};

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

/**
 * Recibe en el nodo destino la vista que llegó por el buzón de red hacia `routedTo` y crea la copia
 * de lectura de su fiscalía. La copia queda «con» la autoridad de origen (nadie de este nodo la
 * tiene): la fiscalía la ve en su bandeja como una vista del mismo nodo y solo avanza la vía penal.
 * Responde `400` sin decir por qué si el paquete no es para esa fiscalía, la firma no verifica con
 * la llave del nodo de origen en el directorio, la autoridad de origen no es de ese nodo, la fecha
 * no es de estos días, el folio ya existe o las pruebas no corresponden a lo subido.
 */
export function receiveNetworkReferral(
  ctx: AppContext,
  routedTo: string,
  body: unknown,
): ReferralReply {
  const network = ctx.deps.network;
  const parsed = NetworkReferralDeliverySchema.safeParse(body);
  if (network === undefined || !parsed.success) return REJECTED;
  const pkg = parsed.data.package;
  const fromNode = network.directory.nodes.find((item) => item.id === pkg.fromNodeId);
  const fromAuthority = directoryAuthority(network, pkg.fromAuthorityId);
  const today = toDayDate(ctx.deps.now());
  let signature: Uint8Array;
  try {
    signature = fromBase64Url(parsed.data.signature);
  } catch {
    return REJECTED;
  }
  const isValid =
    pkg.toAuthorityId === routedTo &&
    ctx.authorities.authority(routedTo) !== null &&
    isProsecutionAuthority(ctx, routedTo) &&
    fromNode !== undefined &&
    fromNode.id !== network.nodeId &&
    fromAuthority !== undefined &&
    fromAuthority.nodeId === fromNode.id &&
    fromAuthority.role !== 'prosecution' &&
    daysBetween(pkg.sentOn, today) <= MAX_SENT_SKEW_DAYS &&
    !hasInvisibleCharacters(pkg.facts.accused) &&
    !hasInvisibleCharacters(pkg.facts.description) &&
    // Seguridad: solo un nodo del directorio firma vistas; nadie más puede llenar la bandeja de la
    // fiscalía con vistas a nombre de una autoridad.
    verify(signature, networkReferralMessage(pkg), fromBase64Url(fromNode.signingPublicKey));
  if (!isValid) return REJECTED;
  try {
    const receipt = withTransaction(ctx.deps.db, () =>
      createReferralCopy(ctx, pkg, parsed.data.signature, {
        fromNodeName: fromNode.name,
        fromAuthorityName: fromAuthority.name,
      }),
    );
    return { status: 201, body: receipt };
  } catch (error) {
    if (error instanceof ApiFailure) return REJECTED;
    throw error;
  }
}

function createReferralCopy(
  ctx: AppContext,
  pkg: NetworkReferralPackage,
  signature: string,
  names: { fromNodeName: string; fromAuthorityName: string },
): NetworkReferralReceipt {
  const folio = pkg.referralFolio;
  if (ctx.complaints.exists(folio)) throw new ApiFailure('bad_request');
  const now = ctx.deps.now();
  const legalOn = toMexicoCentralDay(now);
  // Digesto del paquete con la firma del nodo de origen: la recepción queda en la bitácora de este
  // nodo (solo su digesto es público) atribuida a ese nodo, con el comprobante de siempre.
  const submissionDigest = sha256Hex(canonicalize({ package: pkg, signature }));
  const event = ctx.ledger.record({
    type: 'complaint.received',
    folio,
    at: toDayDate(now),
    actorRole: 'system',
    payload: { folio, submissionDigest },
  });
  const receipt = signReceipt(
    {
      folio,
      submissionDigest,
      receivedOn: event.at,
      payloadDigest: event.payloadDigest,
      serverKeyId: ctx.deps.keys.publicKeySet.server.keyId,
    },
    ctx.deps.keys.serverSigningPrivateKey,
  );
  ctx.complaints.insert({
    folio,
    // La copia no lleva identidad: para el nodo destino es anónima (la persona sigue en el origen).
    mode: 'anonymous',
    status: 'investigating',
    receivedOn: event.at,
    facts: pkg.facts,
    protectionRequested: false,
    sealedIdentity: null,
    // Seguridad: llaves al azar que nadie tiene. Nadie da seguimiento a la copia ni escribe por su
    // buzón; la persona denunciante solo conoce su folio y sus 8 palabras del origen.
    reporterKeys: {
      boxPublicKey: toBase64Url(randomBytes(32)),
      signingPublicKey: toBase64Url(randomBytes(32)),
    },
    authVerifier: toBase64Url(randomBytes(32)),
    receipt,
    receivedLegalOn: legalOn,
    assignedAuthorityId: pkg.fromAuthorityId,
    managementState: 'accepted',
    legalStage: null,
    criminalStage: 'criminal_complaint_filed',
    fundingSource: null,
    closureReason: null,
    escalationEnvelope: null,
    corroborationDigest: null,
    referralOrigin: {
      referralId: pkg.referralId,
      fromNodeId: pkg.fromNodeId,
      fromNodeName: names.fromNodeName,
      fromAuthorityId: pkg.fromAuthorityId,
      fromAuthorityName: names.fromAuthorityName,
      sentOn: pkg.sentOn,
      originMode: pkg.originMode,
    },
  });
  associateEvidence(ctx, pkg, folio);
  // Cadena de custodia de la copia: los digestos de las pruebas re-cifradas quedan anclados aquí.
  anchorReceivedEvidence(ctx, folio);
  ctx.statusHistory.insert(folio, 'investigating', event.at);
  ctx.procedure.insertStep(folio, {
    action: 'criminal_referral_filed',
    on: event.at,
    legalOn,
    managementState: 'accepted',
    legalStage: null,
    closureReason: null,
    authorityId: pkg.fromAuthorityId,
    actorId: null,
    note: `Vista al Ministerio Público recibida por la red de ${names.fromAuthorityName} (${names.fromNodeName}) por hechos que pueden ser delito. Es una copia de lectura con los hechos y las pruebas re-cifradas hacia la llave de la fiscalía: la denuncia sigue en la autoridad de origen, que lleva la vía administrativa. La identidad de la persona denunciante y sus mensajes no viajan.`,
    details: {
      criminalStage: 'criminal_complaint_filed',
      referralBasis: pkg.basis,
      prosecutorAuthorityId: pkg.toAuthorityId,
    },
  });
  return { referralFolio: folio, receivedOn: event.at };
}
