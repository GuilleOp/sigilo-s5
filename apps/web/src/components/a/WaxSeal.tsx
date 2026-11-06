// Sello de lacre (pieza del expediente B en el lenguaje de A): intacto mientras nadie abre la
// identidad; roto, con su grieta, cuando se abrió. Decorativo: el estado va en texto al lado.

/** Lóbulos del borde del lacre, en círculo. */
const LOBES = Array.from({ length: 18 }, (_, index) => {
  const angle = (index / 18) * Math.PI * 2;
  return { cx: 50 + Math.cos(angle) * 38, cy: 50 + Math.sin(angle) * 38 };
});

/** Sello de lacre. */
export function WaxSeal({ isBroken }: { isBroken: boolean }) {
  return (
    <svg
      className="wax-seal"
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      data-broken={isBroken || undefined}
    >
      <g className="wax-seal__wax">
        {LOBES.map((lobe) => (
          <circle key={`${lobe.cx}-${lobe.cy}`} cx={lobe.cx} cy={lobe.cy} r="6" />
        ))}
        <circle cx="50" cy="50" r="40" />
      </g>
      <circle className="wax-seal__ring" cx="50" cy="50" r="29" />
      <path
        className="wax-seal__mark"
        d="M50 33l13 5.5v9c0 8.4-5.6 14-13 16.8-7.4-2.8-13-8.4-13-16.8v-9z"
      />
      {isBroken && <path className="wax-seal__crack" d="M30 18l14 22-8 10 16 14-6 22" />}
    </svg>
  );
}
