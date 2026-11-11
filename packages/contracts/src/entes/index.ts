// Catálogo completo de entes públicos reales (directorio de la PDN) ya registrado, para el servidor
// del nodo: al importarlo, `findEntity` encuentra cualquier ente real y la validación de los hechos
// pasa a ser estricta (solo ids del catálogo). La web no importa este módulo (pesa ~1 MB): descarga
// el fragmento de la entidad elegida desde /datos/entes/. Metodología: README.md de esta carpeta.
import catalog from './entes-pdn.json' with { type: 'json' };
import { entityFromRow, registerRealEntities } from '../catalogs/real-entities.ts';
import type { RealEntityCatalogFile } from '../catalogs/real-entities.ts';
import type { PublicEntityOption } from '../catalogs/public-entities.ts';

// El archivo lo genera y valida scripts/catalogos/entes-pdn.ts; las tuplas llegan como arreglos.
const DATA = catalog as unknown as RealEntityCatalogFile;

/** Ente real con los ids que tiene en el directorio de la PDN (para integrarse con el S5). */
export interface RealEntity extends PublicEntityOption {
  pdnIds: readonly number[];
}

/** Catálogo completo de entes reales. */
export const REAL_ENTITIES: readonly RealEntity[] = Object.entries(DATA.entidades).flatMap(
  ([stateCode, rows]) =>
    rows.map(([id, name, level, town, pdnIds, sourceName]) => ({
      ...entityFromRow(
        stateCode,
        sourceName === undefined ? [id, name, level, town] : [id, name, level, town, sourceName],
      ),
      pdnIds,
    })),
);

/** Fuente, fecha de descarga y huella del directorio con que se generó el catálogo. */
export const REAL_ENTITIES_SOURCE = DATA.fuente;

/** El archivo tal como se generó, para partirlo en fragmentos (`entityFragmentsFrom`). */
export const REAL_ENTITY_CATALOG: RealEntityCatalogFile = DATA;

registerRealEntities(REAL_ENTITIES, { complete: true });
