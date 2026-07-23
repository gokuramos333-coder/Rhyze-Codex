import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  ShieldCheck,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { categoryLabel, type RhyzeClass } from '@/lib/classes';
import { instructors } from '@/lib/instructors';
import { tiers } from '@/lib/pricing';
import { sombleScheduleUrl } from '@/lib/somble';

type ClassScheduleHighlight = {
  day: string;
  date: string;
  time: string;
  room: string;
  price: string;
};

const scheduleHighlights: Record<string, ClassScheduleHighlight> = {
  'pilates-pulse-adrianna': {
    day: 'Mon',
    date: 'Aug 3',
    time: '10:00 AM',
    room: 'Studio B',
    price: '$26',
  },
  'yoga-flow-adrianna': {
    day: 'Mon',
    date: 'Aug 3',
    time: '11:00 AM',
    room: 'Studio B',
    price: '$26',
  },
  'ignite-julie': {
    day: 'Mon',
    date: 'Aug 3',
    time: '12:00 PM',
    room: 'Main Floor',
    price: '$28',
  },
  'heels-101-walk-with-me-jessica': {
    day: 'Mon',
    date: 'Aug 3',
    time: '6:10 PM',
    room: 'Main Floor',
    price: '$28',
  },
  'rhyze-ritmo-melissa': {
    day: 'Tue',
    date: 'Aug 4',
    time: '7:00 PM',
    room: 'Main Floor',
    price: '$28',
  },
  'rhyze-up-vanessa': {
    day: 'Wed',
    date: 'Aug 5',
    time: '6:30 PM',
    room: 'Main Floor',
    price: '$28',
  },
  'core-360-carla-rio': {
    day: 'Thu',
    date: 'Aug 6',
    time: '5:30 PM',
    room: 'Studio B',
    price: '$28',
  },
  'hypnotic-heels-jessica': {
    day: 'Fri',
    date: 'Aug 7',
    time: '8:00 PM',
    room: 'Main Floor',
    price: '$30',
  },
};

