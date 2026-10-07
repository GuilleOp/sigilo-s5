// Búsqueda local en los catálogos de `@sigilo/contracts`. Seguridad: los catálogos se cargan
// completos y se filtran en el navegador, así que ninguna petición revela lo que la persona elige
// o escribe.

/** Minúsculas, sin acentos y sin espacios sobrantes, para comparar sin importar cómo se escriba. */
export function foldForSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/gu, ' ').trim();
}

/**
 * Filtra elementos cuyo texto contiene todas las palabras de la consulta.
 * Con una consulta vacía devuelve todos.
 */
export function filterByQuery<T>(
  items: readonly T[],
  query: string,
  textOf: (item: T) => string,
): T[] {
  const terms = foldForSearch(query).split(' ').filter(Boolean);
  if (terms.length === 0) return [...items];
  return items.filter((item) => {
    const haystack = foldForSearch(textOf(item));
    return terms.every((term) => haystack.includes(term));
  });
}
