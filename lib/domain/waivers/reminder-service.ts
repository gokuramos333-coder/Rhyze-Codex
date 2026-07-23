export type WaiverReminderKind = '24_HOUR' | 'UPCOMING_CLASS';

export function waiverReminderKind(
  input: {
    createdAt: Date;
    hasAcceptedCurrentVersion: boolean;
    nextClassAt: Date | null;
  },
  now = new Date(),
): WaiverReminderKind | null {
  if (input.hasAcceptedCurrentVersion) return null;
  if (
    input.nextClassAt &&
    input.nextClassAt > now &&
    input.nextClassAt.getTime() <= now.getTime() + 24 * 60 * 60 * 1000
  ) {
    return 'UPCOMING_CLASS';
  }
  if (input.createdAt.getTime() <= now.getTime() - 24 * 60 * 60 * 1000) {
    return '24_HOUR';
  }
  return null;
}
