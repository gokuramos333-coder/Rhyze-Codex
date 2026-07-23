export function parseOptionalExpiration(
  value: FormDataEntryValue | null,
  now = new Date(),
): Date | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const expiresAt = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) {
    throw new Error('Expiration date must be in the future.');
  }
  return expiresAt;
}
