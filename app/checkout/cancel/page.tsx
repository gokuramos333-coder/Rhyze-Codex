import type { Metadata } from 'next';
import { Button } from '@/components/ui/Button';

export const metadata: Metadata = { title: 'Checkout canceled' };

export default function CheckoutCancelPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24 text-center">
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">
        No charge was made
      </p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">
        YOUR CART IS SAVED
      </h1>
      <p className="mx-auto mt-5 max-w-xl text-rhyze-cream/70">
        Checkout was canceled. Your selected gear is still in your cart whenever
        you are ready.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button href="/checkout">Return to Checkout</Button>
        <Button href="/shop" variant="outline">
          Keep Shopping
        </Button>
      </div>
    </main>
  );
}
