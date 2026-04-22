'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Product } from '@/lib/products';
import { useCart } from '@/lib/cart';
import { Button } from '@/components/ui/Button';

export function ProductCard({ product }: { product: Product }) {
  const [size, setSize] = useState(product.sizes[0]);
  const add = useCart((s) => s.add);

  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-rhyze-charcoal transition hover:-translate-y-1 hover:border-rhyze-coral/40 hover:shadow-glow">
      <div className="relative aspect-[4/5] overflow-hidden bg-rhyze-black">
        {product.image ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="relative flex h-full items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-br from-rhyze-coral/10 via-rhyze-orange/5 to-transparent" />
            <div className="relative text-center">
              <div className="inline-flex rounded-2xl border border-white/10 bg-rhyze-black/60 p-4">
                <ShoppingBag
                  className="h-8 w-8 text-rhyze-coral"
                  aria-hidden
                />
              </div>
              <p className="mt-6 font-display text-2xl tracking-wider">
                COMING SOON
              </p>
              <p className="mt-1 text-xs uppercase tracking-widest text-rhyze-cream/50">
                Drop incoming
              </p>
            </div>
          </div>
        )}
        {product.comingSoon && (
          <span className="absolute left-4 top-4 rounded-full bg-rhyze-gold px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-rhyze-black">
            Coming Soon
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-6">
        <h3 className="mb-1 font-display text-2xl tracking-wider">
          {product.name}
        </h3>
        <p className="mb-4 text-2xl font-semibold text-rhyze-gold">
          ${product.price}
        </p>
        <p className="mb-5 flex-1 text-sm text-rhyze-cream/70">
          {product.description}
        </p>

        <fieldset className="mb-5">
          <legend className="mb-2 text-xs uppercase tracking-widest text-rhyze-cream/50">
            Size
          </legend>
          <div className="flex flex-wrap gap-2">
            {product.sizes.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSize(s)}
                disabled={product.comingSoon}
                className={cn(
                  'focus-ring rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-widest transition',
                  size === s
                    ? 'border-rhyze-coral bg-rhyze-coral text-rhyze-black'
                    : 'border-white/10 text-rhyze-cream/70 hover:border-rhyze-coral/50',
                  product.comingSoon && 'opacity-40',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </fieldset>

        <Button
          onClick={() => add(product, size)}
          disabled={product.comingSoon}
          className="w-full"
        >
          {product.comingSoon ? 'Coming Soon' : 'Add to Cart'}
        </Button>
      </div>
    </article>
  );
}
