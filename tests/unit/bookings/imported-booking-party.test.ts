import { describe, expect, it } from 'vitest';
import { importedBookingParty } from '@/lib/domain/bookings/imported-booking-party';

describe('importedBookingParty', () => {
  it('ignores legacy imported guests because current Rhyze class access does not allow guests', () => {
    expect(
      importedBookingParty({
        importedAccessType: 'purchased',
        importedGuests: [
          'Alexis Caslander Guest 1',
          'Alexis Caslander Guest 2',
          'Alexis Caslander Guest 3',
        ],
      }),
    ).toEqual({
      accessType: 'purchased',
      guestNames: [],
      seatCount: 1,
    });
  });

  it('defaults a native or malformed booking to one spot', () => {
    expect(importedBookingParty(null)).toEqual({
      accessType: null,
      guestNames: [],
      seatCount: 1,
    });
    expect(importedBookingParty({ importedGuests: [' ', 42] })).toEqual({
      accessType: null,
      guestNames: [],
      seatCount: 1,
    });
  });
});
