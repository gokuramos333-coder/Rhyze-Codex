import { describe, expect, it } from 'vitest';
import { importedReservationPayment } from '@/lib/admin/imported-reservation-payment';

describe('imported reservation payment display', () => {
  it('labels standard membership bookings as membership credit use', () => {
    expect(
      importedReservationPayment({
        isEvent: false,
        accessType: 'subscribed',
        priceCents: 2500,
      }),
    ).toEqual({ label: 'Membership credit used', amountCents: null });
  });

  it('shows the exact event price for a separately purchased event', () => {
    expect(
      importedReservationPayment({
        isEvent: true,
        accessType: 'purchased',
        priceCents: 3000,
      }),
    ).toEqual({ label: 'Event purchase', amountCents: 3000 });
  });

  it('does not invent an event charge when access came from a membership', () => {
    expect(
      importedReservationPayment({
        isEvent: true,
        accessType: 'subscribed',
        priceCents: 3000,
      }),
    ).toEqual({ label: 'Membership credit used', amountCents: null });
  });
});
