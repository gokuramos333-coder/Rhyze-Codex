export type CredentialReminderKind = '30_DAY' | '7_DAY' | '1_DAY' | 'EXPIRED';

export function credentialReminderKind(expiresAt: Date, now: Date): CredentialReminderKind | null {
  const remaining = expiresAt.getTime() - now.getTime();
  if (remaining < 0) return 'EXPIRED';
  const days = Math.round(remaining / (24 * 60 * 60 * 1000));
  if (days === 30) return '30_DAY';
  if (days === 7) return '7_DAY';
  if (days === 1) return '1_DAY';
  return null;
}
