// Mapa de nodos de las 32 entidades (pieza de C en el lenguaje de A): cada entidad es un nodo
// conectado al nodo federal y común; Querétaro tiene nodo propio. El nodo dice cuántos sistemas de
// la PDN tienen datos (lleno, medio o, sin cobertura, punteado). Es una ilustración (aria-hidden):
// la tabla de cobertura de abajo dice lo mismo, con ícono y texto. Sin coordenadas de personas.
import type { CoverageEntityRow } from '../../pages/observatory/observatory-data.ts';
import { COVERAGE_SYSTEMS } from '../../pages/observatory/observatory-data.ts';

/** Posición aproximada de cada entidad (clave INEGI) en un lienzo de 320 × 180. */
const POSITIONS: Readonly<Record<string, readonly [number, number]>> = {
  '01': [152.1, 113.2],
  '02': [20.5, 9],
  '03': [71.9, 90.6],
  '04': [269.7, 133.6],
  '05': [165, 77.8],
  '06': [137.8, 139.6],
  '07': [243.8, 164.5],
  '08': [114.3, 45.7],
  '09': [183.7, 137.7],
  '10': [128.4, 91.8],
  '11': [162.4, 121.8],
  '12': [180, 156.5],
  '13': [188, 128.5],
  '14': [141.5, 125.3],
  '15': [175.5, 140.8],
  '16': [163.1, 135],
  '17': [183.5, 145],
  '18': [126.1, 117],
  '19': [171.9, 75.3],
  '20': [207.8, 161.3],
  '21': [196.5, 142.5],
  '22': [171.1, 126.1],
  '23': [292, 147],
  '24': [165.2, 110.5],
  '25': [101.1, 84],
  '26': [65.4, 41.3],
  '27': [245.7, 152.1],
  '28': [183.5, 94.6],
  '29': [194.5, 136],
  '30': [205.9, 136.6],
  '31': [278.8, 122.3],
  '32': [149.2, 104.3],
};

/** Nodo federal y común (fuera de las entidades, para no tapar ninguna) y la entidad con nodo propio. */
const HUB: readonly [number, number] = [222, 108];
const OWN_NODE = '22';

/** Nivel de cobertura: cuántos de los cinco sistemas tienen datos en la entidad. */
export type CoverageLevel = 'full' | 'partial' | 'none';

/** Nivel de cobertura de una fila de la matriz. */
export function coverageLevel(row: CoverageEntityRow): CoverageLevel {
  const covered = COVERAGE_SYSTEMS.filter((system) => row.periods[system].length > 0).length;
  if (covered === 0) return 'none';
  return covered >= 4 ? 'full' : 'partial';
}

/** Mapa de nodos de la cobertura. */
export function CoverageMap({ rows }: { rows: readonly CoverageEntityRow[] }) {
  const states = rows.filter((row) => POSITIONS[row.stateCode] !== undefined);
  return (
    <svg className="coverage-map" viewBox="-6 -6 332 192" aria-hidden="true" focusable="false">
      {states.map((row) => {
        const [x, y] = POSITIONS[row.stateCode] ?? HUB;
        return (
          <line
            key={`l-${row.stateCode}`}
            className={
              row.stateCode === OWN_NODE
                ? 'coverage-map__link coverage-map__link--own'
                : 'coverage-map__link'
            }
            x1={HUB[0]}
            y1={HUB[1]}
            x2={x}
            y2={y}
          />
        );
      })}
      {states.map((row) => {
        const [x, y] = POSITIONS[row.stateCode] ?? HUB;
        const isOwn = row.stateCode === OWN_NODE;
        return (
          <circle
            key={row.stateCode}
            className="coverage-map__node"
            data-level={coverageLevel(row)}
            data-own={isOwn || undefined}
            cx={x}
            cy={y}
            r={isOwn ? 6 : 3.8}
          />
        );
      })}
      <circle className="coverage-map__hub" cx={HUB[0]} cy={HUB[1]} r="6.5" />
      <text className="coverage-map__label" x="159" y="110" textAnchor="end">
        Nodo Querétaro
      </text>
      <text className="coverage-map__label" x="214" y="98" textAnchor="end">
        Nodo federal y común
      </text>
      <circle className="coverage-map__node" data-level="none" cx="304" cy="20" r="6" />
      <text className="coverage-map__label" x="294" y="24" textAnchor="end">
        Estado Ejemplo (ficticio)
      </text>
    </svg>
  );
}
