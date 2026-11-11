// Pantalla /observatorio: «¿Sirvió denunciar?» con indicadores por autoridad y resultados agregados,
// la matriz de cobertura por entidad (con «Sin cobertura» explícito) y los conjuntos de datos
// abiertos descargables. Cada gráfica tiene su tabla equivalente y nada depende del color.
// En modo red, los resultados agregados salen del corte nacional del enrutador; sin red, de la
// línea base sintética, rotulada «Datos de ejemplo».
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { PATHS } from '../../app/paths.ts';
import { TableScroll } from '../../components/TableScroll.tsx';
import { Alert } from '../../components/Alert.tsx';
import { BarChart } from '../../components/BarChart.tsx';
import { CoverageMap } from '../../components/a/CoverageMap.tsx';
import { Icon } from '../../components/a/icons.tsx';
import { SystemBadge } from '../../components/a/SystemBadge.tsx';
import { formatMonthPeriod } from '../../lib/format.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { networkState } from '../../network/directory.ts';
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
import type { CoverageEntityRow, OutcomeCount } from './observatory-data.ts';
import { complaintsByState, parseAnonymitySummary } from './map-layers.ts';
import type { AnonymityByState } from './map-layers.ts';
import {
  cutTotal,
  EXAMPLE_REASONS,
  loadNetworkOutcomes,
  nodeNotes,
  statusTotals,
  suppressedRow,
} from './network-outcomes.ts';
import type { NetworkOutcomes } from './network-outcomes.ts';

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

/** Porcentaje de personas con k ≥ 10 por entidad (datos abiertos); vacío si no se puede cargar. */
function useAnonymitySummary(): AnonymityByState {
  const [state, setState] = useState<AnonymityByState>(() => new Map());
  useEffect(() => {
    let isActive = true;
    fetch('/datos/abiertos/grupos-anonimato/resumen.csv', {
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      mode: 'same-origin',
    })
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error('HTTP'))))
      .then(
        (text) => {
          if (isActive) setState(parseAnonymitySummary(text));
        },
        () => {
          // Sin el resumen, la capa muestra todas las entidades «sin datos».
        },
      );
    return () => {
      isActive = false;
    };
  }, []);
  return state;
}

/** Resultados agregados: el corte nacional en modo red o los datos de ejemplo. */
function useNetworkOutcomes(): NetworkOutcomes {
  const [state, setState] = useState<NetworkOutcomes>({ kind: 'loading' });
  useEffect(() => {
    let isActive = true;
    void networkState()
      .then((network) => loadNetworkOutcomes(network))
      .then((loaded) => {
        if (isActive) setState(loaded);
      });
    return () => {
      isActive = false;
    };
  }, []);
  return state;
}

/** Rótulo visible del origen de una sección: corte de la red o datos de ejemplo. */
function DataSource({ isExample, testId }: { isExample: boolean; testId: string }) {
  return (
    <p className="data-source" data-kind={isExample ? 'example' : 'network'} data-testid={testId}>
      {isExample ? 'Datos de ejemplo' : 'Datos de la red'}
    </p>
  );
}

