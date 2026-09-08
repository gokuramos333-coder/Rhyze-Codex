export type ClassReminderReference = {
  userId: string;
  bookingId?: string;
  occurrenceId?: string;
  className?: string;
  classStartsAt?: Date;
};

export type ClassReminderLookup = (
  reference: ClassReminderReference,
) => Promise<boolean>;

type ReminderMessage = {
  template: string;
  userId: string | null;
  scheduledFor: Date;
  payload: unknown;
};

export async function classReminderIsDeliverable(
  message: ReminderMessage,
  hasActiveBooking: ClassReminderLookup,
) {
  if (message.template !== 'CLASS_REMINDER') return true;
  if (!message.userId) return false;

  const payload =
    message.payload &&
    typeof message.payload === 'object' &&
    !Array.isArray(message.payload)
      ? (message.payload as Record<string, unknown>)
      : {};
  const bookingId = textValue(payload.bookingId);
  const occurrenceId = textValue(payload.occurrenceId);
  const className = textValue(payload.className);
  const needsLegacyLookup = !bookingId || !occurrenceId;
  if (needsLegacyLookup && !className) return false;

  return hasActiveBooking({
    userId: message.userId,
    ...(bookingId ? { bookingId } : {}),
    ...(occurrenceId ? { occurrenceId } : {}),
    ...(needsLegacyLookup && className ? { className } : {}),
    ...(needsLegacyLookup
      ? {
          classStartsAt: new Date(
            message.scheduledFor.getTime() + 24 * 60 * 60 * 1000,
          ),
        }
      : {}),
  });
}

function textValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
