import type { Metadata } from 'next';
import {
  InstagramFeed,
  InstagramFeedCTA,
} from '@/components/sections/InstagramFeed';

export const metadata: Metadata = {
  title: 'Gallery',
  description:
    'A peek inside Rhyze Fitness, classes, community, and the studio. Live from @rhyze.fitness on Instagram.',
};

export default function GalleryPage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-20">
      <section className="mb-14 text-center">
        <p className="mb-4 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
          The Floor, In Pictures
        </p>
        <h1 className="font-display text-6xl tracking-wider md:text-8xl">
          GALLERY
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-rhyze-cream/75">
          Straight from our Instagram timeline, the build, the classes, the
          community.
        </p>
      </section>

      <InstagramFeed />

      <InstagramFeedCTA />
    </main>
  );
}
