// Municipios (y alcaldías de la Ciudad de México) de las 32 entidades con su clave INEGI.
// Fuente: INEGI (ver `MUNICIPALITY_SOURCE` en municipalities-data.ts, que se genera con
// scripts/catalogos/municipios-inegi.ts). Van en el bundle de la web: son unos 2,500 nombres
// (unos 20 KB comprimidos) y así la ubicación se elige y se muestra sin pedir nada al servidor.
import { MUNICIPALITIES_BY_STATE } from './municipalities-data.ts';

export { MUNICIPALITY_SOURCE } from './municipalities-data.ts';

/** Municipio de una entidad federativa. */
export interface MunicipalityOption {
  stateCode: string;
  code: string;
  name: string;
}

/** Todos los municipios con su clave INEGI de 3 dígitos, por entidad y clave. */
export const MUNICIPALITIES: readonly MunicipalityOption[] = Object.entries(
  MUNICIPALITIES_BY_STATE,
).flatMap(([stateCode, rows]) => rows.map(([code, name]) => ({ stateCode, code, name })));
