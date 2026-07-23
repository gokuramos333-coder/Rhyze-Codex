import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Studio Policies',
  description:
    'Waiver, cancellation, booking, age, and health policies for Rhyze Fitness.',
};

type PolicySection = {
  id: string;
  title: string;
  subtitle?: string;
  body?: string | null;
  list?: string[];
};

const sections: PolicySection[] = [
  {
    id: 'waiver',
    title: 'Waiver',
    subtitle: 'Assumption of Risk · Release of Liability · Media Release',
    body: 'I understand that participating in dance, yoga, Pilates, and strength training at Rhyze Fitness involves physical exertion and carries an inherent risk of injury. I voluntarily assume all risks associated with my participation. I hereby release Rhyze Fitness, its owners (Vanessa Ramos & Melissa Llanos), and its instructors from any and all liability for personal injury, property damage, or loss sustained while on the premises or participating in any studio activities. By entering the studio, I acknowledge that Rhyze Fitness may take photos or videos for social media / marketing. (If you prefer to opt out, please let our team know.)',
  },
  {
    id: 'cancellation',
    title: 'Cancellation for Classes',
    subtitle: 'Transfer Requests · Late Cancels · No-Shows',
    body: null,
    list: [
      'If you cannot attend a scheduled class, contact us through the website messaging form to request a transfer to another class within 2 weeks of the original class date.',
      'Cancellations made more than 6 hours before class start time are eligible for transfer without a fee.',
      'Cancellations made within 6 hours of class start time are eligible for transfer with a $10 transfer fee.',
      'Cancellations made 2 hours or less before class start time are not eligible for transfer and will be considered a late cancel or no-show.',
      'Our official cancellation window is 6 hours before class start time. Transfer requests received after this window may not be honored.',
      'Transfer fees are waived for VIP Access membership holders only.',
    ],
  },
  {
    id: 'refunds',
    title: 'Refunds',
    body: null,
    list: ['All classes and events are non-refundable, no exceptions.'],
  },
  {
    id: 'late-booking',
    title: 'Late Booking',
    body: null,
    list: [
      'Online booking closes 30 minutes before class start time.',
      'Drop-ins are permitted if space is available.',
      'Please check the homepage for class availability and status before heading to the studio.',
      'Special events, collaboration classes, and workshops are non-transferable.',
      'Cancellation notice must be received at least 6 hours before class in order to request a transfer.',
    ],
  },
  {
    id: 'private-parties',
    title: 'Private Group Parties',
    body: null,
    list: [
      'A $100 deposit is required when scheduling a private group session.',
      'The deposit goes toward the final balance due the day of the session, before the session starts.',
      'Sessions cancelled less than 72 hours before the appointment time will incur a cancellation fee equal to the deposit.',
      'If clients cancel at least 72 hours before the event, the deposit may be used as a credit.',
    ],
  },
  {
    id: 'age',
    title: 'Age Requirements',
    body: null,
    list: [
      'All Rhyzers must be 12 years or older',
      'Anyone under 18 requires a parent or guardian to sign the waiver in person',
    ],
  },
  {
    id: 'health',
    title: 'Health & Safety',
    body: null,
    list: [
      'Please stay home if you’re feeling unwell',
      'Inform your instructor of any injuries or pregnancy before class so modifications can be offered',
    ],
  },
];

export default function PoliciesPage() {
  return (
    <main className="py-20">
      <section className="mx-auto max-w-4xl px-6">
        <p className="mb-4 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
          Fine Print
        </p>
        <h1 className="font-display text-6xl tracking-wider md:text-8xl">
          STUDIO POLICIES
        </h1>
        <p className="mt-6 text-lg text-rhyze-cream/75">
          The guidelines that keep the floor safe, fair, and fun for everyone.
        </p>

        <nav
          aria-label="Policy sections"
          className="mt-10 flex flex-wrap gap-2"
        >
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="focus-ring rounded-full border border-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-rhyze-cream/80 hover:border-rhyze-coral hover:text-rhyze-coral"
            >
              {s.title}
            </a>
          ))}
        </nav>
      </section>

      <section className="mx-auto mt-14 max-w-4xl space-y-10 px-6">
        {sections.map((s) => (
          <article
            key={s.id}
            id={s.id}
            className="scroll-mt-28 rounded-3xl border border-white/10 bg-rhyze-charcoal p-6 md:p-10"
          >
            <h2 className="font-display text-3xl tracking-wider md:text-4xl">
              {s.title.toUpperCase()}
            </h2>
            {s.subtitle && (
              <p className="mt-2 text-sm uppercase tracking-widest text-rhyze-gold">
                {s.subtitle}
              </p>
            )}
            {s.body && (
              <p className="mt-5 text-base leading-relaxed text-rhyze-cream/80">
                {s.body}
              </p>
            )}
            {s.list && (
              <ul className="mt-5 space-y-3 text-rhyze-cream/80">
                {s.list.map((li) => (
                  <li key={li} className="flex items-start gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rhyze-coral" />
                    <span>{li}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </section>

      <section className="mx-auto mt-16 max-w-4xl px-6 text-center text-sm text-rhyze-cream/60">
        <p>
          Policies last updated July 2026. Questions?{' '}
          <a
            href="/contact"
            className="text-rhyze-coral hover:underline"
          >
            Get in touch
          </a>
          .
        </p>
      </section>
    </main>
  );
}
