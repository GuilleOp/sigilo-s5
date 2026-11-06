// Grupo de anonimato como constelación (dirección A): a la izquierda, tu grupo (unos pocos puntos
// donde el tuyo se distingue); a la derecha, un grupo amplio donde tu punto se pierde. Es una
// ilustración: el tamaño del grupo siempre va en texto junto a ella.
import type { BucketLabel } from '@sigilo/anonimato';

/** Puntos que se dibujan para cada rango de personas. */
const DOTS_BY_BUCKET: Readonly<Record<BucketLabel, number>> = {
  '1-4': 4,
  '5-9': 5,
  '10-49': 14,
  '50+': 60,
};

/** Puntos del grupo amplio. */
const CROWD_DOTS = 180;

/**
 * Posiciones pseudoaleatorias fijas (generador congruencial con semilla constante): el dibujo es
 * el mismo siempre y no se usa `Math.random`.
 */
function scatter(count: number, seed: number): { x: number; y: number }[] {
  let state = seed;
  const next = (): number => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  return Array.from({ length: count }, () => ({ x: 6 + next() * 308, y: 5 + next() * 62 }));
}

const CROWD = scatter(CROWD_DOTS, 20261105);

/** Puntos alrededor del tuyo, en círculo. */
function smallGroup(count: number): { x: number; y: number }[] {
  const others = Math.max(count - 1, 0);
  return Array.from({ length: others }, (_, index) => {
    const angle = (index / Math.max(others, 1)) * Math.PI * 2 + 0.6;
    return { x: 160 + Math.cos(angle) * 46, y: 38 + Math.sin(angle) * 22 };
  });
}

interface CrowdProps {
  bucket: BucketLabel | null;
}

/** Tu grupo: pocos puntos unidos al tuyo. */
export function SmallCrowd({ bucket }: CrowdProps) {
  const dots = smallGroup(DOTS_BY_BUCKET[bucket ?? '1-4']);
  return (
    <svg className="crowd" viewBox="0 0 320 76" aria-hidden="true" focusable="false">
      {dots.map((dot) => (
        <line
          key={`l-${dot.x}-${dot.y}`}
          className="crowd__link"
          x1="160"
          y1="38"
          x2={dot.x}
          y2={dot.y}
        />
      ))}
      {dots.map((dot) => (
        <circle key={`${dot.x}-${dot.y}`} className="crowd__person" cx={dot.x} cy={dot.y} r="6" />
      ))}
      <circle className="crowd__you" cx="160" cy="38" r="8" />
    </svg>
  );
}

/** Grupo amplio: muchos puntos donde el tuyo cuesta encontrarlo. */
export function WideCrowd() {
  return (
    <svg className="crowd" viewBox="0 0 320 76" aria-hidden="true" focusable="false">
      {CROWD.map((dot) => (
        <circle key={`${dot.x}-${dot.y}`} className="crowd__person" cx={dot.x} cy={dot.y} r="1.6" />
      ))}
      <circle className="crowd__you" cx="236" cy="41" r="2.4" />
    </svg>
  );
}
