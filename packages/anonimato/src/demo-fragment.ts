// Índice y fragmentos SINTÉTICOS con el formato de datos/grupos-anonimato/, para pruebas y la demo.
// Todos los nombres son ficticios (docs/datos-sinteticos.md); reproducen docs/demo-escenario.md.

/**
 * Índice sintético: el fragmento federal y uno estatal (Morelos, clave 17) con entes de Villa
 * Ejemplo. Querétaro (22) aparece sin datos, igual que en la descarga real.
 */
export const DEMO_INDEX = {
  version: 1,
  k: 10,
  cubetas: ['1-4', '5-9', '10-49', '50+'],
  fechaCorte: '2026-10-07',
  descripcion: 'Índice sintético para pruebas y la demostración.',
  entidades: [
    { clave: '00', nombre: 'Federación', archivo: '00.json', hayDatos: true },
    { clave: '17', nombre: 'Morelos', archivo: '17.json', hayDatos: true },
    { clave: '22', nombre: 'Querétaro', archivo: null, hayDatos: false },
  ],
} as const;

const FORMAT = {
  ente: ['nombre', 'cubeta', 'ordenGobierno', 'contratacion', 'grupo', 'areas'],
  area: ['nombre', 'cubeta', 'contratacion'],
  grupo: ['ordenGobierno', 'nombre', 'cubeta', 'protege'],
  ordenGobierno: { F: 'federal', E: 'estatal', M: 'municipal', O: 'otro o sin dato' },
} as const;

/**
 * Fragmento federal sintético. El Departamento de Compras del IFFE tiene 5 personas (sección 5.2
 * del escenario), así que no se lista: la interfaz lo trata como «área pequeña».
 */
export const DEMO_FEDERAL_FRAGMENT = {
  version: 1,
  entidad: { clave: '00', nombre: 'Federación' },
  k: 10,
  cubetas: ['1-4', '5-9', '10-49', '50+'],
  ventanas: [{ proveedor: 'Ficticio', desde: '2024-10-07', hasta: '2026-10-07' }],
  cubetaEntidad: 3,
  formato: FORMAT,
  grupos: [['F', 'Otros entes federales de Federación', 3, 1]],
  entes: [
    [
      'Delegación Federal Ficticia de Programas Sociales',
      3,
      'F',
      1,
      -1,
      [
        ['Dirección de Padrones Ficticia', 3, 0],
        ['Unidad de Adquisiciones Ficticia', 2, 1],
      ],
    ],
    [
      'Instituto Federal Ficticio de Equipamiento',
      2,
      'F',
      1,
      -1,
      [
        ['Dirección de Administración', 2, 0],
        ['Órgano Interno de Control', 2, 0],
      ],
    ],
    ['Oficina Federal Ficticia de Aduanas', 1, 'F', 0, 0, []],
  ],
} as const;

/** Fragmento estatal sintético (clave 17) con entes de Villa Ejemplo. */
export const DEMO_STATE_FRAGMENT = {
  version: 1,
  entidad: { clave: '17', nombre: 'Morelos' },
  k: 10,
  cubetas: ['1-4', '5-9', '10-49', '50+'],
  ventanas: [{ proveedor: 'Ficticio', desde: '2024-07-07', hasta: '2026-07-07' }],
  cubetaEntidad: 3,
  formato: FORMAT,
  grupos: [
    ['E', 'Otros entes estatales de Morelos', 1, 0],
    ['M', 'Otros entes municipales de Morelos', 2, 1],
  ],
  entes: [
    [
      'H. Ayuntamiento de Villa Ejemplo',
      3,
      'M',
      1,
      -1,
      [
        ['Dirección de Obras Públicas', 3, 0],
        ['070 Departamento de Compras', 2, 1],
      ],
    ],
    ['Secretaría de Finanzas Estatal Ficticia', 3, 'E', 0, -1, []],
    ['Registro Civil de Villa Ejemplo', 0, 'M', 0, 1, []],
    ['Instituto de Movilidad Estatal Ficticio', 1, 'E', 0, 0, []],
  ],
} as const;

/** Archivos sintéticos por nombre, listos para servirse con un `fetch` de prueba. */
export const DEMO_FILES: Readonly<Record<string, unknown>> = {
  'indice.json': DEMO_INDEX,
  '00.json': DEMO_FEDERAL_FRAGMENT,
  '17.json': DEMO_STATE_FRAGMENT,
};
