// Entes públicos REALES del directorio de la PDN (el mismo catálogo que usa el S5 oficial). El
// catálogo completo (unos 7,200 entes) no viaja en el bundle de la web: el servidor lo importa de
// `@sigilo/contracts/entes`, y la web descarga del mismo origen el fragmento de la entidad elegida
// (`/datos/entes/<clave>.json`) y el federal (`00`), y los registra aquí para buscarlos por id.
// Metodología y fuente: packages/contracts/src/entes/README.md.
import { z } from 'zod';
import type { GovernmentLevel, PublicEntityOption } from './public-entities.ts';

/** Clave de la entidad de los entes federales en el directorio de la PDN. */
export const FEDERAL_ENTITY_STATE_CODE = '00';

/** Id de un ente real: `PDN-<clave INEGI de la entidad o 00>-<id menor del ente en la PDN>`. */
export const REAL_ENTITY_ID_PATTERN = /^PDN-(\d{2})-(\d{1,7})$/u;

/** Orden de gobierno abreviado del catálogo (F, E, M). */
export type GovernmentLevelCode = 'F' | 'E' | 'M';

const LEVEL_BY_CODE: Readonly<Record<GovernmentLevelCode, GovernmentLevel>> = {
  F: 'federal',
  E: 'estatal',
  M: 'municipal',
};

/** Ruta del mismo origen donde la web publica los fragmentos de entes por entidad. */
export const ENTITY_FRAGMENT_BASE_PATH = '/datos/entes/';

/** Fila de un fragmento: `[id, nombre, orden, municipio | null, nombre PDN?]`. */
export type EntityFragmentRow =
  | [string, string, GovernmentLevelCode, string | null]
  | [string, string, GovernmentLevelCode, string | null, string];

const LevelCodeSchema = z.enum(['F', 'E', 'M']);
const RowSchema = z.union([
  z.tuple([
    z.string().regex(REAL_ENTITY_ID_PATTERN),
    z.string().min(1).max(400),
    LevelCodeSchema,
    z
      .string()
      .regex(/^\d{3}$/u)
      .nullable(),
  ]),
  z.tuple([
    z.string().regex(REAL_ENTITY_ID_PATTERN),
    z.string().min(1).max(400),
    LevelCodeSchema,
    z
      .string()
      .regex(/^\d{3}$/u)
      .nullable(),
    z.string().min(1).max(400),
  ]),
]);

/** Fragmento de una entidad, tal como lo publica la web y lo valida el navegador al descargarlo. */
export const EntityFragmentSchema = z.strictObject({
  version: z.literal(1),
  entidad: z.strictObject({ clave: z.string().regex(/^\d{2}$/u), nombre: z.string() }),
  fuente: z.strictObject({ nombre: z.string(), url: z.string(), descargado: z.string() }),
  formato: z.array(z.string()),
  entes: z.array(RowSchema),
});
export type EntityFragment = z.infer<typeof EntityFragmentSchema>;

/** Catálogo completo tal como lo genera scripts/catalogos/entes-pdn.ts. */
export interface RealEntityCatalogFile {
  version: number;
  fuente: { nombre: string; url: string; descargado: string; sha256: string };
  entidades: Record<
    string,
    (
      | [string, string, GovernmentLevelCode, string | null, number[]]
      | [string, string, GovernmentLevelCode, string | null, number[], string]
    )[]
  >;
}

/** Clave de la entidad que lleva el id de un ente real, o `undefined` si no es de ese formato. */
export function realEntityStateCode(id: string): string | undefined {
  return REAL_ENTITY_ID_PATTERN.exec(id)?.[1];
}

/** Ente del catálogo a partir de una fila de fragmento y la clave de su entidad. */
export function entityFromRow(stateCode: string, row: EntityFragmentRow): PublicEntityOption {
  const [id, name, level, municipalityCode, sourceName] = row;
  return {
    id,
    name,
    level: LEVEL_BY_CODE[level],
    stateCode,
    ...(municipalityCode === null ? {} : { municipalityCode }),
    ...(sourceName === undefined ? {} : { sourceName }),
  };
}

/**
 * Parte el catálogo completo en un fragmento por entidad para la web: sin los ids de la PDN (el
 * servidor los tiene) y con el nombre de la PDN solo si se busca distinto del que se muestra.
 */
export function entityFragmentsFrom(
  catalog: RealEntityCatalogFile,
  stateNames: Readonly<Record<string, string>>,
): Record<string, EntityFragment> {
  const fold = (text: string) =>
    text
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9ñ]+/gu, ' ')
      .trim();
  const fragments: Record<string, EntityFragment> = {};
  for (const [clave, nombre] of Object.entries(stateNames)) {
    const rows = catalog.entidades[clave] ?? [];
    fragments[clave] = {
      version: 1,
      entidad: { clave, nombre },
      fuente: {
        nombre: catalog.fuente.nombre,
        url: catalog.fuente.url,
        descargado: catalog.fuente.descargado,
      },
      formato: ['id', 'nombre', 'ordenGobierno', 'municipio', 'nombrePdn?'],
      entes: rows.map(([id, name, level, town, , sourceName]) =>
        sourceName !== undefined && fold(sourceName) !== fold(name)
          ? [id, name, level, town, sourceName]
          : [id, name, level, town],
      ),
    };
  }
  return fragments;
}

/** Entes reales registrados (todos en el servidor; los de los fragmentos cargados en la web). */
const REGISTRY = new Map<string, PublicEntityOption>();
let isRegistryComplete = false;

/**
 * Registra entes reales para que `findEntity` los encuentre. Con `complete`, el registro es el
 * catálogo completo y la validación pasa a ser estricta (solo ids registrados).
 */
export function registerRealEntities(
  entities: Iterable<PublicEntityOption>,
  options: { complete?: boolean } = {},
): void {
  for (const entity of entities) REGISTRY.set(entity.id, entity);
  if (options.complete === true) isRegistryComplete = true;
}

/** Ente real registrado, o `undefined`. */
export function findRegisteredEntity(id: string): PublicEntityOption | undefined {
  return REGISTRY.get(id);
}

/** Indica si ya se registró el catálogo completo (en el servidor del nodo). */
export function isRealEntityCatalogComplete(): boolean {
  return isRegistryComplete;
}
