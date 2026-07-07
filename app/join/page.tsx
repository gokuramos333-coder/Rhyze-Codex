import type { Metadata } from 'next';
import { Sparkles, Calendar, Flame } from 'lucide-react';
import { JoinForm } from '@/components/sections/JoinForm';
import { Accordion, type AccordionItem } from '@/components/ui/Accordion';
import { trial } from '@/lib/pricing';

export const metadata: Metadata = {
  title: 'Start Your $7 Trial',
  description:
    'Start your $7 seven-day unlimited trial at Rhyze Fitness, new members get unlimited classes for one full week.',
};

const steps = [
  {
    Icon: Sparkles,
    title: 'Sign Up',
    body: 'Drop your info below. Takes about a minute.',
  },
  {
    Icon: Calendar,
    title: 'Book Classes',
    body: 'We’ll reach out with your trial credentials and our opening schedule.',
  },
  {
    Icon: Flame,
    title: 'Rhyze Up',
    body: 'Show up 15 min early for your first class. We’ll handle the rest.',
  },
];

const firstDay = [
  'Arrive 15 minutes early to meet your instructor',
  'Wear clothes you can move and sweat in',
  'Bring a water bottle and a hand towel',
  'Grip socks recommended for yoga or Pilates',
  'Leave your shoes at the entry, we’ll show you where',
  'Tell us about any injuries before class starts',
];

const faq: AccordionItem[] = [
  {
    q: 'Is there parking at the studio?',
    a: 'Yes, free parking is available on-site at The Shoppes at Lafayette. Head toward the rear of the complex and look for the Rhyze signage.',
  },
  {
    q: 'What should I wear?',
    a: 'Anything you can move in. For dance and HIIT classes, sneakers are a must. For yoga and Pilates, you can go barefoot or bring grip socks.',
  },
  {
    q: 'How early should I arrive for my first class?',
    a: 'Please arrive at least 15 minutes before class. We need time to show you the studio, answer questions, and make sure you feel at home.',
  },
  {
    q: 'What if I have an injury or I’m pregnant?',
    a: 'Flag it at the door and with your instructor. Every Rhyze class has modifications built in for different bodies and stages.',
  },
  {
    q: 'Do you have showers or changing rooms?',
    a: 'Yes, we’ve got changing areas with cubbies, mirrors, and our signature warm lighting. Shower details coming with opening week.',
  },
  {
    q: 'Can I freeze or cancel my membership?',
    a: 'Always. Memberships can be paused or cancelled from your member portal once it launches. No contracts, no pressure.',
  },
  {
    q: 'What’s the age requirement?',
    a: 'All Rhyzers must be 12 or older. Anyone under 18 needs a parent or guardian to sign the waiver in person.',
  },
];

export default function JoinPage() {
  return (
    <main className="py-20">
      <section className="mx-auto max-w-5xl px-6 text-center">
        <p className="mb-4 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
          New Rhyzer Special
        </p>
        <h1 className="font-display text-6xl leading-none tracking-wider md:text-[10rem]">
          START YOUR <br />
          <span className="rhyze-gradient-text">$7 RHYZE WEEK</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-rhyze-cream/75">
          Seven days of unlimited classes for seven dollars. No contracts. No
          commitments. Just the floor, a playlist, and your new favorite
          community.
        </p>
      </section>

      <section className="mx-auto mt-16 max-w-6xl px-6">
        <div className="grid gap-4 md:grid-cols-3">
          {steps.map((s, idx) => (
            <div
              key={s.title}
              className="rounded-2xl border border-white/10 bg-rhyze-charcoal p-6"
            >
              <div className="mb-4 flex items-center gap-3">
                <span className="font-display text-4xl tracking-wider text-rhyze-gold">
                  0{idx + 1}
                </span>
                <div className="inline-flex rounded-xl border border-white/10 bg-rhyze-black/50 p-2 text-rhyze-coral">
                  <s.Icon className="h-5 w-5" aria-hidden />
                </div>
              </div>
              <h3 className="font-display text-2xl tracking-wider">
                {s.title.toUpperCase()}
              </h3>
              <p className="mt-2 text-sm text-rhyze-cream/70">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-16 max-w-5xl px-6">
        <div className="rounded-3xl border border-rhyze-coral/30 bg-rhyze-charcoal p-6 md:p-10">
          <div className="mb-8 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
                Claim the Trial
              </p>
              <h2 className="font-display text-4xl tracking-wider md:text-5xl">
                {trial.price} · {trial.duration}
              </h2>
            </div>
            <p className="max-w-sm text-sm text-rhyze-cream/60">
              We&apos;ll email you with your trial credentials and
              opening-week schedule.
            </p>
          </div>
          <JoinForm />
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-6xl px-6">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
              What to Expect
            </p>
            <h2 className="mb-6 font-display text-4xl tracking-wider md:text-5xl">
              YOUR FIRST DAY
            </h2>
            <ul className="space-y-3 text-sm">
              {firstDay.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 rounded-xl border border-white/5 bg-rhyze-charcoal/60 p-4"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rhyze-gold" />
                  <span className="text-rhyze-cream/80">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
              FAQ
            </p>
            <h2 className="mb-6 font-display text-4xl tracking-wider md:text-5xl">
              WE GOT YOU
            </h2>
            <Accordion items={faq} />
          </div>
        </div>
      </section>
    </main>
  );
}