/** Contadores sobre la banda: cifras agregadas de la red (sintéticas sin red). */
function counters(outcomes: NetworkOutcomes): { label: string; value: string }[] {
  if (outcomes.kind === 'network') {
    const { cut } = outcomes;
    const included = cut.nodes.filter((node) => node.status === 'included').length;
    const months = new Set(cut.cells.map((cell) => cell.month)).size;
    return [
      { label: 'denuncias en meses cerrados', value: String(cutTotal(cut)) },
      { label: 'nodos sumados en este corte', value: `${included} de ${cut.nodes.length}` },
      {
        label: months === 1 ? 'mes publicado' : 'meses publicados',
        value: String(months),
      },
      {
        label: 'autoridades observadas (ejemplo)',
        value: String(DEMO_AUTHORITY_INDICATORS.length),
      },
    ];
  }
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
  const anonymity = useAnonymitySummary();
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const outcomes = useNetworkOutcomes();
  const isNetwork = outcomes.kind === 'network';
  const outcomeRows: readonly OutcomeCount[] = isNetwork
    ? statusTotals(outcomes.cut)
    : DEMO_OUTCOMES;
  // Las suprimidas no son un estatus: van en una nota bajo la gráfica y en el CSV.
  const suppressed = isNetwork ? suppressedRow(outcomes.cut) : null;
  const notes = outcomes.kind === 'loading' || outcomes.cut === null ? [] : nodeNotes(outcomes.cut);
  const mapData = useMemo(
    () => ({
      anonymity,
      complaints: complaintsByState(isNetwork ? outcomes.cut.cells : []),
    }),
    [anonymity, isNetwork, outcomes],
  );
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
        {counters(outcomes).map((counter) => (
          <div key={counter.label} className="counters__item">
            <dt>{counter.label}</dt>
            <dd>{counter.value}</dd>
          </div>
        ))}
      </dl>
      <Alert tone="info" title="Datos de demostración">
        <p>
          {isNetwork
            ? 'Los resultados de la red suman los datos abiertos de cada nodo. Los indicadores por autoridad son sintéticos (escenario de la demostración).'
            : 'Los indicadores por autoridad y los resultados son sintéticos (escenario de la demostración).'}{' '}
          La matriz de cobertura usa cifras públicas agregadas de la Plataforma Digital Nacional,
          sin datos de personas. Nada aquí identifica a quien denunció.
        </p>
      </Alert>

      <section aria-labelledby="outcomes-title" className="observatory-section">
        <h2 id="outcomes-title">¿Qué pasó con las denuncias?</h2>
        {outcomes.kind !== 'loading' && (
          <DataSource isExample={!isNetwork} testId="outcomes-source" />
        )}
        {isNetwork ? (
          <p>
            Toda la red: suma de los datos abiertos que publica cada nodo, solo meses cerrados
            (antes de {formatMonthPeriod(outcomes.cut.closedBefore)}). Conteos redondeados a
            múltiplos de {outcomes.cut.rounding}; lo menor que {outcomes.cut.minCell} se suprime.
          </p>
        ) : (
          <p>
            {outcomes.kind === 'example' ? `${EXAMPLE_REASONS[outcomes.reason]} ` : ''}Toda la red,
            12 meses. Conteos redondeados a múltiplos de 5. Solo cuenta como «sanción verificada» la
            que aparece en el registro público de sanciones.
          </p>
        )}
        {notes.length > 0 && (
          <ul className="data-source__notes" data-testid="outcomes-node-notes">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
        <BarChart
          title={isNetwork ? 'Denuncias por estatus' : 'Denuncias por resultado'}
          valueLabel="Denuncias"
          data={outcomeRows.map((row) => ({ key: row.key, label: row.label, value: row.count }))}
          testId="chart-outcomes"
        />
        {suppressed !== null && isNetwork && (
          <p className="muted" data-testid="outcomes-suppressed">
            Además, {suppressed.count}{' '}
            {suppressed.count === 1 ? 'denuncia no aparece' : 'denuncias no aparecen'} en la
            gráfica: estaban en grupos de menos de {outcomes.cut.minCell} y se suprimen para que
            nadie pueda ser reconocido.
          </p>
        )}
        <CsvDownload
          name="resultados.csv"
          csv={outcomesCsv(suppressed === null ? outcomeRows : [...outcomeRows, suppressed])}
          label="Descargar (CSV)"
        />
      </section>

      <section aria-labelledby="authorities-title" className="observatory-section">
        <h2 id="authorities-title">Indicadores por autoridad</h2>
        <DataSource isExample testId="authorities-source" />
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

      <section aria-labelledby="map-title" className="observatory-section">
        <h2 id="map-title">El S5 en cada entidad</h2>
        <p>
          Cómo llega la denuncia a cada entidad, cuántas se publican y qué tan protegido estaría
          quien denuncia. Solo cifras agregadas por entidad; nunca municipios ni personas.
        </p>
        <figure className="coverage-figure" data-testid="coverage-map">
          <CoverageMap data={mapData} selected={selectedState} onSelect={setSelectedState} />
          <figcaption className="source">
            Mapa de las 32 entidades; no muestra ubicaciones de personas. Las denuncias por entidad
            salen del corte nacional (meses cerrados, celdas de 5 o más).
          </figcaption>
        </figure>
      </section>

      <section aria-labelledby="coverage-title" className="observatory-section">
        <h2 id="coverage-title">¿Qué se puede comprobar en cada entidad?</h2>
        <p>
          Para verificar sanciones, conflictos de interés o contratos, la entidad debe tener sus
          datos en la Plataforma Digital Nacional. «Sin cobertura» quiere decir que no podemos
          comprobar nada ahí: nunca que no haya sanciones o conflictos. La cobertura completa de
          todos los sistemas la publica la SESNA en{' '}
          <a href="https://cobertura.plataformadigitalnacional.org/" rel="noreferrer">
            la página de cobertura de la PDN
          </a>
          ; esta tabla resume solo lo que usa el S5.
        </p>
        {coverage.kind === 'loading' && <p>Cargando la matriz de cobertura.</p>}
        {coverage.kind === 'failed' && (
          <Alert tone="warning" title="No pudimos cargar la matriz">
            <p>Inténtalo de nuevo más tarde.</p>
          </Alert>
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
                    <tr
                      key={row.stateCode}
                      id={`coverage-row-${row.stateCode}`}
                      tabIndex={-1}
                      data-synthetic={row.isSynthetic || undefined}
                      data-selected={row.stateCode === selectedState || undefined}
                    >
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
