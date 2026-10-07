// Municipios con su clave INEGI. Solo se incluye Querétaro; el resto se denuncia a nivel entidad.

/** Municipio de una entidad federativa. */
export interface MunicipalityOption {
  stateCode: string;
  code: string;
  name: string;
}

/** Los 18 municipios de Querétaro (clave de entidad 22) con su clave INEGI de 3 dígitos. */
export const MUNICIPALITIES: readonly MunicipalityOption[] = [
  { stateCode: '22', code: '001', name: 'Amealco de Bonfil' },
  { stateCode: '22', code: '002', name: 'Pinal de Amoles' },
  { stateCode: '22', code: '003', name: 'Arroyo Seco' },
  { stateCode: '22', code: '004', name: 'Cadereyta de Montes' },
  { stateCode: '22', code: '005', name: 'Colón' },
  { stateCode: '22', code: '006', name: 'Corregidora' },
  { stateCode: '22', code: '007', name: 'Ezequiel Montes' },
  { stateCode: '22', code: '008', name: 'Huimilpan' },
  { stateCode: '22', code: '009', name: 'Jalpan de Serra' },
  { stateCode: '22', code: '010', name: 'Landa de Matamoros' },
  { stateCode: '22', code: '011', name: 'El Marqués' },
  { stateCode: '22', code: '012', name: 'Pedro Escobedo' },
  { stateCode: '22', code: '013', name: 'Peñamiller' },
  { stateCode: '22', code: '014', name: 'Querétaro' },
  { stateCode: '22', code: '015', name: 'San Joaquín' },
  { stateCode: '22', code: '016', name: 'San Juan del Río' },
  { stateCode: '22', code: '017', name: 'Tequisquiapan' },
  { stateCode: '22', code: '018', name: 'Tolimán' },
];
