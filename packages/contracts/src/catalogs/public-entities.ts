// Entes públicos SINTÉTICOS para la demostración (ver docs/datos-sinteticos.md). No son reales.

/** Orden de gobierno del ente. */
export type GovernmentLevel = 'federal' | 'estatal' | 'municipal';

/** Ente público del catálogo local. */
export interface PublicEntityOption {
  id: string;
  name: string;
  level: GovernmentLevel;
}

/** Entes ficticios con el municipio "Villa Ejemplo"; sirven para cualquier entidad. */
export const PUBLIC_ENTITIES: readonly PublicEntityOption[] = [
  { id: 'VE-OBRAS', name: 'Secretaría de Obras de Villa Ejemplo', level: 'municipal' },
  { id: 'VE-TESORERIA', name: 'Tesorería Municipal de Villa Ejemplo', level: 'municipal' },
  { id: 'VE-AGUA', name: 'Organismo de Agua Potable de Villa Ejemplo', level: 'municipal' },
  {
    id: 'VE-SEGURIDAD',
    name: 'Dirección de Seguridad Pública de Villa Ejemplo',
    level: 'municipal',
  },
  {
    id: 'VE-DESARROLLO',
    name: 'Dirección de Desarrollo Social de Villa Ejemplo',
    level: 'municipal',
  },
  { id: 'VE-REGISTRO', name: 'Registro Civil de Villa Ejemplo', level: 'municipal' },
  { id: 'VE-SALUD', name: 'Secretaría de Salud Estatal Ficticia', level: 'estatal' },
  { id: 'VE-EDUCACION', name: 'Secretaría de Educación Estatal Ficticia', level: 'estatal' },
  { id: 'VE-FINANZAS', name: 'Secretaría de Finanzas Estatal Ficticia', level: 'estatal' },
  { id: 'VE-MOVILIDAD', name: 'Instituto de Movilidad Estatal Ficticio', level: 'estatal' },
  { id: 'VE-ADUANA', name: 'Oficina Federal Ficticia de Aduanas', level: 'federal' },
  {
    id: 'VE-PROGRAMAS',
    name: 'Delegación Federal Ficticia de Programas Sociales',
    level: 'federal',
  },
  { id: 'VE-OTRO', name: 'Otro ente público (lo describo en los hechos)', level: 'municipal' },
];

/** Nombre en español del orden de gobierno. */
export const GOVERNMENT_LEVEL_LABELS: Readonly<Record<GovernmentLevel, string>> = {
  federal: 'Federal',
  estatal: 'Estatal',
  municipal: 'Municipal',
};
