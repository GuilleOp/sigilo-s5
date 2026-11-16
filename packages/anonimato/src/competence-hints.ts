// Pistas de la pantalla «Competencia por dependencia», calculadas sin conexión con los datos que
// ya están en el repositorio: si el ente aparece en el S1 (declaraciones) y con cuántas personas
// (en cubeta, nunca el conteo exacto), si tiene áreas de contratación (marca del S2) y, del S3,
// lo único que hay: el conteo por estado de la matriz de cobertura (no hay S3 por ente).
// La web las publica en /datos/competencia/<clave>.json al construirse (apps/web/static-data.ts).
import type { AnonymityFragment, BucketLabel, EnteRecord } from './fragment.ts';
import { institutionNameKey } from './normalize.ts';

/** Pista de un ente: cubeta del S1 (o `null` si no aparece) y si contrata (S2). */
export type CompetenceHintRow = [BucketLabel | null, 0 | 1 | null];

/** Archivo de pistas de una entidad. */
export interface CompetenceHintsFile {
  version: 1;
  entidad: string;
  fuentes: {
    s1: { disponible: boolean; fechaCorte: string | null };
    s2: { porEnte: boolean; nota: string };
    s3: { porEnte: false; nota: string };
  };
  /** Solo los entes con algún dato; los demás, «sin datos». */
  entes: Record<string, CompetenceHintRow>;
}

/** Fila de la matriz de cobertura (datos/cobertura/matriz.json) que importa aquí. */
export interface CoverageMatrixRow {
  entidadClave: string;
  sistema: string;
  periodo: string;
  hayDatos: boolean;
  registros: number | null;
  registrosRango: string | null;
}

/** Ente del catálogo con los nombres con que se busca en el S1. */
export interface HintEntity {
  id: string;
  name: string;
  sourceName?: string;
}

function stateTotal(rows: readonly CoverageMatrixRow[], code: string, system: string): string {
  const row = rows.find(
    (item) => item.entidadClave === code && item.sistema === system && item.periodo === 'total',
  );
  if (row === undefined || !row.hayDatos) return 'la entidad no tiene datos';
  const count = row.registros === null ? row.registrosRango : row.registros.toLocaleString('es-MX');
  return `la entidad tiene ${count ?? 'algunos'} registros en total`;
}

const BUCKET_ORDER: readonly BucketLabel[] = ['1-4', '5-9', '10-49', '50+'];

/**
 * Entes del S1 por nombre normalizado; si dos normalizan igual, queda el de cubeta menor, como en
 * `findEnte` (subestimar el grupo es más seguro que inflarlo).
 */
function entesByKey(fragment: AnonymityFragment): Map<string, EnteRecord> {
  const byKey = new Map<string, EnteRecord>();
  for (const ente of fragment.entes) {
    const key = institutionNameKey(ente.name, fragment.stateCode);
    const found = byKey.get(key);
    if (
      found === undefined ||
      BUCKET_ORDER.indexOf(ente.bucket) < BUCKET_ORDER.indexOf(found.bucket)
    ) {
      byKey.set(key, ente);
    }
  }
  return byKey;
}

/**
 * Pistas de cada ente de la entidad. El ente se busca en el fragmento del S1 por su nombre
 * normalizado (y por el nombre de la PDN), igual que el aviso del grupo de anonimato.
 */
export function competenceHintsFor(
  stateCode: string,
  entities: readonly HintEntity[],
  fragment: AnonymityFragment | null,
  cutoffDate: string | null,
  coverage: readonly CoverageMatrixRow[],
): CompetenceHintsFile {
  const entes: Record<string, CompetenceHintRow> = {};
  if (fragment !== null) {
    const byKey = entesByKey(fragment);
    const lookup = (name: string) => {
      const key = institutionNameKey(name, fragment.stateCode);
      return key === '' ? undefined : byKey.get(key);
    };
    for (const entity of entities) {
      const found =
        lookup(entity.name) ??
        (entity.sourceName === undefined ? undefined : lookup(entity.sourceName));
      if (found !== undefined) entes[entity.id] = [found.bucket, found.isContracting ? 1 : 0];
    }
  }
  return {
    version: 1,
    entidad: stateCode,
    fuentes: {
      s1: { disponible: fragment !== null, fechaCorte: fragment === null ? null : cutoffDate },
      s2: {
        porEnte: fragment !== null,
        nota:
          fragment === null
            ? `Sin marca de contratación por ente: ${stateTotal(coverage, stateCode, 'S2')} en el S2.`
            : 'La marca sale del fragmento del S1: el ente o una de sus áreas aparece en el S2.',
      },
      s3: {
        porEnte: false,
        nota: `El S3 no está por ente en el repositorio: ${stateTotal(coverage, stateCode, 'S3S')} de servidores sancionados.`,
      },
    },
    entes,
  };
}
