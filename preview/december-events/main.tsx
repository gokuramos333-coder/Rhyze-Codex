import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BlackFridayPendingRoster } from '@/components/attendance/BlackFridayPendingRoster';
import type { GuestActions } from '@/components/attendance/EventGuestControls';
import { EventPaymentReview } from '@/components/attendance/EventPaymentReview';
import { BookingAttendanceControls, Roster } from '@/components/attendance/Roster';
import { EventCheckoutButton } from '@/components/checkout/EventCheckoutButton';
import type { SpecialEventAttendee, SpecialEventRoster } from '@/lib/payments/special-event-roster';

const previewDate = new Date('2026-12-27T16:00:00Z');
const events = [
  { name: 'Seat Seduction', date: 'December 11 · 7:30 PM', slug: 'seat-seduction-vanessa', id: 'schedule-import-d7e5b1377dccf88d1d90068c557d' },
  { name: 'Hypnotic Heels', date: 'December 17 · 7:15 PM', slug: 'hypnotic-heels-nicole', id: 'schedule-import-e54e7b12d550433a85e6e7f495ec' },
  { name: 'Get Fit with the Fishers', date: 'December 27 · 11:00 AM', slug: 'get-fit-with-the-fishers-mw000b75', id: 'schedule-import-12cc3b9897966042d0954cb495b0' },
  { name: 'Tricia’s specialty event', date: 'December 4 · 7:30 PM', slug: 'preview-tricia', id: 'preview-tricia' },
];
const initialRoster: SpecialEventRoster = {
  groups: [
    {
      orderId: 'sample-pair',
      cashPaidCents: 1500,
      attendees: [
        {
          role: 'BUYER', fullName: 'Morgan Ellis', phone: null, userId: 'morgan',
          bookingId: 'preview-morgan-booking', contribution: 'VIP_EVENT_CREDIT',
          waiver: 'ELECTRONIC', attendanceStatus: 'CHECKED_IN', checkedInAt: previewDate, markedById: 'demo-staff',
        },
        {
          role: 'GUEST', fullName: 'Casey Rowan', phone: '+12015550129', userId: null,
          bookingId: null, contribution: 'CASH_TICKET', waiver: 'NEEDED',
          attendanceStatus: null, checkedInAt: null, markedById: null,
        },
      ],
    },
    {
      orderId: 'sample-single',
      cashPaidCents: 2500,
      attendees: [{
        role: 'BUYER', fullName: 'Jordan Blake', phone: null, userId: 'jordan',
        bookingId: 'preview-jordan-booking', contribution: 'CASH_TICKET',
        waiver: 'ELECTRONIC', attendanceStatus: 'CHECKED_IN', checkedInAt: previewDate, markedById: 'demo-staff',
      }],
    },
  ],
  linkedBookingIds: ['preview-morgan-booking', 'preview-jordan-booking'],
  reviewItems: [{
    orderId: 'sample-private-issue', management: 'SPECIAL_TICKET', buyerName: 'Riley Hayes',
    state: 'REVIEW', collectedCents: 4000, remainingCents: 4000, canRefund: true, canReconcile: true,
  }],
  currentWaiverVersionId: 'sample-waiver-version',
  canLinkAccounts: true,
};

const notify = (detail: string) => window.dispatchEvent(new CustomEvent('preview-action', { detail }));
window.fetch = async (input) => {
  if (input !== '/api/checkout/event') throw new Error('This preview has no network access.');
  notify('Simulated checkout was submitted. No payment was collected.');
  return Response.json({ url: '#preview-result' });
};

