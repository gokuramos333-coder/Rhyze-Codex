import { describe, expect, it, vi } from 'vitest';
import { fulfillClassTicket } from '@/lib/payments/class-ticket-fulfillment';
const now = new Date('2026-09-28T12:00:00Z');
function fixture() {
  const ticket = { occurrenceId: 'occurrence', name: 'Soul Line', startAt: '2026-10-16T23:30:00.000Z', endAt: '2026-10-17T00:20:00.000Z', amountCents: 1500 };
  const purchase = { id: 'purchase', userId: 'member', paidAt: now, policyAcceptance: { classTicket: ticket } };
  const occurrence = { id: 'occurrence', status: 'SCHEDULED', startAt: new Date(ticket.startAt), endAt: new Date(ticket.endAt), capacity: 30, historicalSignupCount: 0, template: { isEvent: false, isActive: true } };
  const tx: any = { $executeRaw: vi.fn(), purchase: { findUniqueOrThrow: vi.fn(async () => purchase), update: vi.fn(async ({ data }) => Object.assign(purchase, data)) }, classOccurrence: { findUnique: vi.fn(async () => occurrence) }, booking: { findUnique: vi.fn(async () => null), count: vi.fn(async () => 0), findFirst: vi.fn(async () => null), create: vi.fn(async () => ({ id: 'booking' })) }, creditAccount: { findUnique: vi.fn(async () => ({ id: 'credit', entries: [{ quantity: 1 }] })), update: vi.fn() }, creditLedgerEntry: { create: vi.fn() }, auditLog: { create: vi.fn() } };
  return { tx, ticket, occurrence };
}
describe('paid occurrence ticket fulfillment', () => {
  it('books exactly the purchased occurrence once and reserves only its purchased credit', async () => {
    const f = fixture();
    await expect(fulfillClassTicket(f.tx, 'purchase', 'member', now)).resolves.toEqual({ status: 'BOOKED', bookingId: 'booking' });
    await fulfillClassTicket(f.tx, 'purchase', 'member', now);
    expect(f.tx.booking.create).toHaveBeenCalledTimes(1);
    expect(f.tx.booking.create).toHaveBeenCalledWith({ data: expect.objectContaining({ occurrenceId: 'occurrence', source: 'CLASS_TICKET', policySnapshot: expect.objectContaining({ classTicket: f.ticket, creditAccountId: 'credit' }) }) });
    expect(f.tx.creditLedgerEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ creditAccountId: 'credit', bookingId: 'booking', type: 'RESERVE', quantity: -1 }) });
    expect(f.tx.auditLog.create).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['full class', (f: ReturnType<typeof fixture>) => f.tx.booking.count.mockResolvedValue(30)],
    ['cancelled class', (f: ReturnType<typeof fixture>) => { f.occurrence.status = 'CANCELLED'; }],
    ['past class', (f: ReturnType<typeof fixture>) => { f.occurrence.startAt = new Date('2026-09-01'); }],
    ['rescheduled class', (f: ReturnType<typeof fixture>) => { f.occurrence.endAt = new Date('2026-10-17T01:20:00Z'); }],
    ['existing booking', (f: ReturnType<typeof fixture>) => f.tx.booking.findUnique.mockResolvedValue({ id: 'existing' })],
    ['overlapping booking', (f: ReturnType<typeof fixture>) => f.tx.booking.findFirst.mockResolvedValue({ id: 'overlap' })],
  ])('preserves paid entitlement and audits review for %s', async (_label, mutate) => {
    const f = fixture(); mutate(f);
    const result = await fulfillClassTicket(f.tx, 'purchase', 'member', now);
    expect(result).toMatchObject({ status: 'REVIEW', reason: expect.any(String) });
    expect(f.tx.booking.create).not.toHaveBeenCalled();
    expect(f.tx.creditLedgerEntry.create).not.toHaveBeenCalled();
    expect(f.tx.creditAccount.update).toHaveBeenCalledWith({ where: { id: 'credit' }, data: { validUntil: null } });
    expect(f.tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'class-ticket.fulfillment-review', after: expect.objectContaining({ amountCents: 1500, occurrenceId: 'occurrence' }) }) });
  });
});
