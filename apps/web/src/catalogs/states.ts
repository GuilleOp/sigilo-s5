// Catálogo de las 32 entidades federativas con su clave INEGI (información pública).

/** Entidad federativa. */
export interface StateOption {
  code: string;
  name: string;
}

/** Entidades federativas con su clave geoestadística INEGI de 2 dígitos. */
export const STATES: readonly StateOption[] = [
  { code: '01', name: 'Aguascalientes' },
  { code: '02', name: 'Baja California' },
  { code: '03', name: 'Baja California Sur' },
  { code: '04', name: 'Campeche' },
  { code: '05', name: 'Coahuila de Zaragoza' },
  { code: '06', name: 'Colima' },
  { code: '07', name: 'Chiapas' },
  { code: '08', name: 'Chihuahua' },
  { code: '09', name: 'Ciudad de México' },
  { code: '10', name: 'Durango' },
  { code: '11', name: 'Guanajuato' },
  { code: '12', name: 'Guerrero' },
  { code: '13', name: 'Hidalgo' },
  { code: '14', name: 'Jalisco' },
  { code: '15', name: 'México' },
  { code: '16', name: 'Michoacán de Ocampo' },
  { code: '17', name: 'Morelos' },
  { code: '18', name: 'Nayarit' },
  { code: '19', name: 'Nuevo León' },
  { code: '20', name: 'Oaxaca' },
  { code: '21', name: 'Puebla' },
  { code: '22', name: 'Querétaro' },
  { code: '23', name: 'Quintana Roo' },
  { code: '24', name: 'San Luis Potosí' },
  { code: '25', name: 'Sinaloa' },
  { code: '26', name: 'Sonora' },
  { code: '27', name: 'Tabasco' },
  { code: '28', name: 'Tamaulipas' },
  { code: '29', name: 'Tlaxcala' },
  { code: '30', name: 'Veracruz de Ignacio de la Llave' },
  { code: '31', name: 'Yucatán' },
  { code: '32', name: 'Zacatecas' },
];
