// Símbolo de SIGILO en línea (sin petición extra): candado de lacre con la red y el nodo
// cempasúchil de tu denuncia. Los colores vienen de los tokens `--color-brand-*` (claro, oscuro y
// alto contraste) por clases de `layout.css`: la CSP no admite estilos en línea.
import { MARK_FAVICON, MARK_FULL, MARK_SEAL } from './geometria.ts';
import type { Circle, MarkGeometry } from './geometria.ts';

const VARIANTS: Readonly<Record<'candado' | 'sello' | 'favicon', MarkGeometry>> = {
  candado: MARK_FULL,
  sello: MARK_SEAL,
  favicon: MARK_FAVICON,
};

interface SigiloMarkProps {
  /** Candado completo (por omisión), solo el sello o la versión simplificada para 16–32 px. */
  variant?: keyof typeof VARIANTS;
  className?: string;
}

function Dot({ circle, className }: { circle: Circle; className: string }) {
  return <circle className={className} cx={circle.cx} cy={circle.cy} r={circle.r} />;
}

/**
 * Decorativo: siempre va junto al nombre «SIGILO» en texto, que es el nombre accesible del enlace,
 * así que queda oculto para los lectores de pantalla.
 */
export function SigiloMark({ variant = 'candado', className }: SigiloMarkProps) {
  const geometry = VARIANTS[variant];
  return (
    <svg
      className={className === undefined ? 'sigilo-mark' : `sigilo-mark ${className}`}
      viewBox={`0 0 ${geometry.size} ${geometry.size}`}
      aria-hidden="true"
      focusable="false"
    >
      {geometry.shackle !== null && (
        <path
          className="sigilo-mark__shackle"
          d={geometry.shackle.d}
          fill="none"
          strokeWidth={geometry.shackle.width}
        />
      )}
      <path className="sigilo-mark__seal" d={geometry.seal} />
      <Dot className="sigilo-mark__disc" circle={geometry.disc} />
      {geometry.ring !== null && (
        <path
          className="sigilo-mark__ring"
          d={geometry.ring.d}
          fill="none"
          strokeWidth={geometry.ring.width}
        />
      )}
      <path
        className="sigilo-mark__links"
        d={geometry.links.d}
        fill="none"
        strokeWidth={geometry.links.width}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {geometry.nodes.map((node) => (
        <Dot key={`${node.cx},${node.cy}`} className="sigilo-mark__node" circle={node} />
      ))}
      <Dot className="sigilo-mark__hub" circle={geometry.hub} />
      <Dot className="sigilo-mark__accent" circle={geometry.accent} />
    </svg>
  );
}
