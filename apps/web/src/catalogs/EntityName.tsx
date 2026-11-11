// Nombre de un ente para mostrar: los ficticios con «(ficticia)»; los reales, aunque aún no se haya
// descargado el fragmento de su entidad (se descarga del mismo origen y se muestra al llegar).
import { entityLabel } from '@sigilo/contracts';
import { useEntity } from './entity-catalog.ts';

interface EntityNameProps {
  entityId: string;
  /** Texto si el ente no se encuentra; por omisión, el identificador. */
  fallback?: string;
}

/** Nombre del ente o, mientras no se conoce, el texto de respaldo. */
export function EntityName({ entityId, fallback }: EntityNameProps) {
  const entity = useEntity(entityId);
  return <>{entity === undefined ? (fallback ?? entityId) : entityLabel(entity)}</>;
}
