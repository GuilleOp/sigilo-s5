// Grafo del conflicto de interés (pieza de C en el lenguaje de A): la persona titular de la
// autoridad y la persona denunciada, unidas por las organizaciones que ambas declaran. Es una
// ilustración (aria-hidden): la tabla de evidencia de al lado dice lo mismo para lectores de
// pantalla.
//
// Las etiquetas de las personas van debajo de cada nodo y las organizaciones en dos líneas sin
// truncar. Si un nombre no cabe en dos líneas, se abrevia solo la razón social (el nombre completo
// está en la tabla).

/** Ancho del lienzo en unidades del SVG (a 40rem se ve a escala 1). */
const WIDTH = 640;
const PERSON_RADIUS = 20;
const LEFT_X = 100;
const RIGHT_X = WIDTH - LEFT_X;
const PILL_WIDTH = 232;
const PILL_X = (WIDTH - PILL_WIDTH) / 2;
const LINE_HEIGHT = 16;
const PILL_PADDING = 10;
/** Separación vertical mínima entre píldoras. */
const PILL_GAP = 24;
const PAD = 16;
/** Caracteres por línea de una píldora (Mulish 800 a 13 px en 212 unidades útiles). */
const LINE_CHARS = 26;

/** Abreviaturas de razón social, de la forma larga a la corta. */
const LEGAL_FORMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Sociedad An[oó]nima Promotora de Inversi[oó]n de Capital Variable/iu, 'S.A.P.I. de C.V.'],
  [/Sociedad An[oó]nima de Capital Variable/iu, 'S.A. de C.V.'],
  [/Sociedad de Responsabilidad Limitada de Capital Variable/iu, 'S. de R.L. de C.V.'],
  [/Sociedad An[oó]nima/iu, 'S.A.'],
  [/Asociaci[oó]n Civil/iu, 'A.C.'],
  [/Sociedad Civil/iu, 'S.C.'],
];

/** Parte un texto en líneas de hasta `max` caracteres, por palabras. */
export function wrapWords(text: string, max = LINE_CHARS): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/u).filter(Boolean)) {
    const next = current === '' ? word : `${current} ${word}`;
    if (next.length <= max || current === '') current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== '') lines.push(current);
  return lines;
}

/**
 * Líneas de una organización: dos como máximo. Primero intenta el nombre completo, luego con la
 * razón social abreviada y, si aún no cabe, sin razón social (con «…» al final).
 */
export function organizationLines(name: string, max = LINE_CHARS): string[] {
  const full = wrapWords(name, max);
  if (full.length <= 2) return full;
  let abbreviated = name;
  for (const [pattern, short] of LEGAL_FORMS) abbreviated = abbreviated.replace(pattern, short);
  const short = wrapWords(abbreviated, max);
  if (short.length <= 2) return short;
  const comma = abbreviated.lastIndexOf(',');
  const base = comma > 0 ? `${abbreviated.slice(0, comma)} …` : abbreviated;
  const lines = wrapWords(base, max);
  if (lines.length <= 2) return lines;
  const second = lines.slice(1).join(' ');
  return [lines[0] ?? '', `${second.slice(0, max - 1).trimEnd()}…`];
}

/** Píldora de una organización ya acomodada. */
interface OrganizationNode {
  name: string;
  lines: string[];
  top: number;
  height: number;
  center: number;
}

/** Acomoda las píldoras de arriba abajo, con PILL_GAP entre ellas. */
function layoutOrganizations(organizations: readonly string[]): {
  nodes: OrganizationNode[];
  pillsBottom: number;
} {
  const nodes: OrganizationNode[] = [];
  let y = PAD;
  for (const name of organizations) {
    const lines = organizationLines(name);
    const height = lines.length * LINE_HEIGHT + PILL_PADDING * 2;
    nodes.push({ name, lines, top: y, height, center: y + height / 2 });
    y += height + PILL_GAP;
  }
  return { nodes, pillsBottom: nodes.length === 0 ? PAD : y - PILL_GAP };
}

interface ConflictGraphProps {
  /** Organizaciones declaradas en común. */
  organizations: readonly string[];
  leftLabel?: string;
  rightLabel?: string;
}

/** Grafo con dos personas y sus organizaciones en común. */
export function ConflictGraph({
  organizations,
  leftLabel = 'Titular de la autoridad',
  rightLabel = 'Persona denunciada',
}: ConflictGraphProps) {
  const { nodes, pillsBottom } = layoutOrganizations(organizations);
  const middle = Math.max((PAD + pillsBottom) / 2, PAD + PERSON_RADIUS);
  // La etiqueta de cada persona va debajo de su nodo, a 12 unidades o más.
  const labelY = middle + PERSON_RADIUS + 12 + 12;
  const height = Math.max(pillsBottom, labelY + 4) + PAD;
  return (
    <svg
      className="conflict-graph"
      viewBox={`0 0 ${WIDTH} ${height}`}
      aria-hidden="true"
      focusable="false"
    >
      {nodes.map((node) => (
        <g key={node.name}>
          <line
            className="conflict-graph__edge"
            x1={LEFT_X + PERSON_RADIUS}
            y1={middle}
            x2={PILL_X}
            y2={node.center}
          />
          <line
            className="conflict-graph__edge"
            x1={RIGHT_X - PERSON_RADIUS}
            y1={middle}
            x2={PILL_X + PILL_WIDTH}
            y2={node.center}
          />
        </g>
      ))}
      <circle className="conflict-graph__person" cx={LEFT_X} cy={middle} r={PERSON_RADIUS} />
      <circle
        className="conflict-graph__person conflict-graph__person--accused"
        cx={RIGHT_X}
        cy={middle}
        r={PERSON_RADIUS}
      />
      {nodes.map((node) => (
        <g key={`n-${node.name}`} className="conflict-graph__org-node">
          <rect
            className="conflict-graph__org"
            x={PILL_X}
            y={node.top}
            width={PILL_WIDTH}
            height={node.height}
            rx={18}
          />
          <text className="conflict-graph__org-label" textAnchor="middle">
            {node.lines.map((line, index) => (
              <tspan
                key={line}
                x={WIDTH / 2}
                y={node.top + PILL_PADDING + LINE_HEIGHT * (index + 1) - 4}
              >
                {line}
              </tspan>
            ))}
          </text>
        </g>
      ))}
      <text className="conflict-graph__label" x={LEFT_X} y={labelY} textAnchor="middle">
        {leftLabel}
      </text>
      <text className="conflict-graph__label" x={RIGHT_X} y={labelY} textAnchor="middle">
        {rightLabel}
      </text>
    </svg>
  );
}
