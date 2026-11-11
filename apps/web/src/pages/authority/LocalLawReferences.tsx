// «En la ley que aplica»: los artículos de la ley de responsabilidades y del código penal de la
// entidad que equivalen a la conducta elegida, según el catálogo de faltas del S5. Los calcula el
// nodo (`s5References` del detalle). La persona eligió en lenguaje llano; aquí la autoridad ve su
// propia ley.
import { UNCLASSIFIED_OFFENSE_CODE } from '@sigilo/contracts';
import type { ComplaintDetail } from '@sigilo/contracts';

interface LocalLawReferencesProps {
  offenseCode: string;
  references: ComplaintDetail['s5References'];
}

/** Artículos equivalentes, agrupados por ley. */
export function LocalLawReferences({ offenseCode, references }: LocalLawReferencesProps) {
  if (offenseCode === UNCLASSIFIED_OFFENSE_CODE) {
    return (
      <p className="field__hint" data-testid="local-law-unclassified">
        Sin clasificar: quien denuncia no encontró una conducta parecida. Clasifícala con el relato.
      </p>
    );
  }
  // Un nodo anterior no manda las referencias: no se muestra nada.
  if (references === undefined) return null;
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
