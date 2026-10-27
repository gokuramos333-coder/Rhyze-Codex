/** Preserve the original early cancellation when later attendance edits overwrote it.
 * The caller supplies the grant found by the exact event-cancellation booking key.
 * This chooses a history timestamp only: it never grants or restores credits.
 */
export function restoredCancellationAt(
  cancelledAt: Date | null,
  restoredAt: Date,
  existingEventRestore: { createdAt: Date; reason: string | null } | null,
): Date {
  const recorded = cancelledAt ?? restoredAt;
  if (existingEventRestore?.reason === 'Early event cancellation replacement credit'
      && existingEventRestore.createdAt < recorded) {
    return existingEventRestore.createdAt;
  }
  return recorded;
}