function Preview() {
  const [view, setView] = useState<'Checkout' | 'Admin roster' | 'Instructor roster'>('Checkout');
  const [notice, setNotice] = useState('');
  const [roster, setRoster] = useState(initialRoster);
  const instructor = view === 'Instructor roster';

  function updateAttendees(change: (attendee: SpecialEventAttendee, orderId: string) => SpecialEventAttendee) {
    setRoster((current) => ({
      ...current,
      groups: current.groups.map((group) => ({
        ...group, attendees: group.attendees.map((attendee) => change(attendee, group.orderId)),
      })),
    }));
  }

  useEffect(() => {
    function onAction(event: Event) {
      setNotice((event as CustomEvent<string>).detail);
    }
    function onAttendance(event: Event) {
      const { bookingId, status } = (event as CustomEvent<{ bookingId: string; status: 'CHECKED_IN' | 'NO_SHOW' | 'LATE_CANCELLED' }>).detail;
      updateAttendees((attendee) => attendee.bookingId === bookingId ? {
        ...attendee, attendanceStatus: attendee.attendanceStatus === status ? null : status,
      } : attendee);
      setNotice('Simulated attendance updated.');
    }
    window.addEventListener('preview-action', onAction);
    window.addEventListener('preview-attendance', onAttendance);
    return () => {
      window.removeEventListener('preview-action', onAction);
      window.removeEventListener('preview-attendance', onAttendance);
    };
  }, []);

  const actions: GuestActions = {
    recordPaperWaiverAction: async ({ orderId, paperCollected }) => {
      if (!paperCollected) return false;
      updateAttendees((attendee, id) => attendee.role === 'GUEST' && id === orderId ? { ...attendee, waiver: 'PAPER' } : attendee);
      setNotice('Simulated paper waiver record saved.');
      return true;
    },
    checkInAction: async ({ orderId }) => {
      updateAttendees((attendee, id) => attendee.role === 'GUEST' && id === orderId ? {
        ...attendee, attendanceStatus: 'CHECKED_IN', checkedInAt: previewDate, markedById: 'demo-staff',
      } : attendee);
      setNotice('Simulated guest check-in saved.');
      return true;
    },
    searchAccountsAction: async ({ query }) => (
      'casey rowan'.includes(query.toLowerCase()) || '+12015550129'.includes(query)
        ? [{ id: 'casey-sample-account', name: 'Casey Rowan', phone: '+12015550129' }]
        : []
    ),
    linkAccountAction: async ({ orderId, selectedUserId, identityConfirmed }) => {
      if (!identityConfirmed || selectedUserId !== 'casey-sample-account') return false;
      updateAttendees((attendee, id) => attendee.role === 'GUEST' && id === orderId
        ? { ...attendee, userId: selectedUserId, bookingId: 'preview-casey-booking' }
        : attendee);
      setNotice('Simulated guest account linked.');
      return true;
    },
  };

  return (
    <div className="min-h-screen bg-rhyze-black font-sans text-rhyze-cream">
      <header className="border-b border-white/15">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-8">
          <p className="text-xs font-black uppercase tracking-widest text-rhyze-gold">Simulation · fictional attendees · local only</p>
          <h1 className="mt-2 font-display text-5xl tracking-wider sm:text-6xl">December Events</h1>
          <nav aria-label="Preview views" className="mt-4 flex flex-wrap gap-2">
            {(['Checkout', 'Admin roster', 'Instructor roster'] as const).map((item) => (
              <button key={item} type="button" aria-pressed={view === item}
                onClick={() => { setView(item); setNotice(''); }}
                className={`focus-ring min-h-11 rounded-md border px-3 text-sm font-semibold ${view === item ? 'border-rhyze-gold bg-rhyze-gold text-rhyze-black' : 'border-white/25'}`}>
                {item}
              </button>
            ))}
          </nav>
        </div>
      </header>
      {notice && <p id="preview-result" role="status" className="mx-auto max-w-6xl px-4 pt-4 text-sm text-rhyze-gold sm:px-8">{notice}</p>}
      {view === 'Checkout' ? (
        <main className="mx-auto grid max-w-6xl gap-4 px-4 py-6 md:grid-cols-2 sm:px-8">
          {events.map((event) => (
            <section key={event.id} className="self-start rounded-2xl border border-white/15 bg-rhyze-charcoal p-5">
              <h2 className="font-display text-4xl tracking-wide">{event.name}</h2>
              <p className="mt-2 text-sm text-rhyze-cream/75">{event.date}</p>
              <EventCheckoutButton slug={event.slug} occurrenceId={event.id} specialTicketSalesEnabled />
            </section>
          ))}
        </main>
      ) : (
        <main className={`bg-rhyze-cream text-rhyze-black ${instructor ? '' : 'admin-shell'}`} style={{ colorScheme: 'light' }}>
          <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8">
            <p className="text-xs font-black uppercase tracking-widest text-rhyze-coral">{instructor ? 'Class roster' : 'Attendance desk'}</p>
            <h2 className="mt-2 font-display text-5xl tracking-wider">Get Fit with the Fishers</h2>
            <p className="mt-2 text-sm text-rhyze-black/65">December 27 · 11:00 AM · 4/25 booked</p>
            <BlackFridayPendingRoster roster={{ ...roster, canLinkAccounts: !instructor }} actions={actions}
              renderNativeAttendance={(attendee) => attendee.bookingId && (
                <BookingAttendanceControls occurrenceId="preview-fishers" bookingId={attendee.bookingId}
                  attendanceStatus={attendee.attendanceStatus} canCheckIn={attendee.role === 'BUYER' || attendee.waiver !== 'NEEDED'} />
              )} />
            <Roster occurrenceId="preview-fishers" bookings={[{
              id: 'preview-comp', status: 'CONFIRMED', bookedAt: previewDate,
              user: { id: 'preview-sam', name: 'Sam Harper', email: 'sam@example.invalid' },
              attendance: null, paymentMethod: 'Complimentary', currentPlan: 'No active plan',
            }]} />
            {!instructor && <EventPaymentReview items={roster.reviewItems} reviewAction={async () => {
              setNotice('Simulated payment action complete. No money moved.');
              return true;
            }} />}
          </div>
        </main>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Preview />);
