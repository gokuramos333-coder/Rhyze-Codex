import type { Metadata } from 'next';
import {
  AGREEMENT_EFFECTIVE_LABEL,
  policySections,
} from '@/lib/policies';

export const metadata: Metadata = {
  title: 'Studio Policies',
  description:
    'Waiver, cancellation, refund, late booking, age, and health policies for Rhyze Fitness.',
};

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
          {policySections.map((s) => (
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
        {policySections.map((s) => (
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
          Policies last updated {AGREEMENT_EFFECTIVE_LABEL}. Questions?{' '}
          <a href="/contact" className="text-rhyze-coral hover:underline">
            Get in touch
          </a>
          .
        </p>
      </section>
    </main>
  );
}
