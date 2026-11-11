// Pantalla /datos-abiertos: tabla del CSV agregado y descarga, con supresión de celdas pequeñas.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { PATHS } from '../../app/paths.ts';
import { TableScroll } from '../../components/TableScroll.tsx';
import {
  ComplaintStatusSchema,
  findOffense,
  findState,
  OPEN_DATA_MIN_CELL,
  OPEN_DATA_ROUNDING,
  ROUTES,
} from '@sigilo/contracts';
import { Alert } from '../../components/Alert.tsx';
import { OpenDatasets } from './OpenDatasets.tsx';
import { parseOpenDataCsv } from '../../lib/csv.ts';
import type { OpenDataTable } from '../../lib/csv.ts';
import { formatMonthPeriod, STATUS_LABELS } from '../../lib/format.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { api } from '../../services/api.ts';
import { describeError } from '../../services/api-client.ts';

const HEADER_LABELS: Readonly<Record<string, string>> = {
  entidad: 'Estado',
  conducta: 'Conducta',
  mes_recepcion: 'Mes de recepción',
  estatus: 'Estatus',
  denuncias: 'Denuncias',
};

function displayCell(header: string, value: string): string {
  if (header === 'entidad') return findState(value)?.name ?? value;
  if (header === 'conducta') return findOffense(value)?.label ?? value;
  if (header === 'mes_recepcion') return formatMonthPeriod(value);
  if (header === 'estatus') {
    const status = ComplaintStatusSchema.safeParse(value);
    return status.success ? STATUS_LABELS[status.data] : value;
  }
  return value;
}

/** Datos abiertos. */
export function OpenDataPage() {
  useDocumentTitle('Datos abiertos');
  const [table, setTable] = useState<OpenDataTable | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getOpenDataCsv().then(
      (csv) => setTable(parseOpenDataCsv(csv)),
      (failure: unknown) => setError(describeError(failure, 'No se pudieron cargar los datos.')),
    );
  }, []);

  return (
    <>
      <h1>Datos abiertos</h1>
      <p>
        Número de denuncias por estado, conducta, mes en que llegaron y estatus. No incluye folios,
        descripciones ni datos de personas.
      </p>
      <p data-testid="open-data-scope">
        <strong>Esta tabla es solo de este nodo:</strong> cuenta las denuncias que llegaron a las
        autoridades que atiende este servidor. Cada nodo de la red publica la suya; la suma de{' '}
        <strong>toda la red</strong> está en el <Link to={PATHS.observatory}>Observatorio</Link>.
      </p>
      <Alert tone="info" title="Cómo protegemos a quienes denuncian">
        <p>
          Los números están redondeados de {OPEN_DATA_ROUNDING} en {OPEN_DATA_ROUNDING}, a veces
          hacia arriba y a veces hacia abajo, al azar. Por ejemplo, 7 denuncias pueden aparecer como
          5 o como 10. Así nadie puede saber si en una fila hay una denuncia más o una menos.
        </p>
        <p>
          Las filas que quedan en 0 no se publican: una fila con menos de {OPEN_DATA_MIN_CELL}{' '}
          denuncias podría señalar a una persona. Solo decimos cuántas denuncias quedaron fuera en
          total.
        </p>
        <p>
          Solo publicamos meses completos. Las denuncias de este mes aparecerán cuando termine el
          mes.
        </p>
      </Alert>
      <p>
        <a
          className="button"
          href={ROUTES.openDataCsv}
          download="denuncias.csv"
          data-testid="download-csv"
        >
          Descargar la tabla (archivo CSV, se abre con Excel)
        </a>
      </p>
      {error && (
        <Alert tone="danger" title="Error" role="alert">
          <p>{error}</p>
        </Alert>
      )}
      {/* Región persistente: anuncia la carga y su fin (el fin solo lo oyen los lectores de pantalla:
          en pantalla ya se ve la tabla). */}
      <p role="status" aria-live="polite">
        {table === null && !error ? 'Cargando datos.' : ''}
        {table !== null && <span className="visually-hidden">Datos cargados.</span>}
      </p>
      {table !== null && (
        <>
          <p data-testid="suppressed-count">
            Denuncias que no mostramos para proteger a quienes denunciaron: {table.suppressed}.
          </p>
          {table.rows.length === 0 ? (
            <p>Aún no hay combinaciones con {OPEN_DATA_MIN_CELL} denuncias o más.</p>
          ) : (
            <TableScroll labelledBy={'open-data-caption'}>
              <table data-testid="open-data-table">
                <caption id={'open-data-caption'}>Número de denuncias</caption>
                <thead>
                  <tr>
                    {table.headers.map((header) => (
                      <th key={header} scope="col">
                        {HEADER_LABELS[header] ?? header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex}>{displayCell(table.headers[cellIndex] ?? '', cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </>
      )}
      <OpenDatasets />
    </>
  );
}
