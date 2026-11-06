// Resumen de una bitácora ya verificada: cuántas denuncias llegaron, cuántas veces se abrió un
// nombre sellado y cuántas veces se entregó su sobre. Las cifras salen de los eventos que descargó
// y comprobó el propio navegador.
import type { LedgerEvent } from '@sigilo/contracts';

/** Cifras públicas de la bitácora. */
export interface LedgerSummary {
  /** Denuncias recibidas (`complaint.received`). */
  complaints: number;
  /**
   * Aperturas de un nombre sellado (`identity.opened`): las aprobadas por la autoridad y las que
   * la propia persona pidió al inconformarse.
   */
  identitiesOpened: number;
  /**
   * Entregas del sobre con el nombre a una cuenta de la autoridad (`identity.released`), en el
   * trámite o en el recurso; una apertura puede tener varias.
   */
  identitiesReleased: number;
}

/** Cuenta los eventos de una bitácora. Solo debe usarse con una bitácora que ya verificó. */
export function summarizeLedger(events: readonly LedgerEvent[]): LedgerSummary {
  const summary: LedgerSummary = { complaints: 0, identitiesOpened: 0, identitiesReleased: 0 };
  for (const event of events) {
    if (event.type === 'complaint.received') summary.complaints += 1;
    else if (event.type === 'identity.opened') summary.identitiesOpened += 1;
    else if (event.type === 'identity.released') summary.identitiesReleased += 1;
  }
  return summary;
}
