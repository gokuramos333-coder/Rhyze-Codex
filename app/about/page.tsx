import type { Metadata } from 'next';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { ParallaxImage } from '@/components/sections/ParallaxImage';

export const metadata: Metadata = {
  title: 'About',
  description:
    'The mission, the vibe, and the story behind Rhyze Fitness, Sussex County’s boutique dance, yoga, and HIIT studio.',
};

export default function AboutPage() {
  return (
    <main className="py-20">
      <section className="mx-auto max-w-4xl px-6 text-center">
        <p className="mb-4 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
          About Us
        </p>
        <h1 className="font-display text-6xl tracking-wider md:text-8xl">
          WE ARE <span className="rhyze-gradient-text">RHYZE</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-rhyze-cream/75">
          Three ideas built this studio. They&apos;re what you&apos;ll feel
          the second you walk through the door.
        </p>
      </section>

      {/* THE MISSION */}
      <section className="mx-auto mt-28 max-w-7xl px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
              01 · The Mission
            </p>
            <h2 className="mb-6 font-display text-5xl leading-none tracking-wider md:text-7xl">
              MORE THAN <br />A STUDIO
            </h2>
            <p className="text-lg leading-relaxed text-rhyze-cream/80">
              At Rhyze Fitness, our mission is to build more than just a
              studio, we&apos;re building a movement. We are dedicated to
              providing an inclusive, high-vibe space where fitness meets
              friendship. Through the power of rhythm and collective energy,
              we help our members grow stronger together, one beat at a time.
            </p>
          </div>
          <div className="relative aspect-[4/5] overflow-hidden rounded-3xl">
            <Image
              src="/founders/more-than-a-studio.jpg"
              alt="More than a studio, inside Rhyze Fitness"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover object-right"
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-rhyze-black/60 via-transparent to-rhyze-coral/10" />
          </div>
        </div>
      </section>

      {/* THE VIBE */}
      <section className="mx-auto mt-28 max-w-7xl px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div className="relative aspect-[4/5] overflow-hidden rounded-3xl lg:order-2">
            <Image
              src="/founders/come-as-you-are.gif"
              alt="Come as you are, the Rhyze vibe"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              unoptimized
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-bl from-rhyze-orange/20 via-transparent to-rhyze-black/50" />
          </div>
          <div className="lg:order-1">
            <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
              02 · The Vibe
            </p>
            <h2 className="mb-6 font-display text-5xl leading-none tracking-wider md:text-7xl">
              COME AS <br />
              YOU ARE
            </h2>
            <p className="text-lg leading-relaxed text-rhyze-cream/80">
              Rhyze Fitness is where high-octane energy meets a welcoming,
              &ldquo;come-as-you-are&rdquo; atmosphere. Think of it as your
              daily sanctuary, an electric environment where the music is
              pumping, the lights are low, and the community is unmatched.
              We&apos;ve designed our space to be a judge-free zone that is
              equally beginner-friendly and athlete-challenging. Whether
              we&apos;re celebrating a personal best or just moving to the
              beat, the vibe is always inclusive, empowering, and undeniably
              fun.
            </p>
          </div>
        </div>
      </section>

      {/* THE STORY, parallax */}
      <section className="mt-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-10 max-w-3xl">
            <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
              03 · The Story
            </p>
            <h2 className="font-display text-5xl leading-none tracking-wider md:text-8xl">
              DREAMS OVER <br />
              <span className="rhyze-gradient-text">COFFEE</span>
            </h2>
          </div>
        </div>
        <div className="relative">
          <ParallaxImage
            src="/founders/dreams-over-coffee.jpg"
            alt="Dreams over coffee, the story of Rhyze Fitness"
            className="mx-auto h-[60vh] max-w-6xl md:h-[80vh]"
            sizes="(max-width: 1024px) 100vw, 72rem"
            priority
          />
        </div>
        <div className="mx-auto mt-12 max-w-3xl px-6">
          <p className="text-lg leading-relaxed text-rhyze-cream/85 md:text-xl">
            Rhyze Fitness began with a shared vision between Vanessa and
            Melissa: to create the space they felt was missing in Sussex.
            Connected by a passion for movement and a desire to build a true
            community, they decided to join forces and build a sanctuary where
            rhythm meets strength. What started as a dream over coffee is now
            a high-energy reality where they invite everyone to Rhyze
            together.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button href="/instructors" size="lg">
              Meet the founders →
            </Button>
            <Button href="/join" size="lg" variant="outline">
              Start $7 Trial
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
