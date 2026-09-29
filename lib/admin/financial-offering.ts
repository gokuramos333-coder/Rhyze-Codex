// Only spelling normalization, never customer/amount/time guesses, associates offering labels.
export function financialOfferingKey(name: string) {
  return name
    .toLowerCase()
    .replace(/\bw\//g, 'with ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
