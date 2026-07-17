'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Clock, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import { sombleScheduleUrl } from '@/lib/somble';
import { categoryLabel, classes, type ClassCategory } from '@/lib/classes';

type CatFilter = 'all' | ClassCategory;

const cats: { id: CatFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'dance', label: 'Dance' },
  { id: 'yoga', label: 'Yoga & Pilates' },
  { id: 'strength', label: 'Strength & HIIT' },
];

export function ClassList() {
  const [cat, setCat] = useState<CatFilter>('all');

  const filtered = useMemo(
    () => classes.filter((c) => cat === 'all' || c.category === cat),
    [cat],
  );

  return (
    <div id="list">
      <div className="mb-8 flex flex-col gap-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Category">
          {cats.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={cat === c.id}
              onClick={() => setCat(c.id)}
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
            </div>
            <h3 className="mb-2 font-display text-3xl tracking-wider">
              {c.name}
            </h3>
            <p className="mb-4 flex-1 text-sm italic text-rhyze-gold">
              {c.tagline}
            </p>
            <p className="mb-5 text-sm text-rhyze-cream/70">{c.description}</p>
            <div className="flex items-center justify-between gap-3">
              <Link
                href={`/classes/${c.slug}`}
                className="focus-ring text-xs font-semibold uppercase tracking-widest text-rhyze-cream/60 hover:text-rhyze-coral"
              >
                Class Details
              </Link>
              <Link
                href={sombleScheduleUrl}
                target="_blank"
                rel="noreferrer"
                className="focus-ring inline-flex items-center gap-1 rounded-full bg-rhyze-gradient px-4 py-2 text-xs font-bold uppercase tracking-widest text-rhyze-black hover:shadow-glow"
              >
                Book <ArrowRight className="h-3 w-3" aria-hidden />
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
