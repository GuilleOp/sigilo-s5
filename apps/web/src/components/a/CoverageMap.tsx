// Mapa coroplético de las 32 entidades (contorno del INEGI, scripts/mapa-entidades.ts) con tres
// capas: cobertura de la PDN, protección del anonimato y modelo de nodo. Escala de un solo tono con
// los tokens del tema; «sin datos» lleva trama además de color. Cada entidad se enfoca con el
// teclado (flechas, Inicio y Fin) y con el cursor o el toque muestra su ficha; al elegirla se marca
// su fila en la tabla de cobertura, que sigue siendo el equivalente en texto. Sin estilos en línea
// (la CSP los prohíbe), sin dependencias ni peticiones a terceros. Nunca nivel municipal.
import { useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  MAP_CREDIT,
  MAP_ENTITIES,
  MAP_INSET,
  MAP_SIZE,
} from '../../pages/observatory/mapa-entidades.ts';
import type { MapEntity } from '../../pages/observatory/mapa-entidades.ts';
import {
  coveredSystems,
  MAP_LAYER_LABELS,
  MAP_LAYERS,
  MAP_LEGENDS,
  mapSummary,
  mapValue,
} from '../../pages/observatory/map-layers.ts';
import type { AnonymityByState, MapLayer, MapStep } from '../../pages/observatory/map-layers.ts';
import { COVERAGE_SYSTEM_LABELS } from '../../pages/observatory/observatory-data.ts';
import type { CoverageEntityRow } from '../../pages/observatory/observatory-data.ts';

/** Entidades chicas que se rotulan en el recuadro ampliado. */
const INSET_LABELS = new Set(['01', '09', '17', '29']);

/** ¿La caja de la entidad toca el recuadro ampliado? */
function inInset(entity: MapEntity): boolean {
  const [x, y, width, height] = MAP_INSET;
  const [ex, ey, ew, eh] = entity.box;
  return ex < x + width && ex + ew > x && ey < y + height && ey + eh > y;
}

const INSET_ENTITIES = MAP_ENTITIES.filter(inInset);

interface CoverageMapProps {
  rows: readonly CoverageEntityRow[];
  /** Porcentaje de personas con k ≥ 10 por entidad; vacío si no se pudo cargar. */
  anonymity: AnonymityByState;
  /** Entidad elegida (su fila se marca en la tabla), o `null`. */
  selected: string | null;
  onSelect: (code: string | null) => void;
  /** Lleva a la fila de la entidad en la tabla de cobertura. */
  onShowRow: (code: string) => void;
}

/** Trama de «sin datos»: rayas a 45° sobre la superficie. */
function Hatch({ id, size }: { id: string; size: number }) {
  return (
    <defs>
      <pattern
        id={id}
        patternUnits="userSpaceOnUse"
        width={size}
        height={size}
        patternTransform="rotate(45)"
      >
        <rect className="coverage-map__hatch-bg" width={size} height={size} />
        <line className="coverage-map__hatch" x1="0" y1="0" x2="0" y2={size} />
      </pattern>
    </defs>
  );
}

/** Muestra de la leyenda. */
function Swatch({ step, hatchId }: { step: MapStep; hatchId: string }) {
  return (
    <svg className="coverage-swatch" viewBox="0 0 20 14" aria-hidden="true" focusable="false">
      <rect
        className="coverage-map__entity"
        x="1"
        y="1"
        width="18"
        height="12"
        rx="2"
        data-step={step ?? undefined}
        fill={step === null ? `url(#${hatchId})` : undefined}
      />
    </svg>
  );
}

