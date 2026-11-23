import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { Button } from '@/components/ui/Button';
import {
  readSpecialEventCheckout,
  reconcileSpecialEventCheckout,
} from '@/lib/payments/special-event-reconciliation';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Event checkout' };

async function purchaser(order: string) {
  const session = await auth();
  if (!session?.user?.id) {
    const callback =
      '/checkout/event-return?order=' + encodeURIComponent(order);
    redirect('/sign-in?callbackUrl=' + encodeURIComponent(callback));
  }
  return session.user.id;
}

async function cancelCheckout(form: FormData) {
  'use server';
  const order = String(form.get('order') || '');
  const actor = await purchaser(order);
  await reconcileSpecialEventCheckout({
    orderId: order,
    actorUserId: actor,
    explicitBuyerCancel: true,
  });
  redirect('/checkout/event-return?order=' + encodeURIComponent(order));
}

const messages = {
  paid: 'Your event booking is confirmed.',
  expired: 'This checkout is closed. You can choose your tickets again.',
  pending:
    'Your checkout is still open. Continue to payment or cancel this checkout.',
  review:
    'We couldn’t confirm your booking. Check your bookings or contact the studio before paying again.',
};

export default async function EventCheckoutReturn({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order = '' } = await searchParams;
  const actor = await purchaser(order);
  const { outcome, session } = await readSpecialEventCheckout({
    orderId: order,
    actorUserId: actor,
  });
  return (
    <main className="mx-auto max-w-2xl px-6 py-24 text-center">
      <h1 className="font-display text-5xl">Event checkout</h1>
      <p className="my-6">{messages[outcome]}</p>
      <div className="flex flex-wrap justify-center gap-4">
        <Button href={outcome === 'expired' ? '/events' : '/member/bookings'}>
          {outcome === 'expired' ? 'View events' : 'My bookings'}
        </Button>
        {outcome === 'pending' && session?.url && (
          <Button href={session.url}>Continue to payment</Button>
        )}
        {outcome === 'pending' && (
          <form action={cancelCheckout}>
            <input type="hidden" name="order" value={order} />
            <Button type="submit" variant="outline">
              Cancel this checkout
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
