// Listado de denuncias (resúmenes sin identidad), con el estado de turnado en el vocabulario del S5.
import { findManagementState, findOffense, findState } from '@sigilo/contracts';
import { TableScroll } from '../../components/TableScroll.tsx';
import type { ComplaintSummary } from '@sigilo/contracts';
import { formatShortDate, STATUS_LABELS } from '../../lib/format.ts';
import { TurnSemaphore } from './TurnSemaphore.tsx';

interface ComplaintListProps {
  complaints: readonly ComplaintSummary[];
  onOpen: (folio: string) => void;
  /**
   * Autoridad de la fiscalía de la sesión: las denuncias que tiene otra autoridad son vistas al
   * Ministerio Público recibidas (copias de lectura) y se marcan así.
   */
  referralAuthorityId?: string;
}

/**
 * Estado de gestión con el código de la versión de pruebas del S5 («SIN TURNAR», «TURNADA»…), para
 * que quien ya usa la bandeja de la SESNA lo reconozca. Las denuncias anteriores llegan al buzón.
 */
function s5Label(state: ComplaintSummary['managementState']): string {
  return (findManagementState(state ?? 'received_in_inbox')?.s5Code ?? 'SIN_TURNAR').replace(
    /_/gu,
    ' ',
  );
}

/**
 * Tabla de denuncias recibidas. En celular cada fila se ve como tarjeta (folio, conducta, estatus y
 * fecha); `data-label` da el nombre de cada dato en esa vista.
 */
export function ComplaintList({ complaints, onOpen, referralAuthorityId }: ComplaintListProps) {
  if (complaints.length === 0) return <p>No hay denuncias todavía.</p>;
  return (
    <TableScroll labelledBy={'complaint-list-caption'}>
      <table className="data-table--wide complaint-list" data-testid="complaint-list">
        <caption id={'complaint-list-caption'} className="visually-hidden">
          Denuncias recibidas
        </caption>
        <thead>
          <tr>
            <th scope="col">Folio</th>
            <th scope="col">Conducta</th>
            <th scope="col">Estatus</th>
            <th scope="col">Meta de turnado del S5</th>
            <th scope="col">Recibida</th>
            <th scope="col">Entidad</th>
            <th scope="col">Modo</th>
          </tr>
        </thead>
        <tbody>
          {complaints.map((complaint) => (
            <tr key={complaint.folio}>
              <th scope="row" className="complaint-list__folio">
                <button
                  type="button"
                  className="button button--secondary mono folio"
                  onClick={() => onOpen(complaint.folio)}
                  data-testid="open-complaint"
                >
                  {complaint.folio}
                </button>
              </th>
              <td data-label="Conducta" className="complaint-list__offense">
                {findOffense(complaint.offenseCode)?.label ?? complaint.offenseCode}
              </td>
              {/* Turnado (código del S5) y estatus en lenguaje claro, en una sola celda. */}
              <td data-label="Estatus" className="complaint-list__status">
                <span className="s5-code" data-testid="s5-code">
                  {s5Label(complaint.managementState)}
                </span>{' '}
                <span className="complaint-list__status-text">
                  {STATUS_LABELS[complaint.status]}
                </span>
                {referralAuthorityId !== undefined &&
                  complaint.assignedAuthorityId !== undefined &&
                  complaint.assignedAuthorityId !== referralAuthorityId && (
                    <span className="complaint-list__status-text" data-testid="referral-copy">
                      {' '}
                      · Vista al Ministerio Público (copia de lectura)
                    </span>
                  )}
              </td>
              <td data-label="Meta de turnado del S5">
                <TurnSemaphore semaphore={complaint.turnSemaphore} />
              </td>
              <td data-label="Recibida" className="complaint-list__date">
                {formatShortDate(complaint.receivedOn)}
              </td>
              <td data-label="Entidad">
                {findState(complaint.stateCode)?.name ?? complaint.stateCode}
              </td>
              <td data-label="Modo">
                {complaint.mode === 'sealed' ? 'Identidad sellada' : 'Anónima'}
                {complaint.protectionRequested ? ', pide protección' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}
