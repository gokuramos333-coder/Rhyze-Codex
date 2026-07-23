import type { Metadata } from 'next';
import { Accordion, type AccordionItem } from '@/components/ui/Accordion';
import { Button } from '@/components/ui/Button';
import { PricingCards } from '@/components/sections/PricingCards';
import { sombleMembershipsUrl } from '@/lib/somble';

export const metadata: Metadata = {
  title: 'Join Now',
  description:
    'Choose your Rhyze Fitness membership, complete checkout through Somble, and get ready for your first day in studio.',
};

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
      <section className="mx-auto max-w-7xl px-6 text-center">
        <p className="mb-4 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
          Pricing
        </p>
        <h1 className="font-display text-6xl tracking-wider md:text-8xl">
          PICK YOUR <span className="rhyze-gradient-text">RHYTHM</span>
        </h1>
      </section>

      <section className="mx-auto mt-14 max-w-5xl px-6">
        <div className="overflow-hidden rounded-3xl bg-rhyze-gradient p-[2px]">
          <div className="relative flex flex-col items-center gap-6 overflow-hidden rounded-[calc(1.5rem-2px)] bg-rhyze-black p-8 text-center md:p-14">
            <div
              aria-hidden
              className="grain absolute inset-0 opacity-10 mix-blend-overlay"
            />
            <div className="relative">
              <h2 className="font-display text-5xl leading-none tracking-wider md:text-7xl">
                MEMBERSHIPS ARE OPEN
              </h2>
              <p className="mx-auto mt-4 max-w-md text-sm text-rhyze-cream/70 md:text-base">
                Plans, account creation, and checkout are handled through the
                official Rhyze Fitness Somble page.
              </p>
              <p className="mx-auto mt-3 max-w-md text-sm font-semibold text-rhyze-gold md:text-base">
                All memberships and the 7-day trial begin August 3, 2026, when
                Rhyze officially opens.
              </p>
              <Button
                href={sombleMembershipsUrl}
                size="lg"
                target="_blank"
                rel="noreferrer"
                className="mt-8"
              >
                View Memberships on Somble →
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-7xl px-6">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
              Memberships
            </p>
          </div>
          <p className="max-w-sm text-sm text-rhyze-cream/60">
            These options mirror the current Rhyze Fitness memberships listed
            on Somble.
          </p>
        </div>
        <PricingCards />
      </section>

      <section className="mx-auto mt-24 max-w-4xl px-6 text-center">
        <h3 className="font-display text-3xl tracking-wider md:text-5xl">
          QUESTIONS?
        </h3>
        <p className="mt-4 text-rhyze-cream/70">
          We&apos;re a small team, we&apos;d love to hear from you. Reach out
          for any questions, events, packages, or anything else not listed here.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button href="/contact" size="lg" variant="outline">
            Contact Us
          </Button>
          <Button href="/policies" size="lg" variant="ghost">
            Studio Policies
          </Button>
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
