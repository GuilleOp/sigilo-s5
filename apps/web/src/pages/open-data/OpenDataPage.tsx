// Pantalla /datos-abiertos: tabla del CSV agregado y descarga, con supresión de celdas pequeñas.
import { useEffect, useState } from 'react';
import { OPEN_DATA_MIN_CELL, ROUTES } from '@sigilo/contracts';
import { findOffense, stateName } from '../../catalogs/catalog-search.ts';
import { Alert } from '../../components/Alert.tsx';
import { parseOpenDataCsv } from '../../lib/csv.ts';
import type { OpenDataTable } from '../../lib/csv.ts';
import { formatMonthPeriod, STATUS_LABELS } from '../../lib/format.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { api } from '../../services/api.ts';
import { describeError } from '../../services/api-client.ts';
import { ComplaintStatusSchema } from '@sigilo/contracts';

const HEADER_LABELS: Readonly<Record<string, string>> = {
  entidad: 'Entidad',
  conducta: 'Conducta',
  mes_recepcion: 'Mes de recepción',
  estatus: 'Estatus',
  denuncias: 'Denuncias',
};

function displayCell(header: string, value: string): string {
  if (header === 'entidad') return stateName(value);
  if (header === 'conducta') return findOffense(value)?.name ?? value;
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
        Número de denuncias por entidad, conducta, mes de recepción y estatus. No incluye folios,
        descripciones ni datos de personas.
      </p>
      <Alert tone="info" title="Por qué faltan algunas filas">
        <p>
          Una combinación con menos de {OPEN_DATA_MIN_CELL} denuncias podría señalar a una persona
          (por ejemplo, la única denuncia de un municipio en un mes). Por eso esas filas no se
          publican; solo se informa cuántas denuncias quedaron fuera en total.
        </p>
      </Alert>
      <p>
        <a
          className="button"
          href={ROUTES.openDataCsv}
          download="denuncias.csv"
          data-testid="download-csv"
        >
          Descargar CSV
        </a>
      </p>
      {error && (
        <Alert tone="danger" title="Error" role="alert">
          <p>{error}</p>
        </Alert>
      )}
      {table === null && !error && <p role="status">Cargando datos.</p>}
      {table !== null && (
        <>
          <p role="status" data-testid="suppressed-count">
            Denuncias omitidas por celdas pequeñas: {table.suppressed}.
          </p>
          {table.rows.length === 0 ? (
            <p>Aún no hay combinaciones con {OPEN_DATA_MIN_CELL} denuncias o más.</p>
          ) : (
            <div className="table-scroll">
              <table data-testid="open-data-table">
                <caption>Denuncias agregadas</caption>
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
            </div>
          )}
        </>
      )}
    </>
  );
}
