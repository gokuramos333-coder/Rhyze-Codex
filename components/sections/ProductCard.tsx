'use client';

import Image from 'next/image';
import { ShoppingBag } from 'lucide-react';
import { useState } from 'react';
import type { Product } from '@/lib/products';

export function ProductCard({ product }: { product: Product }) {
  const [showBack, setShowBack] = useState(false);
  const hasBackImage = Boolean(product.image && product.backImage);
  const activeImage = showBack && product.backImage
    ? product.backImage
    : product.image;
  const viewLabel = showBack ? 'Back' : 'Front';

  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-rhyze-charcoal transition hover:-translate-y-1 hover:border-rhyze-coral/40 hover:shadow-glow">
      <div className="relative aspect-[4/5] overflow-hidden bg-rhyze-black">
        {activeImage ? (
          <Image
            src={activeImage}
            alt={`${product.name} — ${viewLabel} view`}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className={`transition duration-500 group-hover:scale-[1.02] ${
              hasBackImage ? 'bg-white object-contain' : 'object-cover'
            }`}
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

        {hasBackImage && (
          <div
            className="absolute bottom-4 left-1/2 flex -translate-x-1/2 overflow-hidden rounded-full border border-white/20 bg-rhyze-black/85 p-1 shadow-xl backdrop-blur"
            aria-label={`${product.name} image view`}
          >
            {(['Front', 'Back'] as const).map((label) => {
              const isActive = (label === 'Back') === showBack;
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setShowBack(label === 'Back')}
                  className={`rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition ${
                    isActive
                      ? 'bg-rhyze-gold text-rhyze-black'
                      : 'text-rhyze-cream hover:bg-white/10'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
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

        {product.comingSoon ? (
          <p className="border border-rhyze-gold/50 bg-rhyze-gold/10 px-4 py-4 text-center text-xs font-black uppercase leading-relaxed tracking-widest text-rhyze-gold">
            Coming soon. Check out all available options at the studio.
          </p>
        ) : (
          <p className="border border-emerald-300/70 bg-emerald-200 px-4 py-4 text-center text-xs font-black uppercase leading-relaxed tracking-widest text-emerald-950">
            {product.availabilityLabel}
          </p>
        )}
      </div>
    </article>
  );
}