/** Mapa de México con selector de capa, ficha, recuadro ampliado, leyenda y resumen. */
export function CoverageMap({ rows, anonymity, selected, onSelect, onShowRow }: CoverageMapProps) {
  const [layer, setLayer] = useState<MapLayer>('coverage');
  const [active, setActive] = useState<string | null>(null);
  const [focusCode, setFocusCode] = useState<string>(MAP_ENTITIES[0]?.code ?? '01');
  const paths = useRef(new Map<string, SVGPathElement>());
  const baseId = useId();
  const hatchId = `${baseId}-trama`;
  const insetHatchId = `${baseId}-trama-recuadro`;
  const summaryId = `${baseId}-resumen`;
  const byCode = useMemo(() => new Map(rows.map((row) => [row.stateCode, row])), [rows]);
  const values = useMemo(
    () =>
      new Map(
        MAP_ENTITIES.map((entity) => [
          entity.code,
          mapValue(layer, entity.code, byCode.get(entity.code), anonymity),
        ]),
      ),
    [layer, byCode, anonymity],
  );
  const summary = mapSummary(layer, rows, anonymity);
  const shown = active ?? selected;
  const shownEntity = MAP_ENTITIES.find((entity) => entity.code === shown);
  const highlight = [selected, active].filter(
    (code, index, list): code is string => code !== null && list.indexOf(code) === index,
  );

  const choose = (code: string) => onSelect(code === selected ? null : code);

  const moveFocus = (event: KeyboardEvent<SVGPathElement>, code: string) => {
    const index = MAP_ENTITIES.findIndex((entity) => entity.code === code);
    const last = MAP_ENTITIES.length - 1;
    const target = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(code);
      return;
    }
    if (target === undefined) return;
    event.preventDefault();
    const next = MAP_ENTITIES[(target + MAP_ENTITIES.length) % MAP_ENTITIES.length];
    if (next === undefined) return;
    setFocusCode(next.code);
    paths.current.get(next.code)?.focus();
  };

  const entityPath = (entity: MapEntity, inset: boolean) => {
    const value = values.get(entity.code);
    const step = value?.step ?? null;
    const common = {
      className: 'coverage-map__entity',
      d: entity.d,
      'data-step': step ?? undefined,
      fill: step === null ? `url(#${inset ? insetHatchId : hatchId})` : undefined,
      onPointerEnter: () => setActive(entity.code),
      onPointerLeave: () => setActive((current) => (current === entity.code ? null : current)),
      onClick: () => choose(entity.code),
    };
    if (inset) return <path key={entity.code} {...common} />;
    return (
      <path
        key={entity.code}
        {...common}
        ref={(element) => {
          if (element) paths.current.set(entity.code, element);
          else paths.current.delete(entity.code);
        }}
        role="button"
        tabIndex={entity.code === focusCode ? 0 : -1}
        aria-label={`${entity.name}: ${value?.text ?? ''}`}
        aria-pressed={entity.code === selected}
        data-testid={`map-entity-${entity.code}`}
        onFocus={() => {
          setFocusCode(entity.code);
          setActive(entity.code);
        }}
        onBlur={() => setActive((current) => (current === entity.code ? null : current))}
        onKeyDown={(event) => moveFocus(event, entity.code)}
      />
    );
  };

  const outlines = () =>
    highlight.map((code) => {
      const entity = MAP_ENTITIES.find((item) => item.code === code);
      if (entity === undefined) return null;
      return (
        <path
          key={`borde-${code}`}
          className="coverage-map__highlight"
          data-kind={code === selected ? 'selected' : 'active'}
          d={entity.d}
        />
      );
    });

  const shownRow = shownEntity === undefined ? undefined : byCode.get(shownEntity.code);
  const systems = coveredSystems(shownRow);
  const anonymityText =
    shownEntity === undefined
      ? ''
      : mapValue('anonymity', shownEntity.code, shownRow, anonymity).text;
  const nodeText =
    shownEntity === undefined ? '' : mapValue('node', shownEntity.code, shownRow, anonymity).text;

  return (
    <div className="mexico-map" data-layer={layer}>
      <div className="mexico-map__layers" role="group" aria-label="Capa del mapa">
        {MAP_LAYERS.map((item) => (
          <button
            key={item}
            type="button"
            className="mexico-map__layer"
            aria-pressed={layer === item}
            data-testid={`map-layer-${item}`}
            onClick={() => setLayer(item)}
          >
            {MAP_LAYER_LABELS[item]}
          </button>
        ))}
      </div>
      <p id={summaryId} className="mexico-map__summary" data-testid="map-summary">
        {summary}
      </p>
      <div className="mexico-map__body">
        <svg
          className="coverage-map"
          viewBox={`0 0 ${MAP_SIZE.width} ${MAP_SIZE.height}`}
          role="group"
          aria-label={`Mapa de México por entidad: ${MAP_LAYER_LABELS[layer]}. Usa las flechas para recorrer las entidades y Enter para elegir una.`}
          aria-describedby={summaryId}
        >
          <Hatch id={hatchId} size={9} />
          {MAP_ENTITIES.map((entity) => entityPath(entity, false))}
          {outlines()}
          <rect
            className="coverage-map__inset-frame"
            x={MAP_INSET[0]}
            y={MAP_INSET[1]}
            width={MAP_INSET[2]}
            height={MAP_INSET[3]}
            aria-hidden="true"
          />
        </svg>
        <div className="mexico-map__side">
          <figure className="mexico-map__inset">
            <svg
              className="coverage-map-inset"
              viewBox={MAP_INSET.join(' ')}
              aria-hidden="true"
              focusable="false"
            >
              <Hatch id={insetHatchId} size={4} />
              {INSET_ENTITIES.map((entity) => entityPath(entity, true))}
              {outlines()}
              {INSET_ENTITIES.filter((entity) => INSET_LABELS.has(entity.code)).map((entity) => (
                <text
                  key={`rotulo-${entity.code}`}
                  className="coverage-map__label"
                  x={entity.label[0]}
                  y={entity.label[1]}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {entity.abbr}
                </text>
              ))}
            </svg>
            <figcaption className="source">
              Centro del país, ampliado (Aguascalientes, Ciudad de México, Morelos y Tlaxcala).
            </figcaption>
          </figure>
          <div className="coverage-card" data-testid="map-card">
            {shownEntity === undefined ? (
              <p className="coverage-card__hint">
                Pasa el cursor, toca o enfoca una entidad para ver su ficha. Al elegirla se marca su
                fila en la tabla.
              </p>
            ) : (
              <>
                <h3 className="coverage-card__title">{shownEntity.name}</h3>
                <dl className="coverage-card__facts">
                  <div>
                    <dt>Cobertura de la PDN</dt>
                    <dd>{mapValue('coverage', shownEntity.code, shownRow, anonymity).text}</dd>
                  </div>
                  <div>
                    <dt>Sistemas con datos</dt>
                    <dd>
                      {systems.length === 0
                        ? 'Ninguno'
                        : systems.map((system) => COVERAGE_SYSTEM_LABELS[system]).join(', ')}
                    </dd>
                  </div>
                  <div>
                    <dt>Protección del anonimato</dt>
                    <dd>{anonymityText}</dd>
                  </div>
                  <div>
                    <dt>Modelo de nodo</dt>
                    <dd>{nodeText}</dd>
                  </div>
                </dl>
                {shownRow !== undefined && (
                  <button
                    type="button"
                    className="button button--secondary"
                    data-testid="map-show-row"
                    onClick={() => onShowRow(shownEntity.code)}
                  >
                    Ver su fila en la tabla
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <ul className="coverage-legend" aria-label={`Leyenda: ${MAP_LAYER_LABELS[layer]}`}>
        {MAP_LEGENDS[layer].map((item) => (
          <li key={item.label}>
            <Swatch step={item.step} hatchId={hatchId} />
            {item.label}
          </li>
        ))}
      </ul>
      <p className="source" data-testid="map-credit">
        {MAP_CREDIT} Contorno proyectado (cónica conforme de Lambert) y simplificado por SIGILO;
        solo entidades, nunca municipios.
      </p>
    </div>
  );
}
