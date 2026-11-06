// Identidad sellada de la dirección A: un anillo de tres segmentos (las tres llaves de la autoridad)
// alrededor del escudo. Cada segmento lleno es una aprobación o una llave usada. Decorativo: el
// número de aprobaciones siempre va también en texto.

/** Segmentos del anillo, uno por llave. */
const SEGMENTS = [
  'M50 8a42 42 0 0 1 36.4 21',
  'M90.4 41.5a42 42 0 0 1-30 49.3',
  'M45 91.7A42 42 0 0 1 9.4 39',
] as const;

interface SealedRingProps {
  /** Llaves usadas (0 a 3). */
  used: number;
  /** El sobre ya se abrió (el escudo se dibuja abierto). */
  isOpened?: boolean;
}

/** Anillo de tres llaves. */
export function SealedRing({ used, isOpened = false }: SealedRingProps) {
  return (
    <svg
      className="sealed-ring"
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      data-opened={isOpened || undefined}
    >
      {SEGMENTS.map((d, index) => (
        <path
          key={d}
          d={d}
          className={index < used ? 'sealed-ring__seg' : 'sealed-ring__seg sealed-ring__seg--free'}
        />
      ))}
      <path
        className="sealed-ring__core"
        d={
          isOpened
            ? 'M50 30l14 6v10c0 9-6 15-14 18-8-3-14-9-14-18V36z M44 47l12 0'
            : 'M50 30l14 6v10c0 9-6 15-14 18-8-3-14-9-14-18V36z'
        }
      />
      {!isOpened && (
        <>
          <circle className="sealed-ring__core" cx="50" cy="44" r="4" />
          <path className="sealed-ring__core" d="M50 48v6" />
        </>
      )}
    </svg>
  );
}
