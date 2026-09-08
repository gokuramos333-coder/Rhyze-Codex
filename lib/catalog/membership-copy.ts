type MembershipCopySource = {
  description: string;
  isUnlimited: boolean;
  includedCredits: number | null;
  cancellationPolicy: string | null;
};

function meaningKey(sentence: string) {
  const normalized = sentence
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.includes('first') && normalized.includes('client')) {
    return 'first-time-clients';
  }
  if (
    normalized.includes('unlimited') &&
    normalized.includes('standard class')
  ) {
    return 'unlimited-standard-classes';
  }
  if (
    (normalized.includes('specialty') || normalized.includes('event')) &&
    (normalized.includes('exclude') || normalized.includes('not included'))
  ) {
    return 'specialty-events-excluded';
  }
  if (normalized.includes('credit') && normalized.includes('roll over')) {
    return 'credits-rollover';
  }
  if (normalized.includes('activat') && normalized.includes('first class')) {
    return 'trial-activation';
  }
  if (normalized.includes('expir') && normalized.includes('day')) {
    return 'trial-expiration';
  }
  if (normalized.includes('merch') && normalized.includes('%')) {
    return normalized.match(/\d+%/)?.[0]
      ? `merch-${normalized.match(/\d+%/)![0]}`
      : 'merch-discount';
  }

  return normalized;
}

export function membershipDisplayDetails(product: MembershipCopySource) {
  const sentences = [
    ...product.description
      .split(/\n|(?<=[.!?])\s+/)
      .map((item) => item.trim())
      .filter(Boolean),
    product.cancellationPolicy?.trim() || null,
  ].filter((item): item is string => Boolean(item));
  const seen = new Set<string>();

  return sentences.filter((sentence) => {
    const key = meaningKey(sentence);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
