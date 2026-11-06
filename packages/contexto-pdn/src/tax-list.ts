// Consulta de proveedores en la lista tipo 69-B (operaciones presuntamente inexistentes).
// Aparecer es un dato público que la autoridad revisa; no aparecer no prueba nada.

import { noCoverage } from './alternatives.ts';
import { citeSource, formatDataDate } from './citation.ts';
import type {
  ContractRecord,
  Supplier,
  TaxListSource,
  TaxListStatus,
  Verification,
} from './types.ts';

/** Situación en español. */
export const TAX_LIST_STATUS_LABELS: Readonly<Record<TaxListStatus, string>> = {
  definitive: 'Definitivo',
  presumed: 'Presunto',
  distorted: 'Desvirtuado',
  favorable: 'Sentencia favorable',
};

/** Verificación de un proveedor contra la lista tipo 69-B, con el nombre del proveedor consultado. */
export type TaxListVerification = Verification & { supplier: Supplier };

/**
 * Busca un proveedor por RFC. `confirmed` si aparece (con su situación); si no aparece, `no_coverage`
 * con `record-not-found`. Sin RFC no se busca por nombre: los homónimos de empresas son frecuentes.
 */
export function checkTaxList(source: TaxListSource, supplier: Supplier): TaxListVerification {
  const citation = citeSource(source.info);
  const rfc = supplier.id?.trim().toUpperCase() ?? '';
  const entry = rfc === '' ? null : source.findByRfc(rfc);
  if (entry === null) {
    return {
      ...noCoverage(
        'tax-list-69b',
        source.info,
        'record-not-found',
        rfc === ''
          ? `No hay RFC del proveedor ${supplier.name} para buscarlo.`
          : `${supplier.name} no aparece en la lista consultada.`,
        'No aparece en la lista consultada',
      ),
      supplier,
    };
  }
  const status = TAX_LIST_STATUS_LABELS[entry.status];
  return {
    check: 'tax-list-69b',
    outcome: 'confirmed',
    title: 'El proveedor aparece en la lista tipo 69-B',
    explanation: `${entry.name} aparece en la lista de contribuyentes con operaciones presuntamente inexistentes, situación «${status}», publicada el ${formatDataDate(entry.publishedOn)} (${citation.text}).`,
    evidence: [
      { label: 'Contribuyente', value: entry.name, citation },
      { label: 'Situación', value: status, citation },
      { label: 'Publicación', value: formatDataDate(entry.publishedOn), citation },
    ],
    citations: [citation],
    supplier,
  };
}

/** Consulta todos los proveedores adjudicados de un procedimiento de S6. */
export function checkContractSuppliers(
  source: TaxListSource,
  record: ContractRecord,
): TaxListVerification[] {
  return record.awards
    .flatMap((award) => award.suppliers)
    .map((supplier) => checkTaxList(source, supplier));
}
