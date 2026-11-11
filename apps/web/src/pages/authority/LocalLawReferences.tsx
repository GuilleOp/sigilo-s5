// «En la ley que aplica»: los artículos de la ley de responsabilidades y del código penal de la
// entidad que equivalen a la conducta elegida, según el catálogo de faltas del S5. La persona eligió
// en lenguaje llano; aquí la autoridad ve su propia ley.
import { useEffect, useState } from 'react';
import {
  equivalenceStateKey,
  loadS5Equivalences,
  localReferences,
} from '../../lib/s5-equivalences.ts';
import type { LocalReference } from '../../lib/s5-equivalences.ts';

interface LocalLawReferencesProps {
  entityId: string;
  stateCode: string;
  offenseCode: string;
}

/** Artículos equivalentes, agrupados por ley. */
export function LocalLawReferences({ entityId, stateCode, offenseCode }: LocalLawReferencesProps) {
  const [references, setReferences] = useState<LocalReference[] | null>(null);
  const [hasFailed, setFailed] = useState(false);

  useEffect(() => {
    let isActive = true;
    loadS5Equivalences().then(
      (data) => {
        if (isActive) {
          setReferences(
            localReferences(data, equivalenceStateKey(entityId, stateCode), offenseCode),
          );
        }
      },
      () => {
        if (isActive) setFailed(true);
      },
    );
    return () => {
      isActive = false;
    };
  }, [entityId, stateCode, offenseCode]);

  if (hasFailed)
    return <p className="field__hint">No se pudieron cargar los artículos de la ley local.</p>;
  if (references === null) return null;
  if (references.length === 0) {
    return (
      <p className="field__hint" data-testid="local-law-none">
        Sin equivalente directo en el catálogo de faltas del S5 para esta entidad: revisa la ley
        local.
      </p>
    );
  }
  const byLaw = new Map<string, string[]>();
  for (const reference of references) {
    const articles = byLaw.get(reference.law) ?? [];
    if (!articles.includes(reference.article)) articles.push(reference.article);
    byLaw.set(reference.law, articles);
  }
  return (
    <ul className="local-law" data-testid="local-law-references">
      {[...byLaw].map(([law, articles]) => (
        <li key={law}>
          {law}: art. {articles.join('; art. ')}
        </li>
      ))}
    </ul>
  );
}
