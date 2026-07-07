'use client';

import Link from 'next/link';
import { Instagram } from 'lucide-react';
import { Button } from '@/components/ui/Button';

const HANDLE = 'rhyze.fitness';
const PROFILE_URL = `https://instagram.com/${HANDLE}`;

// Wire this up by setting NEXT_PUBLIC_LIGHTWIDGET_URL in .env.local.
// 1. Sign up free at https://lightwidget.com.
// 2. Create a widget pointing at @rhyze.fitness.
// 3. Copy the widget URL (https://cdn.lightwidget.com/widgets/<id>.html).
// 4. Paste it into NEXT_PUBLIC_LIGHTWIDGET_URL, the embed renders automatically.
const widgetUrl = process.env.NEXT_PUBLIC_LIGHTWIDGET_URL;

export function InstagramFeed() {
  return (
    <section aria-label={`Instagram feed for @${HANDLE}`}>
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

      {widgetUrl ? (
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-rhyze-charcoal">
          <iframe
            src={widgetUrl}
            title={`Instagram feed for @${HANDLE}`}
            className="h-[720px] w-full"
            scrolling="no"
            allowTransparency
          />
        </div>
      ) : (
        <FallbackTiles />
      )}
    </section>
  );
}

function FallbackTiles() {
  // Eight tiles linking to the IG profile so the section feels alive
  // before the LightWidget URL is wired up.
  const tiles = Array.from({ length: 8 });
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map((_, i) => (
        <Link
          key={i}
          href={PROFILE_URL}
          target="_blank"
          rel="noreferrer"
          className="focus-ring group relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-rhyze-charcoal"
        >
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-br from-rhyze-coral/15 via-rhyze-orange/5 to-rhyze-black/60"
          />
          <div className="relative flex h-full flex-col items-center justify-center gap-3 text-center">
            <span className="inline-flex rounded-xl border border-white/10 bg-rhyze-black/70 p-2.5 transition group-hover:border-rhyze-coral/60">
              <Instagram
                className="h-5 w-5 text-rhyze-coral"
                aria-hidden
              />
            </span>
            <p className="px-4 text-[11px] uppercase tracking-[0.25em] text-rhyze-cream/60">
              Tap to view post
            </p>
          </div>
          <span className="absolute inset-x-3 bottom-3 truncate rounded-full bg-rhyze-black/70 px-3 py-1 text-center text-[10px] uppercase tracking-widest text-rhyze-cream/70">
            @{HANDLE}
          </span>
        </Link>
      ))}
    </div>
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
