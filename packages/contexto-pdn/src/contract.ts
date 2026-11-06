// Verificación de un contrato citado contra S6: existe, comprador, proveedor y tipo de procedimiento.
// Lo más que se dice es «inconsistente con registros públicos»; nunca que una denuncia es falsa.

import { noCoverage } from './alternatives.ts';
import { citeSource, formatAmount, formatDataDate } from './citation.ts';
import { assessCoverage } from './coverage.ts';
import type { CoverageMatrix } from './coverage.ts';
import { institutionRefKey, organizationKey } from './names.ts';
import type {
  ContractRecord,
  ContractsSource,
  Difference,
  Evidence,
  ProcurementMethod,
  Verification,
} from './types.ts';

/** Lo que la denuncia afirma del contrato. Todo es opcional salvo un identificador. */
export interface ContractClaim {
  ocid?: string;
  contractId?: string;
  buyer?: string;
  supplier?: string;
  method?: ProcurementMethod;
  amount?: number;
}

/** Verificación de contrato con el registro encontrado (si lo hay). */
export type ContractVerification = Verification & { record: ContractRecord | null };

/** Nombre en español de cada tipo de procedimiento OCDS. */
export const PROCUREMENT_METHOD_LABELS: Readonly<Record<ProcurementMethod, string>> = {
  direct: 'adjudicación directa',
  limited: 'invitación restringida',
  open: 'licitación pública',
  selective: 'procedimiento selectivo',
};

const OCID_PATTERN = /\bocds-[a-z0-9]{6}-[A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9]\b/gu;

/**
 * Extrae del relato lo que afirma de un contrato: el `ocid`, el tipo de procedimiento y el monto.
 * Es una ayuda conservadora: si no encuentra un dato, no lo afirma.
 */
export function extractContractClaims(narrative: string): ContractClaim[] {
  const ocids = [...new Set(narrative.match(OCID_PATTERN) ?? [])];
  const lower = narrative.toLowerCase();
  let method: ProcurementMethod | undefined;
  if (/adjudic\p{L}*\s+(?:de\s+forma\s+|de\s+manera\s+)?direct/u.test(lower)) {
    method = 'direct';
  } else if (/licitaci[oó]n\s+p[uú]blica/u.test(lower)) {
    method = 'open';
  } else if (/invitaci[oó]n\s+(?:restringida|a\s+cuando\s+menos\s+tres)/u.test(lower)) {
    method = 'limited';
  }
  const amountMatch = /por\s+\$?\s*([\d.,]{4,})\s*(?:pesos|mxn)/u.exec(lower);
  const amount =
    amountMatch?.[1] === undefined ? undefined : Number(amountMatch[1].replace(/,/gu, ''));
  return ocids.map((ocid) => ({
    ocid,
    ...(method === undefined ? {} : { method }),
    ...(amount === undefined || Number.isNaN(amount) ? {} : { amount }),
  }));
}

function totalAmount(record: ContractRecord): number | null {
  const amounts = record.awards
    .map((award) => award.amount)
    .filter((value): value is number => value !== null);
  return amounts.length === 0 ? null : amounts.reduce((sum, value) => sum + value, 0);
}

function describeMethod(record: ContractRecord): string {
  const method =
    record.method === null
      ? 'procedimiento sin tipo registrado'
      : PROCUREMENT_METHOD_LABELS[record.method];
  if (record.tenderers === null) return method;
  return `${method} con ${record.tenderers} ${record.tenderers === 1 ? 'participante' : 'participantes'}`;
}

/** Datos del registro de S6 que se muestran a la autoridad, cada uno con su fuente y fecha. */
export function contractEvidence(record: ContractRecord, source: ContractsSource): Evidence[] {
  const citation = citeSource(source.info);
  const suppliers = record.awards.flatMap((award) =>
    award.suppliers.map((supplier) => supplier.name),
  );
  const amount = totalAmount(record);
  return [
    { label: 'Procedimiento', value: `${record.ocid}`, citation },
    { label: 'Comprador', value: record.buyer.name, citation },
    { label: 'Tipo de procedimiento', value: describeMethod(record), citation },
    ...(record.rationale === null
      ? []
      : [{ label: 'Justificación registrada', value: record.rationale, citation }]),
    ...(suppliers.length === 0
      ? []
      : [{ label: 'Proveedor adjudicado', value: suppliers.join('; '), citation }]),
    ...(amount === null
      ? []
      : [{ label: 'Monto adjudicado', value: formatAmount(amount), citation }]),
    ...(record.date === null
      ? []
      : [{ label: 'Fecha', value: formatDataDate(record.date), citation }]),
  ];
}

