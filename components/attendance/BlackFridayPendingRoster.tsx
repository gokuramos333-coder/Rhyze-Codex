import type { ReactNode } from 'react';
import type { SpecialEventAttendee, SpecialEventRoster } from '@/lib/payments/special-event-roster';
import { EventGuestControls, type GuestActions } from './EventGuestControls';

function attendanceLabel(status: SpecialEventAttendee['attendanceStatus']) {
  switch (status) {
    case 'CHECKED_IN':
    case 'ATTENDED': return 'Checked in';
    case 'NO_SHOW': return 'No show';
    case 'LATE_CANCELLED': return 'Late canceled';
    default: return 'Not checked in';
  }
}

export function eventTicketMoney(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function BlackFridayPendingRoster({
  roster, actions, renderNativeAttendance,
}: {
  roster: SpecialEventRoster;
  actions: GuestActions;
  renderNativeAttendance: (attendee: SpecialEventAttendee) => ReactNode;
}) {
  if (!roster.groups.length) return null;

  return (
    <section aria-labelledby="event-ticket-attendees" className="mt-6">
      <h2 id="event-ticket-attendees" className="font-display text-3xl tracking-wider">Event ticket attendees</h2>
      <div className="mt-3 grid gap-3">
        {roster.groups.map((group) => (
          <article key={group.orderId} className="overflow-hidden rounded-lg border border-rhyze-black/15 bg-white">
            <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rhyze-black/10 bg-rhyze-cream px-4 py-3">
              <h3 className="font-sans text-sm font-bold">{group.attendees.length === 2 ? 'Two-person ticket' : 'Single ticket'}</h3>
              {group.cashPaidCents > 0 && <p className="text-sm font-semibold">{eventTicketMoney(group.cashPaidCents)} paid</p>}
            </header>
            <ul className="divide-y divide-rhyze-black/10">
              {group.attendees.map((attendee) => {
                const isGuest = attendee.role === 'GUEST';
                const needsWaiver = attendee.waiver === 'NEEDED';
                const status = attendanceLabel(attendee.attendanceStatus);
                const checkedIn = status === 'Checked in';
                return (
                  <li key={attendee.role} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start">
                    <div className="min-w-0">
                      <h4 className="break-words font-sans text-lg font-black">{attendee.fullName}</h4>
                      <p className="mt-1 text-sm text-rhyze-black/70">
                        {isGuest ? (attendee.userId ? 'Guest · Account linked' : 'Guest · No account') : 'Buyer · Account holder'}
                        {isGuest && attendee.phone && <> · <span className="whitespace-nowrap">{attendee.phone}</span></>}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                        <span className="rounded-full bg-rhyze-black/5 px-2.5 py-1">{attendee.contribution === 'VIP_EVENT_CREDIT' ? 'VIP event credit' : 'Paid ticket'}</span>
                        <span className={`rounded-full px-2.5 py-1 ${needsWaiver ? 'bg-orange-50 text-orange-900' : 'bg-rhyze-black/5'}`}>
                          {needsWaiver ? 'Waiver needed' : attendee.waiver === 'PAPER' ? 'Paper waiver collected' : 'Waiver signed'}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 ${checkedIn ? 'bg-emerald-100 text-emerald-900' : 'bg-rhyze-black/5'}`}>{status}</span>
                      </div>
                    </div>
                    <div className="grid min-w-0 gap-2">
                      {attendee.bookingId && renderNativeAttendance(attendee)}
                      {isGuest && (
                        <EventGuestControls
                          orderId={group.orderId}
                          waiverVersionId={needsWaiver ? roster.currentWaiverVersionId : null}
                          showCheckIn={!attendee.bookingId && !checkedIn && !needsWaiver}
                          showLink={!attendee.userId && roster.canLinkAccounts}
                          actions={actions}
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
