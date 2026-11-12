// Pruebas del mapa del S5 en el observatorio: capas de conexión al S5, denuncias publicadas por
// 100 000 habitantes y protección del anonimato; el marcado trae las 32 entidades enfocables, la
// trama de «sin datos», el crédito del INEGI y ningún estilo en línea (la CSP lo prohíbe).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  complaintsByState,
  MAP_LEGENDS,
  mapSummary,
  mapValue,
  parseAnonymitySummary,
} from '../../pages/observatory/map-layers.ts';
import type { MapData } from '../../pages/observatory/map-layers.ts';
import { CoverageMap } from './CoverageMap.tsx';

const ROOT = resolve(import.meta.dirname, '../../../../..');
const ANONYMITY = parseAnonymitySummary(
  readFileSync(resolve(ROOT, 'datos/abiertos/grupos-anonimato/resumen.csv'), 'utf8'),
);
const COMPLAINTS = complaintsByState([
  { stateCode: '22', count: 10 },
  { stateCode: '22', count: 5 },
  { stateCode: '09', count: 5 },
]);
const DATA: MapData = { anonymity: ANONYMITY, complaints: COMPLAINTS };

describe('capas del mapa', () => {
  it('conexión al S5: Querétaro y Oaxaca con nodo propio y el resto sin nodo todavía', () => {
    expect(mapValue('node', '22', DATA).text).toContain('Nodo propio');
    expect(mapValue('node', '20', DATA).text).toContain('Nodo propio');
    expect(mapValue('node', '14', DATA).text).toContain('Sin nodo');
    expect(mapSummary('node', DATA)).toBe(
      'Querétaro y Oaxaca operan su propio nodo del S5; las otras 30 entidades todavía no montan el suyo: sus denuncias estatales y municipales no pueden enviarse por la ventanilla hasta que lo hagan.',
    );
  });

  it('denuncias: suma por entidad, tasa por 100 000 habitantes y sin cifras pequeñas', () => {
    expect(COMPLAINTS.get('22')).toBe(15);
    expect(mapValue('complaints', '22', DATA).text).toMatch(/^15 denuncias publicadas \(/u);
    expect(mapValue('complaints', '14', DATA)).toEqual({
      step: null,
      text: 'Sin cifras publicadas (las menores de 5 no se publican)',
    });
    expect(mapSummary('complaints', DATA)).toMatch(/^2 entidades tienen denuncias publicadas/u);
    expect(mapSummary('complaints', { anonymity: ANONYMITY, complaints: new Map() })).toMatch(
      /^Todavía no hay meses cerrados/u,
    );
  });

  it('anonimato: sale del resumen abierto de grupos', () => {
    expect(mapSummary('anonymity', DATA)).toMatch(/de 32 entidades tienen datos del S1/u);
  });

  it('cada leyenda dice con texto qué es cada escalón', () => {
    for (const items of Object.values(MAP_LEGENDS)) {
      for (const item of items) expect(item.label.length).toBeGreaterThan(0);
    }
  });
});

describe('marcado del mapa', () => {
  const html = renderToStaticMarkup(
    <CoverageMap data={DATA} selected="22" onSelect={() => undefined} />,
  );

  it('trae las 32 entidades como botones, una sola en el orden de tabulación', () => {
    expect(html.match(/data-testid="map-entity-\d{2}"/gu)?.length).toBe(32);
    expect(html.match(/role="button"/gu)?.length).toBe(32);
    expect(html.match(/tabindex="0"/gu)?.length).toBe(1);
    expect(html).toContain('aria-pressed="true"');
  });

  it('muestra el resumen, la ficha de la entidad elegida, la trama y el crédito del INEGI', () => {
    expect(html).toContain(mapSummary('node', DATA));
    expect(html).toContain('<h3 class="coverage-card__title">Querétaro</h3>');
    expect(html).toMatch(/<pattern id="[^"]+-trama"/u);
    expect(html).toContain('Fuente: INEGI, Marco Geoestadístico, diciembre de 2025.');
  });

  it('no usa estilos en línea ni pide nada a otro origen', () => {
    expect(html).not.toContain('style=');
    expect(html).not.toMatch(/https?:\/\//u);
  });
});
