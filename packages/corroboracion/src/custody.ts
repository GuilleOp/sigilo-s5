// Custodia opcional (ADR 0006, nivel B): formato del registro y máquina de estados. La denuncia ya
// cifrada hacia la autoridad se vuelve a cifrar hacia el custodio; se libera con una coincidencia
// independiente, a petición de la persona con su recibo o en la fecha límite, que nunca deja
// prescribir la falta (LGRA, art. 74).
import { ed25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { z } from 'zod';
import {
  Base64UrlSchema,
  DayDateSchema,
  HpkeEnvelopeSchema,
  MonthPeriodSchema,
  Sha256HexSchema,
} from '@sigilo/contracts';
import type { HpkeEnvelope } from '@sigilo/contracts';
import {
  canonicalize,
  fromBase64Url,
  openEnvelope,
  randomBytes,
  sealToPublicKey,
  sign,
  toBase64Url,
  toHex,
  utf8Decode,
  utf8Encode,
  verify,
} from '@sigilo/core';
import type { EnvelopeRecipient, KeyPair } from '@sigilo/core';

/** Años de prescripción que se usan siempre: los de las faltas no graves (LGRA, art. 74). */
export const CUSTODY_PRESCRIPTION_YEARS = 3;
/** Margen antes de la prescripción para investigar y calificar, en meses. */
export const CUSTODY_MARGIN_MONTHS = 12;
/** Fuentes independientes que liberan la custodia por omisión: esta denuncia y una más. */
export const DEFAULT_REQUIRED_SOURCES = 2;

const RELEASE_DOMAIN = 'sigilo/v1/custody-release:';
const SEAL_DOMAIN = 'sigilo/v1/custody:';
const RELEASE_KEY_INFO = 'sigilo/v1/custody-release-key';

export const CustodyReleaseReasonSchema = z
  .enum(['corroborated', 'reporter_request', 'deadline'])
  .meta({
    description:
      'Motivo de la liberación: corroborated (coincidencia independiente), reporter_request (la persona lo pidió con su recibo) o deadline (fecha límite).',
  });
export type CustodyReleaseReason = z.infer<typeof CustodyReleaseReasonSchema>;

export const CustodyRecordSchema = z
  .object({
    v: z.literal(1),
    custodyId: z.string().regex(/^[0-9a-f]{32}$/u, 'Custodia inválida'),
    epoch: z.number().int().min(1),
    tag: Sha256HexSchema,
    createdOn: DayDateSchema,
    occurredPeriod: MonthPeriodSchema,
    chosenDeadline: DayDateSchema,
    /** `mínimo(fecha elegida, inicio del periodo + 3 años − 12 meses)`. */
    deadline: DayDateSchema,
    requiredSources: z.number().int().min(2).max(10),
    /** Llave Ed25519 derivada del recibo con la que la persona pide liberar. */
    releasePublicKey: Base64UrlSchema,
    /** Sobre hacia el custodio que contiene el sobre hacia la autoridad. */
    sealed: HpkeEnvelopeSchema,
    state: z.enum(['held', 'released']),
    release: z
      .object({ reason: CustodyReleaseReasonSchema, on: DayDateSchema })
      .strict()
      .nullable(),
  })
  .strict()
  .meta({
    description: 'Denuncia en custodia hasta una coincidencia independiente o su fecha límite.',
  });
export type CustodyRecord = z.infer<typeof CustodyRecordSchema>;

/** Evento que puede cambiar el estado de una custodia. */
export type CustodyEvent =
  | {
      type: 'match_reported';
      /** `confirmedOtherSources` del estado del índice: otras fuentes confirmadas, nunca pendientes. */
      confirmedOtherSources: number;
      on: string;
    }
  | { type: 'reporter_release'; signature: string; on: string }
  | { type: 'clock'; on: string };

function assertDay(day: string): void {
  if (!DayDateSchema.safeParse(day).success || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) {
    throw new Error('Fecha inválida.');
  }
}

/**
 * Último día seguro para liberar: primer día del periodo de los hechos + 3 años − 12 meses.
 * Se usa el primer día del mes porque la persona solo da el mes: es la lectura más prudente.
 */
export function prescriptionSafeLimit(occurredPeriod: string): string {
  const parsed = MonthPeriodSchema.safeParse(occurredPeriod);
  if (!parsed.success) throw new Error('Periodo inválido.');
  const [year, month] = parsed.data.split('-').map(Number);
  const totalMonths =
    (year ?? 0) * 12 + ((month ?? 1) - 1) + CUSTODY_PRESCRIPTION_YEARS * 12 - CUSTODY_MARGIN_MONTHS;
  const limitYear = Math.floor(totalMonths / 12);
  const limitMonth = (totalMonths % 12) + 1;
  return `${String(limitYear).padStart(4, '0')}-${String(limitMonth).padStart(2, '0')}-01`;
}

/** Fecha límite: el mínimo entre la fecha elegida y el límite seguro (ADR 0006). */
export function custodyDeadline(chosenDeadline: string, occurredPeriod: string): string {
  assertDay(chosenDeadline);
  const limit = prescriptionSafeLimit(occurredPeriod);
  return chosenDeadline < limit ? chosenDeadline : limit;
}

/**
 * Par Ed25519 con el que la persona pide liberar su custodia, derivado de la entropía del recibo
 * con un contexto propio: no se puede ligar con las llaves del buzón.
 */
export function deriveCustodyReleaseKeys(receiptEntropy: Uint8Array): KeyPair {
  if (receiptEntropy.length !== 11) throw new Error('La entropía del recibo debe medir 11 bytes.');
  const privateKey = hkdf(
    sha256,
    receiptEntropy,
    new Uint8Array(0),
    utf8Encode(RELEASE_KEY_INFO),
    32,
  );
  return { privateKey, publicKey: ed25519.getPublicKey(privateKey) };
}

/** Identificador aleatorio de custodia (128 bits). */
export function newCustodyId(): string {
  return toHex(randomBytes(16));
}

function sealAad(custodyId: string): Uint8Array {
  return utf8Encode(`${SEAL_DOMAIN}${custodyId}`);
}

/**
 * Vuelve a cifrar hacia el custodio el sobre que ya va hacia la autoridad.
 * Seguridad: el nodo que guarda la custodia no puede abrirla (no tiene la llave del custodio) y
 * el custodio, al abrirla, solo obtiene otro sobre cifrado hacia la autoridad. El `custodyId` va
 * en la AAD: un sobre no sirve para otra custodia.
 */
export async function sealForCustody(
  authorityEnvelope: HpkeEnvelope,
  custodian: EnvelopeRecipient,
  custodyId: string,
): Promise<HpkeEnvelope> {
  const inner = utf8Encode(canonicalize(HpkeEnvelopeSchema.parse(authorityEnvelope)));
  return sealToPublicKey(inner, custodian, sealAad(custodyId));
}

/**
 * Crea el registro de custodia. Si la fecha límite ya llegó, nace liberado por fecha límite: la
 * denuncia se envía de inmediato. Lanza error si los datos no son válidos.
 */
export function createCustody(input: {
  custodyId: string;
  epoch: number;
  tag: string;
  createdOn: string;
  occurredPeriod: string;
  chosenDeadline: string;
  requiredSources?: number;
  releasePublicKey: Uint8Array;
  sealed: HpkeEnvelope;
}): CustodyRecord {
  assertDay(input.createdOn);
  const deadline = custodyDeadline(input.chosenDeadline, input.occurredPeriod);
  const isDue = deadline <= input.createdOn;
  return CustodyRecordSchema.parse({
    v: 1,
    custodyId: input.custodyId,
    epoch: input.epoch,
    tag: input.tag,
    createdOn: input.createdOn,
    occurredPeriod: input.occurredPeriod,
    chosenDeadline: input.chosenDeadline,
    deadline,
    requiredSources: input.requiredSources ?? DEFAULT_REQUIRED_SOURCES,
    releasePublicKey: toBase64Url(input.releasePublicKey),
    sealed: input.sealed,
    state: isDue ? 'released' : 'held',
    release: isDue ? { reason: 'deadline', on: input.createdOn } : null,
  });
}

/** Firma con la llave del recibo la petición de liberar la custodia `custodyId`. */
export function signCustodyRelease(custodyId: string, releasePrivateKey: Uint8Array): string {
  return toBase64Url(sign(utf8Encode(`${RELEASE_DOMAIN}${custodyId}`), releasePrivateKey));
}

function isValidRelease(record: CustodyRecord, signature: string): boolean {
  try {
    return verify(
      fromBase64Url(signature),
      utf8Encode(`${RELEASE_DOMAIN}${record.custodyId}`),
      fromBase64Url(record.releasePublicKey),
    );
  } catch {
    return false;
  }
}

/**
 * Aplica un evento y devuelve el registro nuevo (el original no cambia). Reglas, en este orden:
 * liberada es final; si el día del evento alcanza la fecha límite, se libera por fecha límite;
 * una coincidencia que con esta denuncia suma `requiredSources` fuentes confirmadas la libera por
 * corroboración;
 * una firma válida del recibo la libera a petición. Cualquier otro evento no cambia nada.
 * Lanza error si el día del evento no es válido.
 */
export function advanceCustody(record: CustodyRecord, event: CustodyEvent): CustodyRecord {
  assertDay(event.on);
  if (record.state === 'released') return record;
  const release = (reason: CustodyReleaseReason): CustodyRecord => ({
    ...record,
    state: 'released',
    release: { reason, on: event.on },
  });
  if (event.on >= record.deadline) return release('deadline');
  switch (event.type) {
    case 'match_reported':
      // Seguridad: solo cuentan las otras fuentes confirmadas (aceptadas por su autoridad o
      // envejecidas); un envío de sondeo o spam sin confirmar no libera la custodia.
      return event.confirmedOtherSources + 1 >= record.requiredSources
        ? release('corroborated')
        : record;
    case 'reporter_release':
      return isValidRelease(record, event.signature) ? release('reporter_request') : record;
    case 'clock':
      return record;
  }
}

/**
 * El custodio abre la custodia liberada y obtiene el sobre hacia la autoridad.
 * Seguridad: se niega a abrir una custodia retenida. Lanza error si está retenida o si el sobre
 * no abre con la llave.
 */
export async function openReleasedCustody(
  record: CustodyRecord,
  custodianPrivateKey: Uint8Array,
): Promise<HpkeEnvelope> {
  if (record.state !== 'released') throw new Error('La custodia sigue retenida.');
  const inner = await openEnvelope(record.sealed, custodianPrivateKey, sealAad(record.custodyId));
  return HpkeEnvelopeSchema.parse(JSON.parse(utf8Decode(inner)));
}
