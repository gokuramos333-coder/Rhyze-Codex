import { Button } from '@/components/ui/Button';

export function FoundersStrip() {
  return (
    <section className="relative overflow-hidden bg-rhyze-black py-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-2 lg:items-center">
        <div className="relative">
          <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-rhyze-black/40">
            <video
              src="/founders/meet-vanessa-and-melissa-clip.MOV"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label="Vanessa Ramos and Melissa Llanos, co-founders of Rhyze Fitness"
              className="absolute inset-0 h-full w-full object-contain"
            />
          </div>
          {/* Outer glow */}
          <div
            aria-hidden
            className="absolute -bottom-10 -right-10 h-64 w-64 rounded-full bg-rhyze-coral/20 blur-3xl"
          />
        </div>

        <div>
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
            The Founders
          </p>
          <h2 className="mb-6 font-display text-5xl leading-none tracking-wider md:text-7xl">
            MEET VANESSA
            <br />
            &amp; MELISSA
          </h2>
          <p className="mb-5 text-lg leading-relaxed text-rhyze-cream/80">
            Two women. One vision. A shared passion for rhythm, community, and
            the kind of workout that lights you up from the inside out.
          </p>
          <p className="mb-8 text-lg leading-relaxed text-rhyze-cream/80">
            Rhyze Fitness started as a conversation over coffee in Sussex, and
            grew into a studio built for the neighbors, friends, and strangers
            ready to move together.
          </p>
          <Button href="/instructors" size="lg" variant="outline">
            Meet Vanessa &amp; Melissa →
          </Button>
        </div>
      </div>
    </section>
  );
}
