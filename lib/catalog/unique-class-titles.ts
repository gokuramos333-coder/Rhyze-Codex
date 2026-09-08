export function uniqueClassTitles(titles: string[]): string[] {
  return [...new Set(titles.map((title) => title.trim()).filter(Boolean))];
}
