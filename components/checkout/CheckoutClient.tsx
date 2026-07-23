'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Loader2, LockKeyhole, ShoppingBag } from 'lucide-react';
import { cartTotal, useCart } from '@/lib/cart';
import { Button } from '@/components/ui/Button';
import { site } from '@/lib/site';

export function CheckoutClient() {
  const items = useCart((state) => state.items);
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => setMounted(true), []);

  async function beginCheckout() {
    setStatus('loading');
    setMessage('');
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: items.map(({ productId, size, qty }) => ({
            productId,
            size,
            qty,
          })),
        }),
      });
      const result = (await response.json()) as {
        url?: string;
        message?: string;
      };
      if (!response.ok || !result.url) {
        throw new Error(result.message || 'Checkout could not be started.');
      }
      window.location.assign(result.url);
    } catch (error) {
      setStatus('error');
      setMessage(
        error instanceof Error
          ? error.message
          : 'Checkout could not be started.',
      );
    }
  }

  if (!mounted) {
    return <p className="text-rhyze-cream/60">Loading your cart…</p>;
  }

  if (items.length === 0) {
    return (
      <section className="rounded-3xl border border-white/10 bg-rhyze-charcoal p-8 text-center">
        <ShoppingBag
          className="mx-auto h-10 w-10 text-rhyze-gold"
          aria-hidden
        />
        <h2 className="mt-4 font-display text-4xl tracking-wider">
          YOUR CART IS EMPTY
        </h2>
        <p className="mt-3 text-rhyze-cream/65">
          Choose your Rhyze gear before checking out.
        </p>
        <Button href="/shop" className="mt-6">
          Return to Shop
        </Button>
      </section>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
      <section className="rounded-3xl border border-white/10 bg-rhyze-charcoal p-6">
        <h2 className="font-display text-4xl tracking-wider">ORDER SUMMARY</h2>
        <ul className="mt-5 divide-y divide-white/10">
          {items.map((item) => (
            <li key={item.id} className="flex gap-4 py-4">
              <div className="relative h-20 w-20 overflow-hidden rounded-xl bg-rhyze-black">
                {item.image && (
                  <Image
                    src={item.image}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                )}
              </div>
              <div className="flex-1">
                <p className="font-bold">{item.name}</p>
                <p className="text-sm text-rhyze-cream/55">
                  Size {item.size} · Quantity {item.qty}
                </p>
              </div>
              <p className="font-bold text-rhyze-gold">
                ${item.price * item.qty}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <aside className="h-fit rounded-3xl border border-rhyze-gold/25 bg-rhyze-gold/10 p-6">
        <div className="flex items-center gap-2 text-rhyze-gold">
          <LockKeyhole className="h-5 w-5" aria-hidden />
          <p className="text-xs font-black uppercase tracking-widest">
            Secure checkout
          </p>
        </div>
        <div className="mt-6 flex justify-between border-t border-white/10 pt-5">
          <span>Subtotal</span>
          <strong className="font-display text-3xl">${cartTotal(items)}</strong>
        </div>
        <p className="mt-2 text-xs text-rhyze-cream/50">
          Taxes and fulfillment details are confirmed in Stripe.
        </p>
        <Button
          className="mt-6 w-full"
          size="lg"
          onClick={beginCheckout}
          disabled={status === 'loading'}
        >
          {status === 'loading' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Connecting…
            </>
          ) : (
            'Continue to Payment'
          )}
        </Button>
        {status === 'error' && (
          <div className="mt-4 border-l-4 border-rhyze-coral bg-rhyze-coral/10 p-3 text-sm">
            <p>{message}</p>
            <p className="mt-2">
              <Link href="/contact" className="font-bold text-rhyze-gold">
                Contact us
              </Link>{' '}
              or call{' '}
              <a
                href={`tel:${site.phoneTel}`}
                className="font-bold text-rhyze-gold"
              >
                {site.phone}
              </a>
              .
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
