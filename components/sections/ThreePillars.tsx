import Link from 'next/link';
import { Music, Heart, Flame } from 'lucide-react';

const pillars = [
  {
    Icon: Music,
    title: 'DANCE',
    sub: 'Find your rhythm',
    body: 'Signature dance-cardio, Latin ritmos, and choreography-based sweat sessions.',
    href: '/classes#dance',
    tint: 'from-rhyze-coral/30',
  },
  {
    Icon: Heart,
    title: 'YOGA & PILATES',
    sub: 'Find your center',
    body: 'Flow-based yoga, restorative holds, and Pilates-informed core burners.',
    href: '/classes#yoga',
    tint: 'from-rhyze-orange/30',
  },
  {
    Icon: Flame,
    title: 'STRENGTH & HIIT',
    sub: 'Find your power',
    body: 'Circuit strength, heavy lifting, and gritty, high-octane HIIT.',
    href: '/classes#strength',
    tint: 'from-rhyze-gold/30',
  },
];

export function ThreePillars() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24">
      <div className="grid gap-6 md:grid-cols-3">
        {pillars.map(({ Icon, title, sub, body, href, tint }) => (
          <Link
            key={title}
            href={href}
            className="focus-ring group relative overflow-hidden rounded-3xl border border-white/10 bg-rhyze-charcoal p-8 transition hover:-translate-y-1 hover:border-rhyze-coral/50 hover:shadow-glow"
          >
            <div
              className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${tint} to-transparent opacity-60 transition group-hover:opacity-100`}
            />
            <div className="relative">
              <div className="mb-8 inline-flex items-center justify-center rounded-2xl border border-white/10 bg-rhyze-black/50 p-4">
                <Icon className="h-8 w-8 text-rhyze-coral" aria-hidden />
              </div>
              <h3 className="mb-2 font-display text-4xl tracking-wider">
                {title}
              </h3>
              <p className="mb-4 text-lg italic text-rhyze-gold">{sub}</p>
              <p className="mb-6 text-sm text-rhyze-cream/70">{body}</p>
              <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-rhyze-cream group-hover:text-rhyze-coral">
                Explore →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
