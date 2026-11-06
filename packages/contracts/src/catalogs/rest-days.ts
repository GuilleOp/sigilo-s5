// Lista explícita de días de descanso obligatorio (Ley Federal del Trabajo, art. 74) de 2025 a
// 2028, que el cálculo de plazos en días hábiles trata como inhábiles además de sábados y domingos.
// No se consulta ningún servicio externo: cada despliegue agrega sus propios días inhábiles.

/** Día inhábil oficial con su nombre y fundamento. */
export interface RestDayOption {
  /** Fecha `AAAA-MM-DD`. */
  day: string;
  name: string;
  basis: string;
}

/** Primer y último día que cubre `OFFICIAL_REST_DAYS`; fuera de ese rango el calendario no sirve. */
export const OFFICIAL_REST_DAYS_COVERAGE = { from: '2025-01-01', through: '2028-12-31' } as const;

const BASIS = 'Ley Federal del Trabajo, art. 74';

function restDaysOf(
  year: number,
  constitution: string,
  juarez: string,
  revolution: string,
): RestDayOption[] {
  return [
    { day: `${year}-01-01`, name: 'Año Nuevo', basis: `${BASIS}, fracc. I` },
    { day: constitution, name: 'Día de la Constitución', basis: `${BASIS}, fracc. II` },
    { day: juarez, name: 'Natalicio de Benito Juárez', basis: `${BASIS}, fracc. III` },
    { day: `${year}-05-01`, name: 'Día del Trabajo', basis: `${BASIS}, fracc. IV` },
    { day: `${year}-09-16`, name: 'Día de la Independencia', basis: `${BASIS}, fracc. V` },
    { day: revolution, name: 'Día de la Revolución', basis: `${BASIS}, fracc. VI` },
    { day: `${year}-12-25`, name: 'Navidad', basis: `${BASIS}, fracc. VIII` },
  ];
}

/**
 * Días de descanso obligatorio. Los lunes móviles son el primero de febrero, el tercero de marzo y
 * el tercero de noviembre. La transmisión del Poder Ejecutivo Federal (fracc. VII) no cae en estos
 * años. Los días que cada autoridad declara inhábiles por acuerdo publicado (vacaciones, Semana
 * Santa, 2 de noviembre, 12 de diciembre, entre otros) no están aquí: se agregan en la
 * configuración del calendario de cada despliegue.
 */
export const OFFICIAL_REST_DAYS: readonly RestDayOption[] = [
  ...restDaysOf(2025, '2025-02-03', '2025-03-17', '2025-11-17'),
  ...restDaysOf(2026, '2026-02-02', '2026-03-16', '2026-11-16'),
  ...restDaysOf(2027, '2027-02-01', '2027-03-15', '2027-11-15'),
  ...restDaysOf(2028, '2028-02-07', '2028-03-20', '2028-11-20'),
];
