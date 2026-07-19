'use client';

import Link from 'next/link';
import Script from 'next/script';
import { Instagram } from 'lucide-react';
import { Button } from '@/components/ui/Button';

const HANDLE = 'rhyze.fitness';
const PROFILE_URL = `https://instagram.com/${HANDLE}`;
const ELFSIGHT_APP_ID = '30afe97e-55a2-4095-9f83-112e1eae34d8';

export function InstagramFeed() {
  return (
    <section aria-label={`Instagram feed for @${HANDLE}`}>
      <Script
        src="https://elfsightcdn.com/platform.js"
        strategy="lazyOnload"
      />
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-rhyze-coral/40 bg-rhyze-coral/10 text-rhyze-coral">
            <Instagram className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-rhyze-coral">
              Live from the floor
            </p>
            <p className="font-display text-2xl tracking-wider text-rhyze-cream">
              @{HANDLE}
            </p>
          </div>
        </div>
        <Link
          href={PROFILE_URL}
          target="_blank"
          rel="noreferrer"
          className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-xs uppercase tracking-widest text-rhyze-cream/85 hover:border-rhyze-coral hover:text-rhyze-coral"
        >
          Follow on Instagram ↗
        </Link>
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-rhyze-charcoal p-2">
        <div
          className={`elfsight-app-${ELFSIGHT_APP_ID}`}
          data-elfsight-app-lazy=""
        />
      </div>
    </section>
  );
}

export function InstagramFeedCTA() {
  return (
    <section className="mt-20 rounded-3xl border border-white/10 bg-rhyze-charcoal p-10 text-center">
      <h2 className="font-display text-3xl tracking-wider md:text-4xl">
        WANT A SNEAK PEEK?
      </h2>
      <p className="mx-auto mt-4 max-w-xl text-rhyze-cream/70">
        Our Instagram is where the build, behind-the-scenes, and opening-day
        countdown live.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button href={PROFILE_URL} size="lg">
          Follow @{HANDLE} ↗
        </Button>
        <Button href="/join" size="lg" variant="outline">
          Start $7 Trial
        </Button>
      </div>
    </section>
  );
}
