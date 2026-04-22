'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useCart, cartTotal } from '@/lib/cart';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

export function CartDrawer() {
  const items = useCart((s) => s.items);
  const isOpen = useCart((s) => s.isOpen);
  const close = useCart((s) => s.close);
  const remove = useCart((s) => s.remove);
  const setQty = useCart((s) => s.setQty);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, close]);

  if (!mounted) return null;

  const total = cartTotal(items);

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-[65]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="Shopping cart"
          >
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={close}
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
              className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-rhyze-charcoal"
            >
              <header className="flex items-center justify-between border-b border-white/5 px-6 py-5">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5 text-rhyze-coral" />
                  <h2 className="font-display text-2xl tracking-wider">
                    YOUR CART
                  </h2>
                </div>
                <button
                  onClick={close}
                  aria-label="Close cart"
                  className="focus-ring rounded-md p-1.5 text-rhyze-cream/70 hover:text-rhyze-cream"
                >
                  <X className="h-5 w-5" />
                </button>
              </header>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                {items.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <ShoppingBag className="mb-4 h-10 w-10 text-rhyze-cream/30" />
                    <p className="text-rhyze-cream/60">
                      Your cart is empty — for now.
                    </p>
                    <Link
                      href="/shop"
                      onClick={close}
                      className="mt-4 text-sm font-semibold uppercase tracking-widest text-rhyze-coral hover:text-rhyze-gold"
                    >
                      Shop merch →
                    </Link>
                  </div>
                ) : (
                  <ul className="divide-y divide-white/5">
                    {items.map((i) => (
                      <li key={i.id} className="flex gap-4 py-4">
                        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-rhyze-black">
                          {i.image && (
                            <Image
                              src={i.image}
                              alt=""
                              fill
                              sizes="80px"
                              className="object-cover"
                            />
                          )}
                        </div>
                        <div className="flex flex-1 flex-col">
                          <p className="text-sm font-semibold">{i.name}</p>
                          <p className="text-xs text-rhyze-cream/60">
                            Size {i.size}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-rhyze-gold">
                            ${i.price * i.qty}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              onClick={() => setQty(i.id, i.qty - 1)}
                              aria-label="Decrease quantity"
                              className="focus-ring rounded-full border border-white/10 p-1 hover:border-rhyze-coral"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-6 text-center text-sm">
                              {i.qty}
                            </span>
                            <button
                              onClick={() => setQty(i.id, i.qty + 1)}
                              aria-label="Increase quantity"
                              className="focus-ring rounded-full border border-white/10 p-1 hover:border-rhyze-coral"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => remove(i.id)}
                              aria-label="Remove"
                              className="focus-ring ml-auto rounded-full p-1 text-rhyze-cream/50 hover:text-rhyze-coral"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {items.length > 0 && (
                <footer className="border-t border-white/5 p-6">
                  <div className="mb-4 flex items-baseline justify-between">
                    <span className="text-xs uppercase tracking-widest text-rhyze-cream/60">
                      Subtotal
                    </span>
                    <span className="font-display text-3xl tracking-wider">
                      ${total}
                    </span>
                  </div>
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => setCheckoutOpen(true)}
                  >
                    Checkout →
                  </Button>
                  <p className="mt-3 text-center text-[11px] uppercase tracking-widest text-rhyze-cream/40">
                    Taxes + shipping calculated at checkout
                  </p>
                </footer>
              )}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        title="CHECKOUT"
      >
        <p className="text-rhyze-cream/80">
          Checkout integration coming soon. We&apos;re wiring up secure
          payments before the studio doors open.
        </p>
        {/* TODO: Integrate Shopify or Stripe for real checkout */}
        <p className="mt-4 text-sm text-rhyze-cream/60">
          Want to reserve gear early? Email{' '}
          <a
            href="mailto:hello@rhyzefit.com"
            className="text-rhyze-coral hover:underline"
          >
            hello@rhyzefit.com
          </a>
          .
        </p>
        <Button
          onClick={() => setCheckoutOpen(false)}
          className="mt-6 w-full"
          variant="outline"
        >
          Close
        </Button>
      </Modal>
    </>
  );
}
