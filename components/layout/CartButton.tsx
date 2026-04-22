'use client';

import { useEffect, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { cartCount, useCart } from '@/lib/cart';

export function CartButton({ className }: { className?: string }) {
  const items = useCart((s) => s.items);
  const open = useCart((s) => s.open);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const count = mounted ? cartCount(items) : 0;

  return (
    <button
      type="button"
      onClick={open}
      aria-label={`Open cart (${count} items)`}
      className={`focus-ring relative rounded-full border border-white/10 p-2 text-rhyze-cream transition hover:border-rhyze-coral hover:text-rhyze-coral ${className ?? ''}`}
    >
      <ShoppingBag className="h-5 w-5" />
      {count > 0 && (
        <span
          aria-hidden
          className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rhyze-coral px-1 text-[10px] font-bold text-rhyze-black"
        >
          {count}
        </span>
      )}
    </button>
  );
}