/**
 * Verifica un contrato citado contra S6, consultando antes la matriz de cobertura. Si el registro
 * no está, el resultado es `no_coverage` con `record-not-found`: la ausencia no es evidencia.
 */
export function verifyCitedContract(input: {
  source: ContractsSource;
  matrix: CoverageMatrix;
  stateCode: string;
  claim: ContractClaim;
  /** Fecha de los hechos (AAAA-MM o AAAA-MM-DD), para revisar el periodo de la fuente. */
  date?: string;
}): ContractVerification {
  const { source, matrix, stateCode, claim } = input;
  const coverage = assessCoverage({
    matrix,
    source,
    stateCode,
    ...(input.date === undefined ? {} : { date: input.date }),
  });
  if (!coverage.isCovered) {
    return {
      ...noCoverage('contract', source.info, coverage.reason, coverage.detail),
      record: null,
    };
  }
  const reference = {
    ...(claim.ocid === undefined ? {} : { ocid: claim.ocid }),
    ...(claim.contractId === undefined ? {} : { contractId: claim.contractId }),
  };
  const record =
    claim.ocid === undefined && claim.contractId === undefined
      ? null
      : source.findContract(reference);
  if (record === null) {
    // Sin registro, se distingue si el comprador citado ni siquiera está conectado a la fuente.
    const buyerCoverage =
      claim.buyer === undefined
        ? coverage
        : assessCoverage({ matrix, source, stateCode, institution: claim.buyer });
    if (!buyerCoverage.isCovered) {
      return {
        ...noCoverage('contract', source.info, buyerCoverage.reason, buyerCoverage.detail),
        record: null,
      };
    }
    return {
      ...noCoverage(
        'contract',
        source.info,
        'record-not-found',
        `No encontramos el procedimiento ${claim.ocid ?? claim.contractId ?? 'citado'}.`,
      ),
      record: null,
    };
  }

  const citation = citeSource(source.info);
  const differences: Difference[] = [];
  if (
    claim.buyer !== undefined &&
    institutionRefKey(claim.buyer, stateCode) !== institutionRefKey(record.buyer.name, stateCode)
  ) {
    differences.push({
      field: 'buyer',
      claimed: claim.buyer,
      recorded: record.buyer.name,
      text: `el comprador registrado es ${record.buyer.name}`,
    });
  }
  const suppliers = record.awards.flatMap((award) => award.suppliers);
  if (
    claim.supplier !== undefined &&
    !suppliers.some(
      (supplier) => organizationKey(supplier.name) === organizationKey(claim.supplier ?? ''),
    )
  ) {
    differences.push({
      field: 'supplier',
      claimed: claim.supplier,
      recorded: suppliers.map((supplier) => supplier.name).join('; ') || 'sin proveedor registrado',
      text: `el proveedor registrado es ${suppliers.map((supplier) => supplier.name).join('; ') || 'ninguno'}`,
    });
  }
  if (claim.method !== undefined && record.method !== null && claim.method !== record.method) {
    differences.push({
      field: 'method',
      claimed: PROCUREMENT_METHOD_LABELS[claim.method],
      recorded: describeMethod(record),
      text: `el ${source.info.label} registra este contrato como ${describeMethod(record)}`,
    });
  }
  const evidence = contractEvidence(record, source);
  if (differences.length > 0) {
    return {
      check: 'contract',
      outcome: 'contradicted',
      title: 'Inconsistente con registros públicos',
      explanation: `Inconsistente con registros públicos: ${differences.map((item) => item.text).join('; ')} (${citation.text}). Es una diferencia con el registro, no una conclusión sobre la denuncia.`,
      differences,
      evidence,
      citations: [citation],
      record,
    };
  }
  return {
    check: 'contract',
    outcome: 'confirmed',
    title: 'Coincide con registros públicos',
    explanation: `El procedimiento ${record.ocid} existe: ${record.buyer.name}, ${describeMethod(record)} (${citation.text}).`,
    evidence,
    citations: [citation],
    record,
  };
}
