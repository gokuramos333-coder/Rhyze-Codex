import { classTicketBinding, classTicketFulfillment } from '@/lib/payments/class-ticket';
import Link from 'next/link';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { classTicketOffer, classTicketPurchaseId } from '@/lib/payments/class-ticket-checkout';
import { memberBookingDateTimeLabel } from '@/lib/domain/schedule/occurrence-display';
import { startClassTicketCheckoutAction } from './actions';

export default async function ClassTicketCheckoutPage({ searchParams }: { searchParams: Promise<{ occurrence?: string; result?: string }> }) {
  const user = await requireArea('member');
  const query = await searchParams;
  const purchase = await prisma.purchase.findUnique({ where: { id: classTicketPurchaseId(user.id, query.occurrence || '') }, select: { status: true, amountCents: true, policyAcceptance: true } });
  const ticket = classTicketBinding(purchase?.policyAcceptance);
  const fulfillment = classTicketFulfillment(purchase?.policyAcceptance);
  if (purchase?.status === 'PAID' && ticket) {
    return <section className="max-w-2xl border-t-4 border-rhyze-gold bg-white p-6">
      <h1 className="font-display text-4xl">{fulfillment?.status === 'BOOKED' ? 'Your class ticket' : 'Payment received — booking needs review'}</h1>
      <p className="mt-4">${(purchase.amountCents / 100).toFixed(2)} paid for {ticket.name}.</p>
      {fulfillment?.status === 'BOOKED'
        ? <Link href="/member/bookings" className="mt-4 inline-block underline">View your booking and its current status</Link>
        : <><p className="mt-4">{fulfillment?.status === 'REVIEW' ? fulfillment.reason : 'Your payment is being reconciled.'} Your place is not confirmed. Your payment remains recorded for studio review and refund assistance; please do not pay again.</p><Link href="/contact" className="mt-4 inline-block underline">Contact the studio for help or a refund</Link></>}
    </section>;
  }
  const offer = await classTicketOffer(prisma, query.occurrence || '').catch(() => null);
  if (!offer) return <div><h1 className="font-display text-4xl">Class ticket unavailable</h1><Link href="/schedule" className="mt-4 inline-block underline">Return to the schedule</Link></div>;
  const { occurrence } = offer;
  const pendingTicket = purchase?.status === 'PENDING' ? ticket : null;
  const amountCents = pendingTicket?.amountCents ?? offer.amountCents;
  const displayedOccurrence = pendingTicket ? { ...occurrence, startAt: new Date(pendingTicket.startAt), endAt: new Date(pendingTicket.endAt) } : occurrence;
  return <section className="max-w-2xl border-t-4 border-rhyze-gold bg-white p-6">
    <p className="text-xs font-black uppercase tracking-widest text-rhyze-coral">Single class ticket</p>
    <h1 className="mt-3 font-display text-5xl">{pendingTicket?.name || occurrence.titleOverride || occurrence.template.name}</h1>
    <p className="mt-3 font-bold">{memberBookingDateTimeLabel(displayedOccurrence)}</p>
    <p className="mt-5 font-display text-4xl">${(amountCents / 100).toFixed(2)}</p>
    <p className="mt-3">This ticket is valid only for this class and date. Your place is confirmed after successful payment when the class still has availability. It cannot be transferred to another class.</p>
    {query.result && <p role="alert" className="mt-4 font-bold text-rhyze-coral">{query.result === 'full' ? 'This class is full. Please return to the schedule.' : query.result === 'cancelled' ? 'You left Checkout. You can resume the same payment attempt below.' : 'Checkout could not be completed. Please try again or contact the studio.'}</p>}
    <form action={startClassTicketCheckoutAction} className="mt-6">
      <input type="hidden" name="occurrenceId" value={occurrence.id} />
      <button className="bg-rhyze-gradient px-6 py-4 text-sm font-black uppercase">{pendingTicket ? 'Resume checkout' : 'Pay'} ${(amountCents / 100).toFixed(2)}</button>
    </form>
    <Link href={`/member/bookings/new?occurrence=${encodeURIComponent(occurrence.id)}`} className="mt-5 inline-block underline">Use an existing membership or class credit</Link>
  </section>;
}
