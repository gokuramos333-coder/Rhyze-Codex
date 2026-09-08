type CatalogWithOccurrences = {
  occurrences: Array<{ startAt: Date }>;
};

export function sortCatalogByNextOccurrence<T extends CatalogWithOccurrences>(
  items: T[],
) {
  return [...items].sort((left, right) => {
    const leftTime = left.occurrences[0]?.startAt.getTime() ?? Infinity;
    const rightTime = right.occurrences[0]?.startAt.getTime() ?? Infinity;
    return leftTime - rightTime;
  });
}
