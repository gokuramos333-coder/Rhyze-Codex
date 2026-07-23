import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CheckoutClient } from '@/components/checkout/CheckoutClient';

export const metadata: Metadata = { title: 'Checkout' };

export default function CheckoutPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-20">
      <Link
        href="/shop"
        className="focus-ring inline-flex items-center gap-2 text-xs uppercase tracking-widest text-rhyze-cream/60 hover:text-rhyze-coral"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to Shop
      </Link>
      <p className="mt-10 text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">
        Rhyze Shop
      </p>
      <h1 className="mt-3 font-display text-6xl tracking-wider md:text-8xl">
        CHECKOUT
      </h1>
      <div className="mt-10">
        <CheckoutClient />
      </div>
    </main>
  );
}
