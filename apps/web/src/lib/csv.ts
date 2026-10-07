// Lectura del CSV de datos abiertos (RFC 4180) para mostrarlo en tabla.

/** Datos abiertos ya interpretados. */
export interface OpenDataTable {
  headers: string[];
  rows: string[][];
  /** Denuncias omitidas por pertenecer a celdas pequeñas (fila final `suprimidas,<n>`). */
  suppressed: number;
}

/** Divide un CSV en filas y campos, respetando comillas dobles y comillas escapadas. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (inQuotes) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (character === '"') {
        inQuotes = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') inQuotes = true;
    else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Interpreta el CSV de datos abiertos y separa la fila final de supresión. */
export function parseOpenDataCsv(text: string): OpenDataTable {
  const [headers = [], ...body] = parseCsv(text).filter((row) => row.some((cell) => cell !== ''));
  let suppressed = 0;
  const rows: string[][] = [];
  for (const row of body) {
    if (row[0] === 'suprimidas' && row.length === 2) {
      suppressed = Number.parseInt(row[1] ?? '0', 10) || 0;
    } else {
      // El servidor antepone un apóstrofo a valores que parecen fórmulas; aquí se muestra tal cual.
      rows.push(row);
    }
  }
  return { headers, rows, suppressed };
}
