import React from 'react';
import { memberBookingDateTimeLabel } from '@/lib/domain/schedule/occurrence-display';

export type RescheduleDestination = {
  id: string;
  startAt: Date;
  timezone?: string | null;
  capacity: number;
  historicalSignupCount: number;
  _count: { bookings: number };
  template: { name: string };
  instructor: { name: string | null } | null;
};

export function RescheduleClassPicker({
  destinations,
}: {
  destinations: RescheduleDestination[];
}) {
  if (destinations.length === 0) {
    return (
      <p className="border-2 border-rhyze-gold/60 bg-orange-50 p-4 text-sm font-bold text-rhyze-black/70">
        No eligible classes are available within the two-week transfer window. Please contact the studio for help.
      </p>
    );
  }

  return (
    <fieldset className="grid min-w-0 gap-3">
      <legend className="mb-1 text-xs font-black uppercase tracking-widest">
        Choose your new class
      </legend>
      {destinations.map((item) => {
        const booked = item._count.bookings + item.historicalSignupCount;
        const spotsAvailable = Math.max(0, item.capacity - booked);

        return (
          <label key={item.id} className="block min-w-0 cursor-pointer">
            <input
              type="radio"
              name="destinationId"
              value={item.id}
              required
              className="peer sr-only"
            />
            <span className="grid w-full min-w-0 gap-2 border-2 border-rhyze-black/15 bg-[#fffaf2] p-4 transition hover:border-rhyze-gold peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-rhyze-orange peer-checked:border-rhyze-orange peer-checked:bg-orange-50">
              <span className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <span className="break-words text-xs font-black uppercase tracking-[0.14em] text-rhyze-coral">
                  {memberBookingDateTimeLabel(item)}
                </span>
                <span className="shrink-0 bg-rhyze-gold/20 px-2 py-1 text-[0.65rem] font-black uppercase tracking-wider">
                  {spotsAvailable} {spotsAvailable === 1 ? 'spot' : 'spots'} available
                </span>
              </span>
              <span className="break-words font-display text-3xl leading-none tracking-wider text-rhyze-black">
                {item.template.name}
              </span>
              <span className="break-words text-sm font-semibold text-rhyze-black/60">
                Instructor: {item.instructor?.name || 'TBA'}
              </span>
              <span className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.18em] text-rhyze-black/45 peer-checked:text-rhyze-coral">
                Tap to select
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
