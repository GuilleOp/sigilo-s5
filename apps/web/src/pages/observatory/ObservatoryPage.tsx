// Pantalla /observatorio: «¿Sirvió denunciar?» con indicadores por autoridad y resultados agregados,
// la matriz de cobertura por entidad (con «Sin cobertura» explícito) y los conjuntos de datos
// abiertos descargables. Cada gráfica tiene su tabla equivalente y nada depende del color.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { PATHS } from '../../app/paths.ts';
import { TableScroll } from '../../components/TableScroll.tsx';
import { Alert } from '../../components/Alert.tsx';
import { BarChart } from '../../components/BarChart.tsx';
import { CoverageMap } from '../../components/a/CoverageMap.tsx';
import { Icon } from '../../components/a/icons.tsx';
import { SystemBadge } from '../../components/a/SystemBadge.tsx';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import {
  authorityIndicatorsCsv,
  COVERAGE_SYSTEM_LABELS,
  COVERAGE_SYSTEMS,
  DEMO_AUTHORITY_INDICATORS,
  DEMO_OUTCOMES,
  describePeriods,
  outcomesCsv,
  percent,
  summarizeCoverage,
} from './observatory-data.ts';
import type { CoverageEntityRow } from './observatory-data.ts';

/** Enlace de descarga de un CSV generado en el navegador. */
function CsvDownload({ name, csv, label }: { name: string; csv: string; label: string }) {
  const url = useMemo(() => URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), [csv]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <a
      className="button button--secondary"
      href={url}
      download={name}
      data-testid={`download-${name}`}
    >
      {label}
    </a>
  );
}

type CoverageState =
  { kind: 'loading' } | { kind: 'ready'; rows: CoverageEntityRow[] } | { kind: 'failed' };

function useCoverage(): CoverageState {
  const [state, setState] = useState<CoverageState>({ kind: 'loading' });
  useEffect(() => {
    let isActive = true;
    fetch('/datos/cobertura/matriz.json', {
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      mode: 'same-origin',
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('HTTP'))))
      .then(
        (raw: unknown) => {
          if (isActive) setState({ kind: 'ready', rows: summarizeCoverage(raw) });
        },
        () => {
          if (isActive) setState({ kind: 'failed' });
        },
      );
    return () => {
      isActive = false;
    };
  }, []);
  return state;
}

/** Contadores sobre la banda: cifras agregadas de la red (sintéticas en la demostración). */
function counters(): { label: string; value: string }[] {
  const total = DEMO_OUTCOMES.reduce((sum, row) => sum + row.count, 0);
  const find = (key: string) => DEMO_OUTCOMES.find((row) => row.key === key)?.count ?? 0;
  return [
    { label: 'denuncias en 12 meses', value: String(total) },
    { label: 'con sanción verificada', value: String(find('sanctioned-verified')) },
    {
      label: 'archivadas por falta de elementos',
      value: `${percent(find('insufficient-evidence'), total)} %`,
    },
    { label: 'autoridades observadas', value: String(DEMO_AUTHORITY_INDICATORS.length) },
  ];
}