function stripInstructorFromTitle(title: string) {
  return title
    .replace(/\s+w\/\s+.+$/i, '')
    .replace(/\s+with\s+[^"]+$/i, '')
    .trim();
}

function findInstructor(cls: RhyzeClass) {
  const className = cls.name.toLowerCase();

  return instructors.find((person) => {
    const firstName = person.firstName.toLowerCase();
    const lastName = person.lastName.toLowerCase();

    return (
      className.includes(firstName) ||
      (lastName.length > 0 && className.includes(lastName))
    );
  });
}

export function ClassBookingDetail({ cls }: { cls: RhyzeClass }) {
  const instructor = findInstructor(cls);
  const instructorName = instructor
    ? [instructor.firstName, instructor.lastName].filter(Boolean).join(' ')
    : '';
  const bookingTitle = stripInstructorFromTitle(cls.name);
  const schedule = scheduleHighlights[cls.slug];

  return (
    <main className="mx-auto max-w-6xl px-6 py-20">
      <Link
        href="/classes"
        className="focus-ring mb-10 inline-flex items-center gap-2 text-xs uppercase tracking-widest text-rhyze-cream/60 hover:text-rhyze-coral"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Back to Classes
      </Link>

      <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
            Class Details
          </p>
          <h1 className="font-display text-6xl leading-none tracking-wider md:text-8xl">
            {bookingTitle.toUpperCase()}
          </h1>
          <p className="mt-4 text-xl italic text-rhyze-gold">{cls.tagline}</p>

          <div className="mt-6 flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full border border-white/10 bg-rhyze-charcoal px-4 py-2 text-xs font-bold uppercase tracking-widest text-rhyze-cream/70">
              {categoryLabel[cls.category]}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-rhyze-charcoal px-4 py-2 text-xs font-bold uppercase tracking-widest text-rhyze-cream/70">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {cls.duration} min
            </span>
          </div>

          <div className="mt-10 space-y-6">
            {instructor && (
              <div className="rounded-3xl border border-white/10 bg-rhyze-charcoal p-6">
                <div className="grid gap-5 sm:grid-cols-[260px_1fr] sm:items-center">
                  <div className="relative h-72 overflow-hidden rounded-2xl border border-rhyze-gold/35 bg-rhyze-black">
                    <Image
                      src={instructor.photo}
                      alt={`${instructorName} instructor photo`}
                      fill
                      sizes="(min-width: 640px) 260px, calc(100vw - 72px)"
                      className="object-cover object-top"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.3em] text-rhyze-gold">
                      Instructor
                    </p>
                    <h2 className="mt-2 font-display text-5xl tracking-wider">
                      {instructorName}
                    </h2>
                    <p className="mt-2 text-sm font-semibold uppercase tracking-widest text-rhyze-cream/60">
                      {instructor.role}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-3xl border border-white/10 bg-rhyze-charcoal p-6">
              <h2 className="font-display text-4xl tracking-wider">
                Class Details
              </h2>
              <p className="mt-3 text-base leading-relaxed text-rhyze-cream/75">
                {cls.description}
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-rhyze-charcoal p-6">
                <h2 className="mb-4 font-display text-3xl tracking-wider">
                  What To Expect
                </h2>
                <ul className="space-y-3 text-sm leading-relaxed text-rhyze-cream/75">
                  {cls.whatToExpect.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rhyze-gold" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-3xl border border-white/10 bg-rhyze-charcoal p-6">
                <h2 className="mb-4 font-display text-3xl tracking-wider">
                  What To Bring
                </h2>
                <ul className="space-y-3 text-sm leading-relaxed text-rhyze-cream/75">
                  {cls.whatToBring.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rhyze-coral" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="rounded-3xl border border-rhyze-gold/30 bg-rhyze-gold/10 p-6">
              <div className="mb-5 inline-flex rounded-2xl border border-rhyze-gold/40 bg-rhyze-black/30 p-4">
                <Calendar className="h-8 w-8 text-rhyze-gold" aria-hidden />
              </div>
              <h2 className="font-display text-4xl tracking-wider">Schedule</h2>
              {schedule ? (
                <div className="mt-4 grid gap-3 text-sm text-rhyze-cream/75 sm:grid-cols-2">
                  <p className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-rhyze-gold" aria-hidden />
                    {schedule.day}, {schedule.date} at {schedule.time}
                  </p>
                  <p className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-rhyze-gold" aria-hidden />
                    {schedule.room}
                  </p>
                  <p className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-rhyze-gold" aria-hidden />
                    {schedule.price}
                  </p>
                  <p className="text-rhyze-gold">
                    Live availability is managed through Somble
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-rhyze-cream/75">
                  Upcoming dates, instructor assignments, and availability are
                  managed live through Somble.
                </p>
              )}
            </div>
          </div>
        </div>

        <aside className="rounded-3xl border border-white/10 bg-rhyze-charcoal p-6 lg:mt-64">
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-gold">
            Choose How To Book
          </p>
          <div className="space-y-4">
            {tiers.slice(0, 3).map((plan) => (
              <div
                key={plan.id}
                className="rounded-2xl border border-white/10 bg-rhyze-black/50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-2xl tracking-wider">
                      {plan.name}
                    </h3>
                    <p className="text-sm text-rhyze-cream/60">
                      {plan.perClass ?? plan.cadence}
                    </p>
                  </div>
                  <span className="font-display text-3xl text-rhyze-gold">
                    {plan.price}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-rhyze-gold/30 bg-rhyze-gold/10 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck
                className="mt-1 h-5 w-5 text-rhyze-gold"
                aria-hidden
              />
              <div>
                <h3 className="font-semibold uppercase tracking-wide">
                  Secure booking
                </h3>
                <p className="mt-1 text-sm text-rhyze-cream/70">
                  Reservations, waivers, live availability, and checkout are
                  completed securely through Somble.
                </p>
              </div>
            </div>
          </div>

          <Button
            href={sombleScheduleUrl}
            size="lg"
            className="mt-6 w-full"
            target="_blank"
            rel="noreferrer"
          >
            Book on Somble <CheckCircle2 className="h-5 w-5" aria-hidden />
          </Button>

          <Link
            href="/join"
            className="focus-ring mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-rhyze-cream/70 hover:border-rhyze-coral hover:text-rhyze-coral"
          >
            View Memberships <ExternalLink className="h-4 w-4" aria-hidden />
          </Link>
        </aside>
      </section>
    </main>
  );
}
