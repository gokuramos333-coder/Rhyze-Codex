import { describe, expect, it } from 'vitest';
import { classTicketBinding, classTicketCanBook, classTicketCanTransfer, classTicketCreditTerms } from '@/lib/payments/class-ticket';
const binding = { occurrenceId: 'october-class', name: 'Soul Line', startAt: '2026-10-16T23:30:00.000Z', endAt: '2026-10-17T00:20:00.000Z', amountCents: 1500 };
describe('occurrence-bound class purchase entitlement', () => {
  it('allows only the purchased occurrence across calendar months', () => {
    expect(classTicketCanBook({ classTicket: binding }, 'october-class')).toBe(true);
    expect(classTicketCanBook({ classTicket: binding }, 'expensive-class')).toBe(false);
  });
  it('does not restrict ordinary membership or standard drop-in purchases', () => {
    expect(classTicketCanBook(null, 'any')).toBe(true);
    expect(classTicketCanTransfer(null)).toBe(true);
  });
  it('fails closed for malformed occurrence bindings and disallows transferring discounted class tickets', () => {
    expect(classTicketBinding({ classTicket: { occurrenceId: 'october-class' } })).toBeNull();
    expect(classTicketCanBook({ classTicket: {} }, 'october-class')).toBe(false);
    expect(classTicketCanTransfer({ classTicket: binding })).toBe(false);
  });
  it('expires the scoped credit after the purchased class, not the payment month', () => {
    expect(classTicketCreditTerms({ classTicket: binding })).toEqual({ label: 'Single-class ticket — Soul Line — 2026-10-16', validUntil: new Date(binding.endAt) });
  });
});
