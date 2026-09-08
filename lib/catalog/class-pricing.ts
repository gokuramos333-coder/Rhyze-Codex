export function parseClassPriceCents(value: unknown): number | null {
  const dollars = Number(String(value ?? '').trim());
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  return Math.round(dollars * 100);
}

export function shouldSyncOccurrencePrice(
  previousTemplatePriceCents: number | null,
  occurrencePriceCents: number | null,
): boolean {
  return (
    occurrencePriceCents === null ||
    occurrencePriceCents === previousTemplatePriceCents
  );
}
