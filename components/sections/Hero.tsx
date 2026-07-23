'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function Hero() {
  return (
    <section
      className="grain relative flex min-h-[92vh] items-center overflow-hidden bg-rhyze-black"
      style={{ position: 'relative', overflow: 'hidden' }}
    >
      {/* Background photo */}
      <Image
        src="/founders/main-intro.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        aria-hidden
        className="absolute inset-0 object-cover opacity-50"
      />
      {/* Darken + vignette so the headline pops */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-rhyze-black/90 via-rhyze-black/70 to-rhyze-black/40"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-rhyze-black/40"
      />
      {/* Ambient sunrise glow */}
      <div
        aria-hidden
        className="absolute -left-1/4 -top-1/4 h-[120%] w-[120%] animate-beam-drift bg-rhyze-gradient-radial opacity-60 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-rhyze-black to-transparent"
      />
      {/* Vertical light beam */}
      <div
        aria-hidden
        className="absolute right-0 top-0 h-full w-px bg-gradient-to-b from-transparent via-rhyze-coral/40 to-transparent"
      />

      <div className="relative mx-auto w-full max-w-7xl px-6 pt-8 md:pt-0">
        <h1 className="max-w-5xl font-display text-[clamp(3.25rem,13vw,4.5rem)] leading-[0.9] tracking-wider text-rhyze-cream md:text-[clamp(3.75rem,11vw,10rem)]">
          IN <span className="rhyze-gradient-text">RHYTHM</span>
          <span className="text-rhyze-gold">,</span>
          <br />
          WE RISE
        </h1>

        <p className="mt-8 max-w-xl text-lg text-rhyze-cream/75 md:text-xl">
          Elevate your mind, energize your body, and evolve your soul. We are a
          boutique movement studio offering dance, yoga, and strength classes for
          all levels, designed for self-expression, confidence, and the love of
          sweat. Every class is powered by rhythm, passion, and community. Let’s
          Rhyze together.
        </p>

        <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div>
            <Button href="/join" size="lg">
              Start Your $7 Trial <ArrowRight className="h-4 w-4" />
            </Button>
            <p className="mt-2 text-xs text-rhyze-cream/60">
              First 7 days · Unlimited classes · Starts August 3
            </p>
          </div>
          <Link
            href="/classes#schedule"
            className="focus-ring group rounded-full px-4 py-2 text-sm font-semibold uppercase tracking-wide text-rhyze-cream hover:text-rhyze-coral"
          >
            View Class Schedule{' '}
            <span className="inline-block transition group-hover:translate-x-1">
              →
            </span>
          </Link>
        </div>
      </div>

      {/* Scroll cue */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.3em] text-rhyze-cream/40">
        Scroll ↓
      </div>
    </section>
  );
}
