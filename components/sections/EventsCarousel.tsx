'use client';

import React, { Children, type ReactNode, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

function cardsPerPage() {
  return typeof window !== 'undefined' && window.innerWidth < 768 ? 1 : 3;
}

export function EventsCarousel({ children }: { children: ReactNode }) {
  const cards = useMemo(() => Children.toArray(children), [children]);
  const [pageSize, setPageSize] = useState(3);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const updatePageSize = () => setPageSize(cardsPerPage());
    updatePageSize();
    window.addEventListener('resize', updatePageSize);
    return () => window.removeEventListener('resize', updatePageSize);
  }, []);

  const pageCount = Math.max(1, Math.ceil(cards.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  if (!cards.length) {
    return (
      <p className="rounded-3xl border border-dashed border-rhyze-gold/35 bg-rhyze-charcoal p-8 text-sm font-bold text-rhyze-cream/65">
        No upcoming events are posted yet. Please check back soon.
      </p>
    );
  }

  const visibleCards = cards.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize,
  );

  return (
    <div>
      {pageCount > 1 && (
        <div className="mb-5 flex justify-end gap-3" aria-label="Event carousel controls">
          <button
            type="button"
            aria-label="Previous events"
            disabled={safePage === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            className="focus-ring inline-flex h-11 w-11 items-center justify-center rounded-full border border-rhyze-gold/50 text-rhyze-gold transition hover:border-rhyze-orange hover:text-rhyze-orange disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Next events"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
            className="focus-ring inline-flex h-11 w-11 items-center justify-center rounded-full border border-rhyze-gold/50 text-rhyze-gold transition hover:border-rhyze-orange hover:text-rhyze-orange disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
      )}
      <div
        className="grid gap-5 md:grid-cols-3"
        aria-live="polite"
        aria-label={`Upcoming events page ${safePage + 1} of ${pageCount}`}
      >
        {visibleCards}
      </div>
    </div>
  );
}
