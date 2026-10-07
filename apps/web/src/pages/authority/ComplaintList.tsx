// Listado de denuncias (resúmenes sin identidad).
import { findOffense, findState } from '@sigilo/contracts';
import type { ComplaintSummary } from '@sigilo/contracts';
import { formatDayDate, STATUS_LABELS } from '../../lib/format.ts';

interface ComplaintListProps {
  complaints: readonly ComplaintSummary[];
  onOpen: (folio: string) => void;
}

/** Tabla de denuncias recibidas. */
export function ComplaintList({ complaints, onOpen }: ComplaintListProps) {
  if (complaints.length === 0) return <p>No hay denuncias todavía.</p>;
  return (
    <div className="table-scroll">
      <table data-testid="complaint-list">
        <caption className="visually-hidden">Denuncias recibidas</caption>
        <thead>
          <tr>
            <th scope="col">Folio</th>
            <th scope="col">Recibida</th>
            <th scope="col">Estado</th>
            <th scope="col">Conducta</th>
            <th scope="col">Modo</th>
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
              <td>{STATUS_LABELS[complaint.status]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
