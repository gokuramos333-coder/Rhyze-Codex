import Image from 'next/image';
import Link from 'next/link';

export const metadata = {
  title: 'Event Choreography | Rhyze Fitness',
  description: 'Custom choreography and private dance parties for youth celebrations, birthdays, bachelorettes, and milestone events.',
};

export default function EventChoreographyPage() {
  return (
    <main>
      <section className="mx-auto grid max-w-7xl gap-10 px-6 py-16 lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:py-24">
        <div className="relative min-h-[30rem] overflow-hidden rounded-3xl border border-white/10">
          <Image src="/founders/event-choreography-page.png" alt="A joyful Rhyze dance class moving together" fill priority sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-rhyze-black via-rhyze-black/10 to-transparent" />
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Private experiences</p>
          <h1 className="mt-4 font-display text-6xl tracking-wider md:text-8xl">EVENT <span className="rhyze-gradient-text">CHOREOGRAPHY</span></h1>
          <div className="mt-8 space-y-6 text-lg leading-8 text-rhyze-cream/75">
            <p><strong className="text-rhyze-gold">Quinceañeras, Sweet 16s &amp; Youth Events:</strong> Custom court-of-honor and group choreography tailored for kids and teens. We keep it fun, modern, and step-by-step so everyone feels confident on the dance floor.</p>
            <p><strong className="text-rhyze-gold">Private Celebration Parties:</strong> Host an exclusive dance party for bachelorettes, birthdays, ladies&apos; nights, or any milestone. Music and format are fully customized to fit your group.</p>
            <p>From milestone youth celebrations to private adult dance parties, we bring rhythm, energy, and custom routines to any occasion.</p>
          </div>
          <Link href="/contact?subject=Event%20Choreography#contact-form" className="focus-ring mt-9 inline-flex bg-rhyze-gradient px-6 py-4 text-xs font-black uppercase tracking-widest text-rhyze-black">Plan your event →</Link>
        </div>
      </section>
    </main>
  );
}
