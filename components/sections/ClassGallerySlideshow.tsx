'use client';

import Image from 'next/image';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import React from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { ClassGalleryImageItem } from '@/lib/classes/class-gallery';

export function ClassGallerySlideshow({
  images,
}: {
  images: ClassGalleryImageItem[];
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const goPrevious = useCallback(
    () => setIndex((current) => (current - 1 + images.length) % images.length),
    [images.length],
  );
  const goNext = useCallback(
    () => setIndex((current) => (current + 1) % images.length),
    [images.length],
  );

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setPaused(true);
    }
  }, []);

  useEffect(() => {
    if (paused || images.length < 2) return;
    const timer = window.setInterval(goNext, 4_000);
    return () => window.clearInterval(timer);
  }, [goNext, images.length, paused]);

  if (!images.length) return null;
  const current = images[index % images.length];

  return (
    <div className="relative mx-auto mt-12 aspect-[16/9] max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-rhyze-charcoal shadow-2xl">
      <Image
        key={current.id}
        src={current.imageUrl}
        alt={current.altText}
        fill
        priority={index === 0}
        unoptimized={current.imageUrl.startsWith('/api/media/')}
        sizes="(max-width: 1024px) 100vw, 64rem"
        className="motion-safe:animate-[fadeIn_.45s_ease-out] object-cover"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-rhyze-black/65 via-transparent to-rhyze-black/10" />
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-4 p-4 sm:p-6">
        <p className="rounded-full bg-rhyze-black/70 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-rhyze-cream backdrop-blur">
          {index + 1} / {images.length}
        </p>
        <div className="flex items-center gap-2">
          <Control label="Previous photo" onClick={goPrevious}><ChevronLeft aria-hidden /></Control>
          <Control label={paused ? 'Resume slideshow' : 'Pause slideshow'} onClick={() => setPaused((value) => !value)}>
            {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
          </Control>
          <Control label="Next photo" onClick={goNext}><ChevronRight aria-hidden /></Control>
        </div>
      </div>
    </div>
  );
}

function Control({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="focus-ring grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-rhyze-black/75 text-rhyze-cream backdrop-blur transition hover:border-rhyze-coral hover:bg-rhyze-coral hover:text-rhyze-black"
    >
      {children}
    </button>
  );
}
