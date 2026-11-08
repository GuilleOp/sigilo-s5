// Gráfica de barras horizontales de una sola serie, con etiqueta y valor directos en cada barra
// (también para lectores de pantalla) y su tabla equivalente a un toque. Una sola serie: el color
// no identifica nada, así que nunca se depende de él.
// El ancho de cada barra se fija por CSSOM (permitido por la CSP sin estilos en línea).
import { useId } from 'react';
import { TableScroll } from './TableScroll.tsx';

/** Dato de la gráfica. */
export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** Texto del valor (por ejemplo «75 %»); por omisión, el número. */
  valueText?: string;
}

interface BarChartProps {
  title: string;
  /** Qué mide cada barra, para el encabezado de la tabla. */
  valueLabel: string;
  data: readonly BarDatum[];
  /** Máximo del eje; por omisión, el mayor valor. */
  max?: number;
  testId?: string;
}

/** Gráfica con tabla equivalente. */
export function BarChart({ title, valueLabel, data, max, testId }: BarChartProps) {
  const id = useId();
  const top = Math.max(max ?? 0, ...data.map((item) => item.value), 1);
  return (
    <figure className="bar-chart" aria-labelledby={`${id}-title`} data-testid={testId}>
      <figcaption id={`${id}-title`} className="bar-chart__title">
        {title}
      </figcaption>
      {/* Cada barra dice su concepto y su valor en texto; la tabla equivalente queda a un toque. */}
      <ul className="bar-chart__rows">
        {data.map((item) => (
          <li
            key={item.key}
            className="bar-chart__row"
            title={`${item.label}: ${item.valueText ?? item.value}`}
          >
            <span className="bar-chart__label">{item.label}</span>
            <span className="bar-chart__track">
              <span
                className="bar-chart__bar"
                style={{ inlineSize: `${Math.min(100, (item.value / top) * 100)}%` }}
              />
            </span>
            <span className="bar-chart__value">{item.valueText ?? String(item.value)}</span>
          </li>
        ))}
      </ul>
      <details className="more">
        <summary>Ver como tabla</summary>
        <TableScroll labelledBy={`${id}-table`}>
          <table className="data-table bar-chart__table">
            <caption id={`${id}-table`}>{title} (tabla)</caption>
            <thead>
              <tr>
                <th scope="col">Concepto</th>
                <th scope="col">{valueLabel}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.key}>
                  <th scope="row">{item.label}</th>
                  <td className="numeric">{item.valueText ?? String(item.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </details>
    </figure>
  );
}
