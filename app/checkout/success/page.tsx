import type { Metadata } from 'next';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ClearCart } from '@/components/checkout/ClearCart';
import { prisma } from '@/lib/db/prisma';
import { checkoutSuccessContent } from '@/lib/payments/checkout-success';

export const metadata: Metadata = { title: 'Order confirmed' };
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CheckoutSuccessPage(
  props: {
    searchParams: Promise<{ session_id?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const order = searchParams.session_id
    ? await prisma.commerceOrder.findUnique({
        where: { stripeCheckoutSessionId: searchParams.session_id },
      })
    : null;
  const paid = order?.status === 'PAID';
  const content = checkoutSuccessContent(order?.kind, paid);
  return (
    <main className="mx-auto max-w-3xl px-6 py-24 text-center">
      {content.clearCart && <ClearCart />}
      <CheckCircle2 className="mx-auto h-14 w-14 text-rhyze-gold" aria-hidden />
      <p className="mt-6 text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">
        {content.eyebrow}
      </p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">
        {content.title}
      </h1>
      <p className="mx-auto mt-5 max-w-xl text-rhyze-cream/70">
        {content.message}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button href={content.primaryHref}>{content.primaryLabel}</Button>
        <Button href="/contact" variant="outline">
          Contact Rhyze
        </Button>
      </div>
    </main>
  );
}
