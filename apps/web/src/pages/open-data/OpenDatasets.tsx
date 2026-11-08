// Conjuntos de datos abiertos publicados en el mismo origen (ver vite.config.ts): agregados, con
// los conteos pequeños suprimidos o en rangos. Viven en «Datos abiertos»; el observatorio enlaza.
/** Conjuntos de datos abiertos publicados en el mismo origen (ver vite.config.ts). */
export const OPEN_DATASETS = [
  {
    title: 'Matriz de cobertura de la PDN por entidad',
    files: [
      ['/datos/abiertos/cobertura/matriz-cobertura.csv', 'Datos (CSV)'],
      ['/datos/abiertos/cobertura/diccionario.csv', 'Diccionario (CSV)'],
      ['/datos/abiertos/cobertura/metodologia.md', 'Metodología'],
    ],
  },
  {
    title: 'Indicadores de contratación federal por comprador',
    files: [
      ['/datos/abiertos/contratacion-federal/indicadores-comprador.csv', 'Datos (CSV)'],
      ['/datos/abiertos/contratacion-federal/indicadores-comprador-anio.csv', 'Por año (CSV)'],
      ['/datos/abiertos/contratacion-federal/diccionario.csv', 'Diccionario (CSV)'],
      ['/datos/abiertos/contratacion-federal/metodologia.md', 'Metodología'],
    ],
  },
  {
    title: 'Grupos de anonimato (tamaños en rangos)',
    files: [
      ['/datos/abiertos/grupos-anonimato/resumen.csv', 'Resumen (CSV)'],
      ['/datos/abiertos/grupos-anonimato/cubetas.csv', 'Rangos (CSV)'],
      ['/datos/abiertos/grupos-anonimato/diccionario.csv', 'Diccionario (CSV)'],
      ['/datos/abiertos/grupos-anonimato/metodologia.md', 'Metodología'],
    ],
  },
] as const;

/** Lista de descargas. */
export function OpenDatasets() {
  return (
    <section aria-labelledby="datasets-title" className="card">
      <h2 id="datasets-title">Más conjuntos de datos</h2>
      <ul className="dataset-list" data-testid="open-datasets">
        {OPEN_DATASETS.map((dataset) => (
          <li key={dataset.title}>
            <p className="dataset-list__title">{dataset.title}</p>
            <ul className="dataset-list__files">
              {dataset.files.map(([href, label]) => (
                <li key={href}>
                  <a href={href} download>
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
