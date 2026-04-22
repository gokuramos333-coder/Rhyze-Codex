import type { Metadata } from 'next';
import { Button } from '@/components/ui/Button';
import { GalleryGrid } from '@/components/sections/GalleryGrid';

export const metadata: Metadata = {
  title: 'Gallery',
  description:
    'A peek inside Rhyze Fitness — classes, community, and the studio. Real photos coming with opening week.',
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
          Full studio photography drops as we approach opening day. Follow
          along on Instagram for real-time looks at the build.
        </p>
      </section>

      <GalleryGrid />

      <section className="mt-20 rounded-3xl border border-white/10 bg-rhyze-charcoal p-10 text-center">
        <h2 className="font-display text-3xl tracking-wider md:text-4xl">
          WANT A SNEAK PEEK?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-rhyze-cream/70">
          Our Instagram is where the build, behind-the-scenes, and
          opening-day countdown live.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button href="https://instagram.com/rhyze.fitness" size="lg">
            Follow @rhyze.fitness ↗
          </Button>
          <Button href="/join" size="lg" variant="outline">
            Start $7 Trial
          </Button>
        </div>
      </section>
    </main>
  );
}