/** Observatorio público. */
export function ObservatoryPage() {
  useDocumentTitle('Observatorio: ¿sirvió denunciar?');
  const coverage = useCoverage();
  const indicators = DEMO_AUTHORITY_INDICATORS.filter((row) => row.received > 0);
  return (
    <>
      <p className="crumbs">
        <SystemBadge system="S5" size="sm" /> Observatorio público
      </p>
      <h1 className="display-title">
        ¿Sirvió <strong>denunciar?</strong>
      </h1>
      <dl className="counters" data-testid="observatory-counters">
        {counters().map((counter) => (
          <div key={counter.label} className="counters__item">
            <dt>{counter.label}</dt>
            <dd>{counter.value}</dd>
          </div>
        ))}
      </dl>
      <Alert tone="info" title="Datos de demostración">
        <p>
          Los indicadores por autoridad y los resultados son sintéticos (escenario de la
          demostración). La matriz de cobertura usa cifras públicas agregadas de la Plataforma
          Digital Nacional, sin datos de personas. Nada aquí identifica a quien denunció.
        </p>
      </Alert>

      <section aria-labelledby="outcomes-title" className="observatory-section">
        <h2 id="outcomes-title">¿Qué pasó con las denuncias?</h2>
        <p>
          Toda la red, 12 meses. Conteos redondeados a múltiplos de 5. Solo cuenta como «sanción
          verificada» la que aparece en el registro público de sanciones.
        </p>
        <BarChart
          title="Denuncias por resultado"
          valueLabel="Denuncias"
          data={DEMO_OUTCOMES.map((row) => ({ key: row.key, label: row.label, value: row.count }))}
          testId="chart-outcomes"
        />
        <CsvDownload
          name="resultados.csv"
          csv={outcomesCsv(DEMO_OUTCOMES)}
          label="Descargar (CSV)"
        />
      </section>

      <section aria-labelledby="authorities-title" className="observatory-section">
        <h2 id="authorities-title">Indicadores por autoridad</h2>
        <p>
          Una tasa de archivo alta o muchos acuerdos con la misma plantilla no prueban nada por sí
          solos: son señales para que la ciudadanía y los comités pregunten.
        </p>
        <BarChart
          title="Porcentaje de denuncias archivadas por autoridad"
          valueLabel="Tasa de archivo"
          max={100}
          data={indicators.map((row) => ({
            key: row.authorityId,
            label: row.name,
            value: percent(row.archived, row.received),
            valueText: `${percent(row.archived, row.received)} %`,
          }))}
          testId="chart-archive-rate"
        />
        <details className="more">
          <summary>Ver todos los indicadores por autoridad</summary>
          <TableScroll labelledBy={'indicators-caption'}>
            <table className="data-table--wide data-table" data-testid="authority-indicators">
              <caption id={'indicators-caption'}>
                Indicadores por autoridad (12 meses previos)
              </caption>
              <thead>
                <tr>
                  <th scope="col">Autoridad</th>
                  <th scope="col">Recibidas</th>
                  <th scope="col">Archivadas</th>
                  <th scope="col">Plazo vencido</th>
                  <th scope="col">Acuerdos con plantilla</th>
                  <th scope="col">Sanciones declaradas</th>
                  <th scope="col">Confirmadas</th>
                  <th scope="col">Contradichas</th>
                  <th scope="col">Sin cobertura</th>
                </tr>
              </thead>
              <tbody>
                {DEMO_AUTHORITY_INDICATORS.map((row) => (
                  <tr key={row.authorityId}>
                    <th scope="row">{row.name}</th>
                    <td className="numeric">{row.received}</td>
                    <td className="numeric">
                      {row.archived} ({percent(row.archived, row.received)} %)
                    </td>
                    <td className="numeric">{row.overdue}</td>
                    <td className="numeric">{row.templateClosures}</td>
                    <td className="numeric">{row.declaredSanctions}</td>
                    <td className="numeric">{row.confirmed}</td>
                    <td className="numeric">{row.contradicted}</td>
                    <td className="numeric">{row.noCoverage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </details>
        <CsvDownload
          name="indicadores-por-autoridad.csv"
          csv={authorityIndicatorsCsv(DEMO_AUTHORITY_INDICATORS)}
          label="Descargar (CSV)"
        />
      </section>

      <section aria-labelledby="coverage-title" className="observatory-section">
        <h2 id="coverage-title">¿Qué se puede comprobar en cada entidad?</h2>
        <p>
          Para verificar sanciones, conflictos de interés o contratos, la entidad debe tener sus
          datos en la Plataforma Digital Nacional. «Sin cobertura» quiere decir que no podemos
          comprobar nada ahí: nunca que no haya sanciones o conflictos.
        </p>
        {coverage.kind === 'loading' && <p>Cargando la matriz de cobertura.</p>}
        {coverage.kind === 'failed' && (
          <Alert tone="warning" title="No pudimos cargar la matriz">
            <p>Inténtalo de nuevo más tarde.</p>
          </Alert>
        )}
        {coverage.kind === 'ready' && (
          <figure className="coverage-figure" data-testid="coverage-map">
            <CoverageMap rows={coverage.rows} />
            <figcaption>
              <p className="source">
                Mapa de nodos de las 32 entidades. Es aproximado y no muestra ubicaciones de
                personas. La tabla de abajo dice lo mismo.
              </p>
              <ul className="coverage-legend">
                <li>
                  <span className="coverage-legend__dot" data-level="full" aria-hidden="true" />
                  <Icon name="check" /> 4 o 5 sistemas con datos
                </li>
                <li>
                  <span className="coverage-legend__dot" data-level="partial" aria-hidden="true" />
                  <Icon name="info" /> De 1 a 3 sistemas
                </li>
                <li>
                  <span className="coverage-legend__dot" data-level="none" aria-hidden="true" />
                  <Icon name="nocov" /> Sin cobertura
                </li>
                <li>
                  <span className="coverage-legend__dot" data-own="true" aria-hidden="true" />
                  <Icon name="route" /> Nodo propio (Querétaro); las demás usan el nodo común
                </li>
              </ul>
            </figcaption>
          </figure>
        )}
        {coverage.kind === 'ready' && (
          <details className="more">
            <summary>Ver la tabla de las 32 entidades</summary>
            <TableScroll labelledBy={'coverage-caption'}>
              <table
                className="data-table--wide data-table coverage-matrix"
                data-testid="coverage-matrix"
              >
                <caption id={'coverage-caption'}>Periodos con datos por entidad y sistema</caption>
                <thead>
                  <tr>
                    <th scope="col">Entidad</th>
                    {COVERAGE_SYSTEMS.map((system) => (
                      <th key={system} scope="col">
                        {COVERAGE_SYSTEM_LABELS[system]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {coverage.rows.map((row) => (
                    <tr key={row.stateCode} data-synthetic={row.isSynthetic || undefined}>
                      <th scope="row">{row.stateName}</th>
                      {COVERAGE_SYSTEMS.map((system) => {
                        const periods = row.periods[system];
                        const isCovered = periods.length > 0;
                        return (
                          <td key={system} className="coverage-cell" data-covered={isCovered}>
                            <Icon
                              name={isCovered ? 'check' : 'nocov'}
                              className="icon coverage-cell__icon"
                            />
                            {describePeriods(periods)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </details>
        )}
      </section>

      <p className="observatory-more" data-testid="observatory-downloads">
        Todos estos datos se pueden descargar en <Link to={PATHS.openData}>Datos abiertos</Link>.
      </p>
    </>
  );
}
