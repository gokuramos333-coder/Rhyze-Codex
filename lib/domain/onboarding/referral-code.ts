export function generateReferralCode(name: string, existingCodes: string[]): string {
  const firstName = name.trim().split(/\s+/)[0] || 'RHYZER';
  const normalized = firstName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
  const base = `${normalized || 'RHYZER'}RZ26`;
  const used = new Set(existingCodes.map((code) => code.toUpperCase()));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}
