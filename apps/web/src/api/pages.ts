type Page<T> = { data: { results?: T[]; next?: string | null } };

/** Toutes les pages d'une liste paginée (`PageNumberPagination`, 50 par page). */
export async function toutesLesPages<T>(lire: (page: number) => Promise<Page<T>>): Promise<T[]> {
  const tous: T[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const reponse = await lire(page);
    tous.push(...(reponse.data.results ?? []));
    if (!reponse.data.next) break;
  }
  return tous;
}
