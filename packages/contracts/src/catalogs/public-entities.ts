// Entes públicos SINTÉTICOS para la demostración (ver docs/datos-sinteticos.md). No son reales: la
// siembra, la red de demostración y las pruebas los usan para que ningún caso de ejemplo acuse a una
// institución real. Los entes reales (directorio de la PDN) están en real-entities.ts.

/** Orden de gobierno del ente. */
export type GovernmentLevel = 'federal' | 'estatal' | 'municipal';

/** Ente público del catálogo: ficticio de la demostración o real del directorio de la PDN. */
export interface PublicEntityOption {
  id: string;
  name: string;
  level: GovernmentLevel;
  /** Ente de la demostración: se muestra con «(ficticia)». */
  isFictitious?: boolean;
  /** Clave INEGI de la entidad del ente real (`00` si es federal); los ficticios sirven en cualquiera. */
  stateCode?: string;
  /** Clave INEGI del municipio del ente real municipal, si el directorio la trae. */
  municipalityCode?: string;
  /** Nombre tal como lo publica la PDN, si difiere del que se muestra (sirve para buscar). */
  sourceName?: string;
}

/**
 * Entes ficticios con el municipio "Villa Ejemplo"; sirven para cualquier entidad. «Otro ente
 * público» no es ficticio: es la opción para describir el ente en los hechos.
 */
export const PUBLIC_ENTITIES: readonly PublicEntityOption[] = [
  {
    id: 'VE-OBRAS',
    name: 'Secretaría de Obras de Villa Ejemplo',
    level: 'municipal',
    isFictitious: true,
  },
  {
    id: 'VE-TESORERIA',
    name: 'Tesorería Municipal de Villa Ejemplo',
    level: 'municipal',
    isFictitious: true,
  },
  {
    id: 'VE-AGUA',
    name: 'Organismo de Agua Potable de Villa Ejemplo',
    level: 'municipal',
    isFictitious: true,
  },
  {
    id: 'VE-SEGURIDAD',
    name: 'Dirección de Seguridad Pública de Villa Ejemplo',
    level: 'municipal',
    isFictitious: true,
  },
  {
    id: 'VE-DESARROLLO',
    name: 'Dirección de Desarrollo Social de Villa Ejemplo',
    level: 'municipal',
    isFictitious: true,
  },
  {
    id: 'VE-REGISTRO',
    name: 'Registro Civil de Villa Ejemplo',
    level: 'municipal',
    isFictitious: true,
  },
  {
    id: 'VE-SALUD',
    name: 'Secretaría de Salud Estatal Ficticia',
    level: 'estatal',
    isFictitious: true,
  },
  {
    id: 'VE-EDUCACION',
    name: 'Secretaría de Educación Estatal Ficticia',
    level: 'estatal',
    isFictitious: true,
  },
  {
    id: 'VE-FINANZAS',
    name: 'Secretaría de Finanzas Estatal Ficticia',
    level: 'estatal',
    isFictitious: true,
  },
  {
    id: 'VE-MOVILIDAD',
    name: 'Instituto de Movilidad Estatal Ficticio',
    level: 'estatal',
    isFictitious: true,
  },
  {
    id: 'VE-ADUANA',
    name: 'Oficina Federal Ficticia de Aduanas',
    level: 'federal',
    isFictitious: true,
  },
  {
    id: 'VE-INSTITUTO',
    name: 'Instituto Federal Ficticio de Equipamiento',
    level: 'federal',
    isFictitious: true,
  },
  {
    id: 'VE-PROGRAMAS',
    name: 'Delegación Federal Ficticia de Programas Sociales',
    level: 'federal',
    isFictitious: true,
  },
  { id: 'VE-OTRO', name: 'Otro ente público (lo describo en los hechos)', level: 'municipal' },
];

/** Nombre en español del orden de gobierno. */
export const GOVERNMENT_LEVEL_LABELS: Readonly<Record<GovernmentLevel, string>> = {
  federal: 'Federal',
  estatal: 'Estatal',
  municipal: 'Municipal',
};

/** Etiqueta para elegir o mostrar un ente: los de la demostración llevan «(ficticia)». */
export function entityLabel(entity: Pick<PublicEntityOption, 'name' | 'isFictitious'>): string {
  return entity.isFictitious === true ? `${entity.name} (ficticia)` : entity.name;
}
