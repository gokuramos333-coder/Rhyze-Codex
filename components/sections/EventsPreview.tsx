import Image from 'next/image';
import Link from 'next/link';
import { CalendarDays, ExternalLink } from 'lucide-react';

const events = [
  {
    title: 'TCJ Hip-Hop Happy Hour with Tricia',
    date: 'Aug 3',
    time: '7:15 PM',
    length: '75 min',
    price: '$30',
    blurb:
      'A beginner-friendly hip-hop experience that feels more like a night out than a workout.',
    image: '/founders/instructor-tricia.jpg',
    imagePosition: 'center 32%',
    href: 'https://www.somble.com/rhyzefitness/events/hip-hop-happy-hour-with-t-100o7',
  },
  {
    title: 'Hypnotic Heels with Jessica',
    date: 'Aug 10',
    time: '6:45 PM',
    length: '75 min',
    price: '$30',
    blurb: 'A specialty heels class for confidence, poise, technique, and flow.',
    image: '/founders/instructor-jessica.jpg',
    imagePosition: 'center 12%',
    href: 'https://www.somble.com/rhyzefitness/events/hypnotic-heels-with-jessi-101gc',
  },
  {
    title: 'Seat Seduction with Vanessa',
    date: 'Aug 21',
    time: '6:45 PM',
    length: '75 min',
    price: '$30',
    blurb:
      'A Friday night chair choreography class for confidence, flow, and self-expression.',
    image: '/founders/instructor-vanessa.jpg',
    imagePosition: 'center 18%',
    href: 'https://www.somble.com/rhyzefitness/events/seat-seduction-with-vanes-1052t',
  },
] as const;

export function EventsPreview() {
  return (
    <section id="events" className="scroll-mt-28 bg-rhyze-black px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
              Events
            </p>
            <h2 className="font-display text-5xl tracking-wider md:text-7xl">
              UPCOMING <span className="rhyze-gradient-text">EVENTS</span>
            </h2>
            <p className="mt-4 max-w-2xl text-rhyze-cream/65">
              Specialty classes and workshops listed by date, with booking
              handled directly through Somble.
            </p>
          </div>
          <a
            href="https://www.somble.com/rhyzefitness/events"
            target="_blank"
            rel="noreferrer"
            className="focus-ring inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-xs font-semibold uppercase tracking-widest text-rhyze-cream/75 hover:border-rhyze-coral hover:text-rhyze-coral"
          >
            View All Events
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>

        <div className="-mx-6 overflow-x-auto px-6 pb-4">
          <div className="flex gap-6">
            {events.map((event) => (
              <Link
                key={event.href}
                href={event.href}
                target="_blank"
                rel="noreferrer"
                className="focus-ring group flex min-w-[290px] flex-col overflow-hidden rounded-3xl border border-rhyze-gold/30 bg-rhyze-charcoal transition hover:-translate-y-1 hover:border-rhyze-coral hover:shadow-glow sm:min-w-[360px] lg:min-w-[410px]"
              >
                <div
                  className="relative h-72 overflow-hidden bg-rhyze-black"
                  style={{ position: 'relative', overflow: 'hidden' }}
                >
                  <Image
                    src={event.image}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 410px, 90vw"
                    className="object-cover transition duration-500 group-hover:scale-105"
                    style={{ objectPosition: event.imagePosition }}
                  />
                  <div
                    aria-hidden
                    className="absolute inset-0 bg-gradient-to-t from-rhyze-black/50 via-transparent to-transparent"
                  />
                  <span className="absolute left-5 top-5 rounded-full bg-rhyze-black/85 px-3 py-1 text-xs font-bold uppercase tracking-widest text-rhyze-gold">
                    {event.date}
                  </span>
                </div>

                <div className="flex flex-1 flex-col p-6">
                  <p className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-rhyze-orange">
                    <CalendarDays className="h-4 w-4" aria-hidden />
                    {event.time} · {event.length}
                  </p>
                  <h3 className="font-display text-4xl leading-none tracking-wider">
                    {event.title}
                  </h3>
                  <p className="mt-4 flex-1 text-sm font-semibold leading-relaxed text-rhyze-cream/70">
                    {event.blurb}
                  </p>
                  <div className="mt-6 border-t border-white/10 pt-5">
                    <span className="font-display text-3xl text-rhyze-gold">
                      {event.price}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
