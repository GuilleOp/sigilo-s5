// Constelación decorativa del inicio: la red de puntos de la plataforma termina en un punto
// turquesa, tu denuncia sellada. Es solo ilustración (aria-hidden); el halo late suave salvo con
// «reducir movimiento».

const EDGES: readonly (readonly [number, number, number, number])[] = [
  [20, 40, 70, 20],
  [70, 20, 110, 70],
  [20, 40, 45, 110],
  [45, 110, 110, 70],
  [45, 110, 95, 160],
  [110, 70, 165, 45],
  [110, 70, 160, 120],
  [95, 160, 160, 120],
  [165, 45, 215, 90],
  [160, 120, 215, 90],
  [215, 90, 250, 40],
  [160, 120, 220, 170],
];

const PROTECT_EDGES: readonly (readonly [number, number, number, number])[] = [
  [215, 90, 290, 105],
  [220, 170, 290, 105],
];

const NODES: readonly (readonly [number, number, number, boolean])[] = [
  [20, 40, 4, false],
  [70, 20, 5, false],
  [110, 70, 6, true],
  [45, 110, 4, false],
  [95, 160, 5, true],
  [165, 45, 4, false],
  [160, 120, 5, true],
  [215, 90, 6, true],
  [250, 40, 3.5, false],
  [220, 170, 4, true],
];

/** Ilustración del inicio. */
export function HeroConstellation() {
  return (
    <svg className="constellation" viewBox="0 0 360 200" aria-hidden="true" focusable="false">
      {EDGES.map(([x1, y1, x2, y2]) => (
        <line
          key={`${x1}-${y1}-${x2}-${y2}`}
          className="constellation__edge"
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
        />
      ))}
      {PROTECT_EDGES.map(([x1, y1, x2, y2]) => (
        <line
          key={`p-${x1}-${y1}`}
          className="constellation__edge constellation__edge--protect"
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
        />
      ))}
      {NODES.map(([cx, cy, r, isCyan]) => (
        <circle
          key={`${cx}-${cy}`}
          className={
            isCyan ? 'constellation__node constellation__node--cyan' : 'constellation__node'
          }
          cx={cx}
          cy={cy}
          r={r}
        />
      ))}
      <circle className="constellation__halo" cx="290" cy="105" r="22" />
      <circle className="constellation__you" cx="290" cy="105" r="11" />
      <text className="constellation__label" x="262" y="148">
        tu denuncia,
      </text>
      <text className="constellation__label" x="268" y="162">
        sellada
      </text>
    </svg>
  );
}
