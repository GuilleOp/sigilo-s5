// Listado de denuncias (resúmenes sin identidad), con el estado de turnado en el vocabulario del S5.
import { findManagementState, findOffense, findState } from '@sigilo/contracts';
import { TableScroll } from '../../components/TableScroll.tsx';
import type { ComplaintSummary } from '@sigilo/contracts';
import { formatDayDate, STATUS_LABELS } from '../../lib/format.ts';

interface ComplaintListProps {
  complaints: readonly ComplaintSummary[];
  onOpen: (folio: string) => void;
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

/** Tabla de denuncias recibidas. */
export function ComplaintList({ complaints, onOpen }: ComplaintListProps) {
  if (complaints.length === 0) return <p>No hay denuncias todavía.</p>;
  return (
    <TableScroll labelledBy={'complaint-list-caption'}>
      <table className="data-table--wide" data-testid="complaint-list">
        <caption id={'complaint-list-caption'} className="visually-hidden">
          Denuncias recibidas
        </caption>
        <thead>
          <tr>
            <th scope="col">Folio</th>
            <th scope="col">Recibida</th>
            <th scope="col">Estado</th>
            <th scope="col">Conducta</th>
            <th scope="col">Modo</th>
            <th scope="col">Turnado</th>
            <th scope="col">Estatus</th>
          </tr>
        </thead>
        <tbody>
          {complaints.map((complaint) => (
            <tr key={complaint.folio}>
              <th scope="row">
                <button
                  type="button"
                  className="button button--secondary mono folio"
                  onClick={() => onOpen(complaint.folio)}
                  data-testid="open-complaint"
                >
                  {complaint.folio}
                </button>
              </th>
              <td>{formatDayDate(complaint.receivedOn)}</td>
              <td>{findState(complaint.stateCode)?.name ?? complaint.stateCode}</td>
              <td>{findOffense(complaint.offenseCode)?.label ?? complaint.offenseCode}</td>
              <td>
                {complaint.mode === 'sealed' ? 'Identidad sellada' : 'Anónima'}
                {complaint.protectionRequested ? ', pide protección' : ''}
              </td>
              <td>
                <span className="s5-code" data-testid="s5-code">
                  {s5Label(complaint.managementState)}
                </span>
              </td>
              <td>{STATUS_LABELS[complaint.status]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}
