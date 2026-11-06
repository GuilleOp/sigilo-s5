// Íconos de línea de la dirección A, dibujados para SIGILO (no son copia de los de la plataforma).
// Siempre decorativos (aria-hidden): el significado va en el texto que los acompaña.

/** Trazos de cada ícono en una caja de 24 × 24. */
const PATHS = {
  // Glifos de los sistemas de la PDN y de la lista tipo 69-B.
  s1: [
    'M7 3h7l4 4v14H7z',
    'M14 3v4h4',
    'M14.5 11.5a2 2 0 1 1-4 0a2 2 0 1 1 4 0',
    'M9.6 17.5c.6-1.7 1.6-2.5 2.9-2.5s2.3.8 2.9 2.5',
  ],
  s2: [
    'M12 7.5a3 3 0 1 1-6 0a3 3 0 1 1 6 0',
    'M3.5 19c.6-3.3 2.7-5.2 5.5-5.2 1 0 1.9.2 2.6.7',
    'M14 13.5h6a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z',
    'M15.5 13.5V12h3v1.5',
  ],
  s3: ['M9.5 4.5l6 6-3 3-6-6z', 'M12.7 12.2l6.3 6.3', 'M4 20.5h9'],
  s5: ['M4 5h16v10H10l-4 4v-4H4z', 'M12 7.2l3 1.2v2c0 1.6-1.2 2.7-3 3.3-1.8-.6-3-1.7-3-3.3v-2z'],
  s6: [
    'M5 3h9l3 3v6',
    'M5 3v18h7',
    'M8 8.5h6M8 11.5h6M8 14.5h3',
    'M20.5 17.5a3.5 3.5 0 1 1-7 0a3.5 3.5 0 1 1 7 0',
    'M17 16v3',
  ],
  list69b: ['M4 6h11M4 11h11M4 16h6', 'M15 15l5 5M20 15l-5 5'],
  catalog: [
    'M4 5.5C6.5 4 9.5 4 12 5.5 14.5 4 17.5 4 20 5.5V19c-2.5-1.5-5.5-1.5-8 0-2.5-1.5-5.5-1.5-8 0z',
    'M12 5.5V19',
  ],
  corroboration: [
    'M8.5 12a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0',
    'M20.5 12a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0',
    'M14 5a2 2 0 1 1-4 0a2 2 0 1 1 4 0',
    'M8.3 11l2.5-4.3M15.7 11l-2.5-4.3',
  ],
  // Íconos de estado y de acción.
  check: ['M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0', 'm8 12.3 2.7 2.7L16 9.6'],
  tick: ['m5 12.5 4.5 4.5L19 7.5'],
  contra: ['M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0', 'M7.5 10h9M7.5 14h9M15 6.5 9 17.5'],
  nocov: [
    'M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0',
    'M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.7',
    'M12 17h.01',
  ],
  warn: ['M12 3.5 2.5 20h19L12 3.5Z', 'M12 10v4.5M12 17.2h.01'],
  info: ['M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0', 'M12 11v5.5M12 7.8h.01'],
  left: ['M19 12H5M11 6l-6 6 6 6'],
  right: ['M5 12h14M13 6l6 6-6 6'],
  up: ['M12 19V5M6 11l6-6 6 6'],
  flat: ['M5 12h14'],
  clock: ['M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0', 'M12 7v5l3.5 2'],
  scale: ['M12 4v16M7 20h10M5 7h14', 'm5 7-3 6a3 3 0 0 0 6 0L5 7ZM19 7l-3 6a3 3 0 0 0 6 0l-3-6Z'],
  flag: ['M5 21V4M5 4h11l-2 4 2 4H5'],
  key: ['M12 15a4 4 0 1 1-8 0a4 4 0 1 1 8 0', 'm11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2'],
  eye: [
    'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z',
    'M15 12a3 3 0 1 1-6 0a3 3 0 1 1 6 0',
  ],
  image: [
    'M5.5 4h13A2.5 2.5 0 0 1 21 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11A2.5 2.5 0 0 1 5.5 4z',
    'M10.8 9.5a1.8 1.8 0 1 1-3.6 0a1.8 1.8 0 1 1 3.6 0',
    'm21 16-5-5-8.5 9',
  ],
  noplug: ['M9 3v4M15 3v4', 'M7 7h10v3a5 5 0 0 1-10 0V7Z', 'M12 15v6', 'M3 3l18 18'],
  cipher: [
    'M5 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z',
    'M7 10h.01M10 10h.01M13 10h.01M16 10h.01M7 14h10',
  ],
  pencil: ['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4'],
  shield: ['M12 3l8 3.5v5.5c0 4.8-3.4 8-8 9.5-4.6-1.5-8-4.7-8-9.5V6.5z', 'm8.5 12 2.5 2.5 4.5-5'],
  route: [
    'M8 6a2 2 0 1 1-4 0a2 2 0 1 1 4 0',
    'M20 18a2 2 0 1 1-4 0a2 2 0 1 1 4 0',
    'M8 6h6a3 3 0 0 1 0 6h-4a3 3 0 0 0 0 6h6',
  ],
} as const;

/** Nombre de un ícono. */
export type IconName = keyof typeof PATHS;

interface IconProps {
  name: IconName;
  className?: string;
}

/** Ícono de línea decorativo; hereda el color del texto. */
export function Icon({ name, className = 'icon' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
