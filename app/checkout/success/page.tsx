import type { Metadata } from 'next';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ClearCart } from '@/components/checkout/ClearCart';

export const metadata: Metadata = { title: 'Order confirmed' };

export default function CheckoutSuccessPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24 text-center">
      <ClearCart />
      <CheckCircle2 className="mx-auto h-14 w-14 text-rhyze-gold" aria-hidden />
      <p className="mt-6 text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">
        Payment received
      </p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">
        ORDER CONFIRMED
      </h1>
      <p className="mx-auto mt-5 max-w-xl text-rhyze-cream/70">
        Stripe will email your receipt. The Rhyze team will follow up with
        pickup or fulfillment details.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button href="/shop">Back to Shop</Button>
        <Button href="/contact" variant="outline">
          Contact Rhyze
        </Button>
      </div>
    </main>
  );
}
