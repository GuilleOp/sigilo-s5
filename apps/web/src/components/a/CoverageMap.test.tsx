// Pruebas del mapa del observatorio: el resumen en texto se calcula con los datos publicados, la
// capa de anonimato sale del resumen abierto y el marcado trae las 32 entidades enfocables, la
// trama de «sin datos», el crédito del INEGI y ningún estilo en línea (la CSP lo prohíbe).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  MAP_LEGENDS,
  mapSummary,
  mapValue,
  parseAnonymitySummary,
} from '../../pages/observatory/map-layers.ts';
import { summarizeCoverage } from '../../pages/observatory/observatory-data.ts';
import { CoverageMap } from './CoverageMap.tsx';

const ROOT = resolve(import.meta.dirname, '../../../../..');
const ROWS = summarizeCoverage(
  JSON.parse(readFileSync(resolve(ROOT, 'datos/cobertura/matriz.json'), 'utf8')) as unknown,
);
const ANONYMITY = parseAnonymitySummary(
  readFileSync(resolve(ROOT, 'datos/abiertos/grupos-anonimato/resumen.csv'), 'utf8'),
);

/** Cuenta, con la matriz, las entidades con 4 o 5, de 1 a 3 y ningún sistema (solo 01 a 32). */
function expectedCoverage(): [number, number, number] {
  const counts = ROWS.filter((row) => /^(0[1-9]|[12]\d|3[0-2])$/u.test(row.stateCode)).map(
    (row) => Object.values(row.periods).filter((periods) => periods.length > 0).length,
  );
  return [
    counts.filter((count) => count >= 4).length,
    counts.filter((count) => count >= 1 && count <= 3).length,
    counts.filter((count) => count === 0).length,
  ];
}

describe('capas del mapa', () => {
  it('el resumen de cobertura se calcula con la matriz publicada', () => {
    const [full, partial, none] = expectedCoverage();
    expect(full + partial + none).toBe(32);
    expect(mapSummary('coverage', ROWS, ANONYMITY)).toBe(
      `${full} de 32 entidades tienen 4 o 5 sistemas de la PDN con datos; ${partial} tienen de 1 a 3 y ${none} no tienen ninguno.`,
    );
  });

  it('el anonimato es 100 menos el porcentaje con k < 10 por área; sin S1 no hay dato', () => {
    // Aguascalientes: pct_personas_k_menor_10_area = 10.7.
    expect(ANONYMITY.get('01')).toBe(89.3);
    // Ni lo federal ni el agregado nacional van al mapa; Querétaro no trae S1.
    expect(ANONYMITY.has('00')).toBe(false);
    expect(ANONYMITY.has('NAC')).toBe(false);
    expect(mapValue('anonymity', '22', undefined, ANONYMITY)).toEqual({
      step: null,
      text: 'Sin datos del S1 en la descarga',
    });
    expect(mapValue('anonymity', '01', undefined, ANONYMITY).step).toBe(5);
    expect(mapSummary('anonymity', ROWS, ANONYMITY)).toMatch(
      new RegExp(`^${ANONYMITY.size} de 32 entidades tienen datos del S1\\.`, 'u'),
    );
  });

  it('solo Querétaro tiene nodo propio y el Estado Ejemplo no está en el mapa', () => {
    expect(mapValue('node', '22', undefined, ANONYMITY).text).toBe('Nodo propio');
    expect(mapValue('node', '14', undefined, ANONYMITY).text).toBe('Nodo común');
    expect(mapSummary('node', ROWS, ANONYMITY)).toBe(
      'Querétaro opera su propio nodo; las otras 31 entidades usan el nodo común.',
    );
  });

  it('cada leyenda dice con texto qué es cada escalón', () => {
    for (const items of Object.values(MAP_LEGENDS)) {
      for (const item of items) expect(item.label.length).toBeGreaterThan(0);
    }
  });
});

describe('marcado del mapa', () => {
  const html = renderToStaticMarkup(
    <CoverageMap
      rows={ROWS}
      anonymity={ANONYMITY}
      selected="22"
      onSelect={() => undefined}
      onShowRow={() => undefined}
    />,
  );

  it('trae las 32 entidades como botones, una sola en el orden de tabulación', () => {
    expect(html.match(/data-testid="map-entity-\d{2}"/gu)?.length).toBe(32);
    expect(html.match(/role="button"/gu)?.length).toBe(32);
    expect(html.match(/tabindex="0"/gu)?.length).toBe(1);
    expect(html).toContain('aria-label="Querétaro: 1 de 5 sistemas con datos"');
    expect(html).toContain('aria-pressed="true"');
  });

  it('muestra el resumen, la ficha de la entidad elegida, la trama y el crédito del INEGI', () => {
    expect(html).toContain(mapSummary('coverage', ROWS, ANONYMITY));
    expect(html).toContain('<h3 class="coverage-card__title">Querétaro</h3>');
    expect(html).toMatch(/<pattern id="[^"]+-trama"/u);
    expect(html).toContain('Fuente: INEGI, Marco Geoestadístico, diciembre de 2025.');
  });

  it('no usa estilos en línea ni pide nada a otro origen', () => {
    expect(html).not.toContain('style=');
    expect(html).not.toMatch(/https?:\/\//u);
  });
});
