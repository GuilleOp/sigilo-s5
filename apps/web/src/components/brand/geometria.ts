// Geometría del símbolo de SIGILO (dirección A): un candado cuyo cuerpo es un sello de lacre con
// orillas onduladas; dentro, un anillo con la red (un nodo central, seis radios y los nodos de la
// orilla unidos entre sí) y, sobre el anillo a la derecha, el nodo cempasúchil: «tu denuncia».
// Es la única fuente de la forma: la usan el componente `SigiloMark` y el script que genera los
// archivos de `public/marca/` (`scripts/marca/render.ts`). Solo hay círculos, líneas y curvas.

/** Círculo en coordenadas de la cuadrícula. */
export interface Circle {
  cx: number;
  cy: number;
  r: number;
}

/** Geometría de una variante del símbolo. */
export interface MarkGeometry {
  /** Tamaño de la cuadrícula cuadrada (`viewBox="0 0 size size"`). */
  size: number;
  /** Arco del candado (trazo), o `null` en el sello sin candado. */
  shackle: { d: string; width: number } | null;
  /** Contorno ondulado del sello de lacre. */
  seal: string;
  /** Disco claro dentro del sello. */
  disc: Circle;
  /** Anillo, con un hueco alrededor del nodo de tu denuncia; `null` si no lleva anillo. */
  ring: { d: string; width: number } | null;
  /** Radios y uniones de la red, en un solo trazo. */
  links: { d: string; width: number };
  /** Nodos de la orilla. */
  nodes: Circle[];
  /** Nodo central. */
  hub: Circle;
  /** Nodo cempasúchil de tu denuncia (nunca cambia de color). */
  accent: Circle;
}

/** Colores de la marca: verde profundo, petróleo, turquesa, menta y cempasúchil. */
export const BRAND_COLORS = {
  deepGreen: '#04463f',
  primary: '#03615a',
  teal: '#0e7565',
  mint: '#34cbb4',
  marigold: '#f2b441',
  white: '#ffffff',
  ink: '#0f2b27',
  light: '#eef5f3',
} as const;

const round = (value: number): string => {
  const fixed = value.toFixed(2).replace(/\.?0+$/u, '');
  return fixed === '-0' ? '0' : fixed;
};

const point = (x: number, y: number): string => `${round(x)} ${round(y)}`;

/** Punto a un ángulo (grados, 0 = derecha, sentido de las manecillas) de un centro. */
function polar(cx: number, cy: number, radius: number, degrees: number): [number, number] {
  const angle = (degrees * Math.PI) / 180;
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

/**
 * Contorno del lacre: radio `radius + depth·cos(lobes·θ)`, con lóbulos redondos. Se escribe con
 * curvas cúbicas de Hermite (cuatro por lóbulo), así que es suave y ligero a cualquier tamaño.
 */
export function sealPath(
  cx: number,
  cy: number,
  radius: number,
  depth: number,
  lobes: number,
  rotation = -90,
): string {
  const steps = lobes * 4;
  const delta = (2 * Math.PI) / steps;
  const offset = (rotation * Math.PI) / 180;
  const at = (index: number) => {
    const theta = index * delta;
    const r = radius + depth * Math.cos(lobes * theta);
    const dr = -depth * lobes * Math.sin(lobes * theta);
    const angle = theta + offset;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: cx + r * cos,
      y: cy + r * sin,
      dx: dr * cos - r * sin,
      dy: dr * sin + r * cos,
    };
  };
  const first = at(0);
  let d = `M${point(first.x, first.y)}`;
  for (let index = 0; index < steps; index += 1) {
    const from = at(index);
    const to = at(index + 1);
    d +=
      `C${point(from.x + (from.dx * delta) / 3, from.y + (from.dy * delta) / 3)} ` +
      `${point(to.x - (to.dx * delta) / 3, to.y - (to.dy * delta) / 3)} ${point(to.x, to.y)}`;
  }
  return `${d}Z`;
}

/** Anillo con un hueco de `gapDegrees` centrado a la derecha (donde va tu denuncia). */
function ringPath(cx: number, cy: number, radius: number, gapDegrees: number): string {
  const [x1, y1] = polar(cx, cy, radius, gapDegrees / 2);
  const [x2, y2] = polar(cx, cy, radius, -gapDegrees / 2);
  return `M${point(x1, y1)}A${round(radius)} ${round(radius)} 0 1 1 ${point(x2, y2)}`;
}

