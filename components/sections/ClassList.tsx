'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Clock, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import { categoryLabel, classes, type ClassCategory } from '@/lib/classes';
import { NewProgramBadge } from '@/components/catalog/NewProgramBadge';

export type PublicClassData = {
  slug: string;
  name: string;
  category: ClassCategory;
  duration: number;
  tagline: string;
  description: string;
  whatToExpect: string[];
};

type CatFilter = 'all' | ClassCategory;

const cats: { id: CatFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'dance', label: 'Dance' },
  { id: 'yoga', label: 'Yoga & Pilates' },
  { id: 'strength', label: 'Strength & HIIT' },
];

const hashToCategory: Record<string, CatFilter> = {
  '#dance': 'dance',
  '#yoga': 'yoga',
  '#strength': 'strength',
  '#list': 'all',
};

function getCategoryFromHash(): CatFilter {
  if (typeof window === 'undefined') return 'all';
  return hashToCategory[window.location.hash] ?? 'all';
}

export function ClassList({ catalog = classes }: { catalog?: PublicClassData[] }) {
  const [cat, setCat] = useState<CatFilter>('all');

  useEffect(() => {
    const syncCategory = () => setCat(getCategoryFromHash());
    syncCategory();
    window.addEventListener('hashchange', syncCategory);
    return () => window.removeEventListener('hashchange', syncCategory);
  }, []);

  const filtered = useMemo(
    () => catalog.filter((c) => cat === 'all' || c.category === cat),
    [cat, catalog],
  );

  return (
    <div id="list" className="pt-10">
      <div className="mb-12 flex flex-col gap-4">
        <div
          className="flex flex-wrap gap-2"
          role="tablist"
          aria-label="Category"
        >
          {cats.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={cat === c.id}
              onClick={() => {
                setCat(c.id);
                const nextHash = c.id === 'all' ? 'list' : c.id;
                history.replaceState(null, '', `#${nextHash}`);
              }}
              className={cn(
                'focus-ring rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-widest transition',
                cat === c.id
                  ? 'border-rhyze-coral bg-rhyze-coral text-rhyze-black'
                  : 'border-white/10 text-rhyze-cream/70 hover:border-rhyze-coral/50 hover:text-rhyze-cream',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((c) => (
          <article
            key={c.slug}
            className="group flex flex-col rounded-2xl border border-white/10 bg-rhyze-charcoal p-6 transition hover:-translate-y-1 hover:border-rhyze-coral/40 hover:shadow-glow"
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge className="border-white/10 bg-rhyze-black/50 text-rhyze-cream/70">
                {categoryLabel[c.category]}
              </Badge>
              <Badge className="border-white/10 bg-rhyze-black/50 text-rhyze-cream/70">
                <Clock className="mr-1 h-3 w-3" aria-hidden />
                {c.duration} min
              </Badge>
              <NewProgramBadge slug={c.slug} />
            </div>
            <h3 className="mb-2 text-2xl font-black leading-tight tracking-normal text-rhyze-cream">
              {c.name}
            </h3>
            <p className="mb-4 flex-1 text-sm italic text-rhyze-gold">
              {c.tagline}
            </p>
            <p className="sr-only">{c.description}</p>
            <ul className="mb-5 grid gap-2 text-sm text-rhyze-cream/70">
              {c.whatToExpect.slice(0, 3).map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rhyze-gold" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto">
              <Link
                href={`/schedule?class=${encodeURIComponent(c.slug)}`}
                className="focus-ring inline-flex w-full items-center justify-center gap-1 rounded-full bg-rhyze-gradient px-4 py-2 text-xs font-bold uppercase tracking-widest text-rhyze-black hover:shadow-glow"
              >
                View schedule <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            </div>
          </article>
        ))}
      </div>
      {filtered.length === 0 && (
        <p className="py-16 text-center text-rhyze-cream/60">
          No classes match that category yet, try widening your filter.
        </p>
      )}
    </div>
  );
}
