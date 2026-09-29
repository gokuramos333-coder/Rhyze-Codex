import { z } from 'zod';

const bindingSchema = z.object({
  occurrenceId: z.string().min(1),
  name: z.string().min(1),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  amountCents: z.number().int().positive(),
});
function hasBinding(policy: unknown) {
  return !!policy && typeof policy === 'object' && !Array.isArray(policy) && 'classTicket' in policy;
}
export function classTicketBinding(policy: unknown) {
  if (!hasBinding(policy)) return null;
  const parsed = bindingSchema.safeParse((policy as Record<string, unknown>).classTicket);
  return parsed.success ? parsed.data : null;
}
export function classTicketCanBook(policy: unknown, occurrenceId?: string, startsAt?: Date) {
  if (!hasBinding(policy)) return true;
  const binding = classTicketBinding(policy);
  return Boolean(occurrenceId && binding?.occurrenceId === occurrenceId &&
    classTicketFulfillment(policy)?.status !== 'REVIEW' &&
    (!startsAt || startsAt.toISOString() === binding.startAt));
}
export function classTicketCanTransfer(policy: unknown) {
  return !hasBinding(policy);
}
export function classTicketPolicySnapshot(policy: unknown) {
  const binding = classTicketBinding(policy);
  return binding ? { classTicket: binding } : {};
}
export function classTicketCreditTerms(policy: unknown) {
  const binding = classTicketBinding(policy);
  if (!binding) return {};
  return { label: `Single-class ticket — ${binding.name} — ${binding.startAt.slice(0, 10)}`, validUntil: new Date(binding.endAt) };
}

export function classTicketFulfillment(policy: unknown) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) return null;
  const parsed = z.discriminatedUnion('status', [
    z.object({ status: z.literal('BOOKED'), bookingId: z.string().min(1) }),
    z.object({ status: z.literal('REVIEW'), reason: z.string().min(1) }),
  ]).safeParse((policy as Record<string, unknown>).classTicketFulfillment);
  return parsed.success ? parsed.data : null;
}