/** Arco del candado: dos patas que entran al sello y la curva de arriba. */
function shacklePath(cx: number, top: number, halfWidth: number, legEnd: number): string {
  const arcY = top + halfWidth;
  return (
    `M${point(cx - halfWidth, legEnd)}V${round(arcY)}` +
    `A${round(halfWidth)} ${round(halfWidth)} 0 0 1 ${point(cx + halfWidth, arcY)}V${round(legEnd)}`
  );
}

interface NetworkOptions {
  cx: number;
  cy: number;
  /** Radio de los nodos de la orilla. */
  rimRadius: number;
  /** Ángulos de los nodos de la orilla. */
  angles: number[];
  nodeRadius: number;
  hubRadius: number;
  /** Radio en el que se sienta el nodo de tu denuncia (sobre el anillo). */
  accentDistance: number;
  accentRadius: number;
  /** Posición del nodo de tu denuncia dentro del contorno de la red, o `null` si va aparte. */
  accentInRim: number | null;
}

function network(options: NetworkOptions): Pick<MarkGeometry, 'nodes' | 'hub' | 'accent'> & {
  linksD: string;
} {
  const { cx, cy } = options;
  const nodes = options.angles.map((angle) => {
    const [x, y] = polar(cx, cy, options.rimRadius, angle);
    return { cx: Number(round(x)), cy: Number(round(y)), r: options.nodeRadius };
  });
  const [ax, ay] = polar(cx, cy, options.accentDistance, 0);
  const spokes = nodes.map((node) => `M${point(cx, cy)}L${point(node.cx, node.cy)}`).join('');
  const outline = nodes.map((node) => point(node.cx, node.cy));
  if (options.accentInRim !== null) outline.splice(options.accentInRim, 0, point(ax, ay));
  // Tu denuncia se une a la red con su propio radio.
  const rim = `M${outline.join('L')}ZM${point(cx, cy)}L${point(ax, ay)}`;
  return {
    nodes,
    hub: { cx, cy, r: options.hubRadius },
    accent: { cx: Number(round(ax)), cy: Number(round(ay)), r: options.accentRadius },
    linksD: spokes + rim,
  };
}

/** Símbolo completo: candado, lacre, anillo y red de seis nodos. Cuadrícula de 64. */
function fullMark(withShackle: boolean): MarkGeometry {
  const cx = 32;
  // Sin candado, el sello se centra en la cuadrícula y crece.
  const cy = withShackle ? 40 : 32;
  const scale = withShackle ? 1 : 1.3;
  const ringRadius = 13.2 * scale;
  const net = network({
    cx,
    cy,
    rimRadius: 8.4 * scale,
    angles: [-90, -30, 30, 90, 150, 210],
    nodeRadius: 2.3 * scale,
    hubRadius: 3 * scale,
    accentDistance: ringRadius,
    accentRadius: 3.6 * scale,
    accentInRim: null,
  });
  return {
    size: 64,
    shackle: withShackle ? { d: shacklePath(cx, 3.25, 10, 30), width: 5.5 } : null,
    seal: sealPath(cx, cy, 21.4 * scale, 1.55 * scale, 10),
    disc: { cx, cy, r: 16.6 * scale },
    ring: { d: ringPath(cx, cy, ringRadius, 46), width: 2.2 * scale },
    links: { d: net.linksD, width: 1.8 * scale },
    nodes: net.nodes,
    hub: net.hub,
    accent: net.accent,
  };
}

/**
 * Variante para 16–32 px (favicon): solo el sello, sin anillo; la red es un rombo (tres nodos y tu
 * denuncia) con trazos gruesos y ejes que caen en el píxel.
 * Cuadrícula de 32.
 */
function faviconMark(): MarkGeometry {
  const cx = 16;
  const cy = 16;
  const net = network({
    cx,
    cy,
    rimRadius: 7,
    angles: [-90, 180, 90],
    nodeRadius: 2.2,
    hubRadius: 2.6,
    accentDistance: 7,
    accentRadius: 3,
    accentInRim: 0,
  });
  return {
    size: 32,
    shackle: null,
    seal: sealPath(cx, cy, 14.6, 1.1, 9),
    disc: { cx, cy, r: 11 },
    ring: null,
    links: { d: net.linksD, width: 1.9 },
    nodes: net.nodes,
    hub: net.hub,
    accent: net.accent,
  };
}

/** Candado completo (variante principal). */
export const MARK_FULL: MarkGeometry = fullMark(true);
/** Solo el sello, sin candado, con todo el detalle. */
export const MARK_SEAL: MarkGeometry = fullMark(false);
/** Sello simplificado para 16–32 px. */
export const MARK_FAVICON: MarkGeometry = faviconMark();
