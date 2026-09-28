'use client';

import React, { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Keep the selected date visible without moving the surrounding page. */
export function CalendarDayStrip({
  selectedDateKey,
  className,
  children,
}: {
  selectedDateKey: string;
  className: string;
  children: ReactNode;
}) {
  const stripRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const strip = stripRef.current;
    const selected = strip?.querySelector<HTMLElement>(
      '[aria-current="date"], [aria-pressed="true"]',
    );
    if (!strip || !selected) return;

    const revealSelectedDate = () => {
      if (!strip.clientWidth || strip.scrollWidth <= strip.clientWidth) return;
      const stripBounds = strip.getBoundingClientRect();
      const selectedBounds = selected.getBoundingClientRect();
      const centered = strip.scrollLeft + selectedBounds.left - stripBounds.left
        - (strip.clientWidth - selectedBounds.width) / 2;
      strip.scrollLeft = Math.max(0, Math.min(centered, strip.scrollWidth - strip.clientWidth));
    };
    revealSelectedDate();
    // Recalculate after rotation/resizing, including a desktop-to-mobile change.
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(revealSelectedDate);
      observer.observe(strip);
      observer.observe(selected);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', revealSelectedDate);
    return () => window.removeEventListener('resize', revealSelectedDate);
  }, [selectedDateKey]);

  return (
    <div ref={stripRef} className={className} aria-label="Choose a day this week">
      {children}
    </div>
  );
}
