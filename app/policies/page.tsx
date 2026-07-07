import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Studio Policies',
  description:
    'Waiver, cancellation, arrival, age, and health policies for Rhyze Fitness.',
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
    title: 'Cancellation Policy',
    subtitle: 'The “Rhyze” Time',
    body: null,
    list: [
      'Early cancel, at least 8 hours before class to keep your credit',
      'Late cancel / no show, lost credit (pack holders) or $15 fee (unlimited)',
    ],
  },
  {
    id: 'arrival',
    title: 'Arrival & Late Entry',
    body: null,
    list: [
      'First-timers: please arrive 15 minutes early to get oriented',
      'No entry once the music starts (approximately 5 minutes after the scheduled start time)',
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
          Policies last updated April 2026. Questions?{' '}
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
