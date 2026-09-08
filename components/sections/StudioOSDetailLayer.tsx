'use client';

import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type DetailRow = {
  label: string;
  value: string;
  meta?: string;
};

type DetailSection = {
  title: string;
  rows: DetailRow[];
};

type DetailRecord = {
  eyebrow: string;
  title: string;
  summary: string;
  total?: string;
  sections: DetailSection[];
};

const detailCatalog: Record<string, DetailRecord> = {
  'today-income': {
    eyebrow: 'Revenue source',
    title: "Today's income breakdown",
    summary:
      'All revenue posted today from bookings, package sales, and studio transactions.',
    total: '$1,842',
    sections: [
      {
        title: 'By source',
        rows: [
          {
            label: 'Rhyze Up with Vanessa',
            value: '$616',
            meta: '22 bookings x $25',
          },
          {
            label: 'Pilates Pulse with Adrianna',
            value: '$312',
            meta: '12 bookings x $26',
          },
          {
            label: 'Single Class Drop-In',
            value: '$476',
            meta: '17 checkout clicks',
          },
          {
            label: 'Membership upgrades',
            value: '$368',
            meta: '2 Ritual upgrades',
          },
          {
            label: 'Merchandise add-ons',
            value: '$70',
            meta: 'Tanks and grip socks',
          },
        ],
      },
      {
        title: 'Transaction log',
        rows: [
          {
            label: 'Date',
            value: 'Aug 3, 2026',
            meta: '10:04 AM - Pilates Pulse booked',
          },
          {
            label: 'Date',
            value: 'Aug 3, 2026',
            meta: '11:18 AM - Drop-in checkout',
          },
          {
            label: 'Date',
            value: 'Aug 3, 2026',
            meta: '6:42 PM - Rhyze Up member credit',
          },
        ],
      },
    ],
  },
  'monthly-recurring': {
    eyebrow: 'Membership revenue',
    title: 'Monthly recurring breakdown',
    summary:
      'Active monthly packages expected to renew this cycle, before failed-payment review.',
    total: '$14,916',
    sections: [
      {
        title: 'Package mix',
        rows: [
          { label: 'Ritual', value: '$8,064', meta: '48 members x $168' },
          { label: 'Elevate', value: '$3,772', meta: '41 members x $92' },
          {
            label: 'VIP Access Pass',
            value: '$2,985',
            meta: '15 members x $199',
          },
          {
            label: 'Intro Offer conversion',
            value: '$95',
            meta: 'Trial upgrades pending',
          },
        ],
      },
      {
        title: 'Renewal dates',
        rows: [
          { label: 'Aug 5', value: '$3,220', meta: '22 memberships' },
          { label: 'Aug 12', value: '$4,908', meta: '34 memberships' },
          { label: 'Aug 19', value: '$3,764', meta: '29 memberships' },
          { label: 'Aug 26', value: '$3,024', meta: '25 memberships' },
        ],
      },
    ],
  },
  'bookings-this-week': {
    eyebrow: 'Class demand',
    title: 'Bookings this week',
    summary:
      'Bookings created from the weekly calendar, class pages, and member portal.',
    total: '184',
    sections: [
      {
        title: 'Top classes',
        rows: [
          {
            label: 'Rhyze Up with Vanessa',
            value: '22/25',
            meta: '4 waitlist',
          },
          {
            label: 'Hypnotic Heels with Nicole',
            value: '18/18',
            meta: '6 waitlist',
          },
          {
            label: 'TCJ Hip-Hop Happy Hour with Tricia',
            value: '17/20',
            meta: '3 open',
          },
          {
            label: 'Pilates Pulse with Adrianna',
            value: '12/16',
            meta: '4 open',
          },
        ],
      },
    ],
  },
  'waivers-needed': {
    eyebrow: 'Compliance',
    title: 'Waivers needed',
    summary:
      'Customers blocked from first booking or check-in until waiver status is complete.',
    total: '7',
    sections: [
      {
        title: 'Owner queue',
        rows: [
          {
            label: 'Guardian signatures',
            value: '3',
            meta: 'Under-18 accounts',
          },
          { label: 'General studio waiver', value: '2', meta: 'New customers' },
          { label: 'Membership terms', value: '2', meta: 'Package upgrades' },
        ],
      },
    ],
  },
  'attendance-rate': {
    eyebrow: 'Attendance',
    title: 'Attendance rate detail',
    summary:
      'Attendance compares checked-in members against reserved spots after late cancels.',
    total: '86%',
    sections: [
      {
        title: 'By category',
        rows: [
          {
            label: 'Dance',
            value: '91%',
            meta: 'Highest check-in consistency',
          },
          { label: 'Yoga & Pilates', value: '83%', meta: 'Morning classes' },
          {
            label: 'Strength & HIIT',
            value: '79%',
            meta: 'Weather impact this week',
          },
        ],
      },
    ],
  },
  'active-members': {
    eyebrow: 'Memberships',
    title: 'Active members',
    summary:
      'Members with an active trial, credit pack, or monthly package and no failed-payment hold.',
    total: '142',
    sections: [
      {
        title: 'Member status',
        rows: [
          {
            label: 'Monthly members',
            value: '104',
            meta: 'Ritual, Elevate, VIP',
          },
          { label: 'Intro trial', value: '23', meta: '7-day trial window' },
          { label: 'Class pack', value: '15', meta: 'Drop-in bundles' },
        ],
      },
    ],
  },
  'income-growth': {
    eyebrow: 'Projection',
    title: 'Income + growth',
    summary:
      'Projected month is based on current bookings, expected renewals, and package conversion.',
    total: '$24,921',
    sections: [
      {
        title: 'Projection drivers',
        rows: [
          {
            label: 'Membership renewals',
            value: '$14,916',
            meta: 'Known recurring',
          },
          {
            label: 'Drop-ins and packs',
            value: '$6,440',
            meta: 'Based on weekly average',
          },
          {
            label: 'Workshops',
            value: '$2,280',
            meta: 'Heels and specialty classes',
          },
          { label: 'Merchandise', value: '$1,285', meta: 'Studio add-ons' },
        ],
      },
    ],
  },
  'owner-queue': {
    eyebrow: 'Needs attention',
    title: 'Owner queue',
    summary:
      'Items that require staff follow-up before the next class day closes.',
    sections: [
      {
        title: 'Queue items',
        rows: [
          {
            label: 'Missing waivers',
            value: '7 customers',
            meta: 'Send reminder',
          },
          {
            label: 'Waitlist openings',
            value: '4 spots',
            meta: 'Notify next in line',
          },
          { label: 'Failed payments', value: '3 cards', meta: 'Retry or call' },
          {
            label: 'Inactive members',
            value: '12 members',
            meta: 'Win-back sequence',
          },
        ],
      },
    ],
  },
  calendar: {
    eyebrow: 'Schedule',
    title: 'Calendar detail',
    summary:
      'This view connects class capacity, waitlist demand, instructor, room, and reminders.',
    sections: [
      {
        title: 'Next actions',
        rows: [
          {
            label: 'Rhyze Up with Vanessa',
            value: '22/25',
            meta: 'Confirm room setup',
          },
          {
            label: 'Hypnotic Heels with Nicole',
            value: 'Full',
            meta: 'Release waitlist spot',
          },
          {
            label: 'Pilates Pulse with Adrianna',
            value: '12/16',
            meta: 'Promote on Instagram',
          },
        ],
      },
    ],
  },
  booking: {
    eyebrow: 'Customer flow',
    title: 'Booking flow detail',
    summary:
      'Every booking checks waiver status, available credits, payment state, confirmation, and reminders.',
    sections: [
      {
        title: 'Flow steps',
        rows: [
          {
            label: 'Select class',
            value: 'Calendar or class page',
            meta: 'Tracks source click',
          },
          {
            label: 'Select access',
            value: 'Credit, package, or drop-in',
            meta: 'Checks balance',
          },
          {
            label: 'Confirm',
            value: 'Email + reminder queued',
            meta: 'Adds attendance record',
          },
        ],
      },
    ],
  },
  'class-template': {
    eyebrow: 'Admin tools',
    title: 'Class template detail',
    summary:
      'Class templates store photo, class name, instructor, description, price, capacity, room, and booking action.',
    sections: [
      {
        title: 'Template data',
        rows: [
          {
            label: 'Photo',
            value: 'Instructor image',
            meta: 'Used on classes and schedule',
          },
          { label: 'Price', value: '$26 - $30', meta: 'Standard or specialty' },
          { label: 'Capacity', value: '16 - 24', meta: 'Room-based limit' },
          {
            label: 'Customer action',
            value: 'Book / Join waitlist',
            meta: 'Based on fill',
          },
        ],
      },
    ],
  },
  'add-class': {
    eyebrow: 'Class manager',
    title: 'Add class action',
    summary:
      'Adding a class would create a reusable template and publish matching customer-facing booking data.',
    sections: [
      {
        title: 'Required fields',
        rows: [
          { label: 'Class name', value: 'Required', meta: 'Shown on schedule' },
          {
            label: 'Instructor photo',
            value: 'Required',
            meta: 'Used on cards',
          },
          {
            label: 'Price and capacity',
            value: 'Required',
            meta: 'Controls checkout and waitlist',
          },
        ],
      },
    ],
  },
  memberships: {
    eyebrow: 'Packages',
    title: 'Membership package detail',
    summary:
      'Package clicks show pricing, included credits, benefits, waiver requirements, and portal behavior.',
    sections: [
      {
        title: 'Editable package fields',
        rows: [
          {
            label: 'Intro Offer 7-Days',
            value: '$7',
            meta: 'Activates with first booked class; expires after 7 days',
          },
          {
            label: 'Elevate',
            value: '$92',
            meta: '4 classes / month + unique 10% merch promo code',
          },
          {
            label: 'Ritual',
            value: '$168',
            meta: '8 classes / month + unique 15% merch promo code',
          },
          {
            label: 'VIP Access Pass',
            value: '$199',
            meta: 'Unlimited founding member + unique 20% merch promo code',
          },
        ],
      },
    ],
  },
  'membership-rules': {
    eyebrow: 'Rules engine',
    title: 'Membership rules',
    summary:
      'Rules control credits, waivers, failed payments, renewal reminders, upgrades, and specialty access.',
    sections: [
      {
        title: 'Current rules',
        rows: [
          {
            label: 'Credits reset',
            value: 'Monthly',
            meta: 'By package rules',
          },
          {
            label: 'Waiver required',
            value: 'Before first booking',
            meta: 'Blocks checkout',
          },
          {
            label: 'Renewal reminder',
            value: '5 days before billing',
            meta: 'Automated email',
          },
        ],
      },
    ],
  },
  'event-template': {
    eyebrow: 'Events',
    title: 'Event template detail',
    summary:
      'Event templates store date, photo, instructor, price, capacity, VIP eligibility, waitlist state, and the customer booking action.',
    sections: [
      {
        title: 'Upcoming events',
        rows: [
          {
            label: 'TCJ Hip-Hop Happy Hour with Tricia',
            value: 'Aug 3 - $30',
            meta: '17/20 booked - VIP eligible monthly choice',
          },
          {
            label: 'Hypnotic Heels with Nicole',
            value: 'Aug 10 - $30',
            meta: '18/18 booked - 6 waitlist',
          },
          {
            label: 'Seat Seduction With Vanessa',
            value: 'Aug 21 - $30',
            meta: '12/18 booked - specialty pricing',
          },
        ],
      },
    ],
  },
  'add-event': {
    eyebrow: 'Event manager',
    title: 'Add event action',
    summary:
      'Adding an event would publish the customer event card, event detail page, booking flow, capacity, and admin reporting.',
    sections: [
      {
        title: 'Required fields',
        rows: [
          { label: 'Event name', value: 'Required', meta: 'Shown on cards' },
          { label: 'Date and time', value: 'Required', meta: 'Calendar order' },
          { label: 'Photo', value: 'Required', meta: 'Same-size event card' },
          {
            label: 'VIP eligibility',
            value: 'Selectable',
            meta: 'Controls monthly included event access',
          },
        ],
      },
    ],
  },
  sales: {
    eyebrow: 'Revenue',
    title: 'Sales queue detail',
    summary:
      'Sales clicks show daily closeout, failed payments, membership reconciliation, and export state.',
    sections: [
      {
        title: 'Sales operations',
        rows: [
          {
            label: 'Daily close',
            value: '9 PM',
            meta: 'Owner report generated',
          },
          { label: 'Failed cards', value: '3', meta: 'Queued for follow-up' },
          {
            label: 'Exports',
            value: 'Memberships and drop-ins',
            meta: 'Separated for accounting',
          },
        ],
      },
    ],
  },
  'customer-activity': {
    eyebrow: 'Customers',
    title: 'New customers: 27 this month',
    summary:
      'Each new customer record includes start date, first class, membership status, and activity level.',
    total: '27',
    sections: [
      {
        title: 'Recent members',
        rows: [
          {
            label: 'Ava Martinez',
            value: 'Start date: Aug 3, 2026',
            meta: 'Intro Offer - Rhyze Up booked',
          },
          {
            label: 'Priya Santos',
            value: 'Start date: Aug 2, 2026',
            meta: 'Ritual - waiver signed',
          },
          {
            label: 'Jordan Lee',
            value: 'Start date: Aug 2, 2026',
            meta: 'Drop-in - Pilates Pulse',
          },
          {
            label: 'Camila Reyes',
            value: 'Start date: Aug 3, 2026',
            meta: 'Elevate - 2 classes booked',
          },
          {
            label: 'Nina Patel',
            value: 'Start date: Aug 3, 2026',
            meta: 'VIP Access Pass - active',
          },
        ],
      },
      {
        title: 'Activity rollup',
        rows: [
          {
            label: 'Attended first class',
            value: '18',
            meta: '67% activation',
          },
          {
            label: 'Booked but not attended yet',
            value: '7',
            meta: 'Reminder pending',
          },
          { label: 'Needs waiver', value: '2', meta: 'Blocked from check-in' },
        ],
      },
    ],
  },
  'new-customers': {
    eyebrow: 'Customers',
    title: 'New customers: 27 this month',
    summary:
      'The new-customer list shows member name, start date, first class, plan status, and whether they have attended yet.',
    total: '27',
    sections: [
      {
        title: 'Member starts',
        rows: [
          {
            label: 'Ava Martinez',
            value: 'Start date: Aug 3, 2026',
            meta: 'Intro Offer - Rhyze Up booked',
          },
          {
            label: 'Priya Santos',
            value: 'Start date: Aug 2, 2026',
            meta: 'Ritual - waiver signed',
          },
          {
            label: 'Jordan Lee',
            value: 'Start date: Aug 2, 2026',
            meta: 'Drop-in - Pilates Pulse',
          },
          {
            label: 'Camila Reyes',
            value: 'Start date: Aug 3, 2026',
            meta: 'Elevate - 2 classes booked',
          },
          {
            label: 'Nina Patel',
            value: 'Start date: Aug 3, 2026',
            meta: 'VIP Access Pass - active',
          },
        ],
      },
    ],
  },
  'all-signups': {
    eyebrow: 'Contacts',
    title: 'All signups',
    summary:
      'This list combines every contact who signs up, buys a class, buys a membership, books an event, or only joins the email update list.',
    total: '5 shown',
    sections: [
      {
        title: 'Lead sources',
        rows: [
          {
            label: 'Membership purchases',
            value: '2',
            meta: 'Ritual and VIP Access Pass',
          },
          {
            label: 'Class or event buyers',
            value: '2',
            meta: 'Drop-in and intro offer records',
          },
          {
            label: 'Newsletter-only leads',
            value: '1',
            meta: 'No class purchase yet',
          },
        ],
      },
    ],
  },
  'signup-record': {
    eyebrow: 'Customer record',
    title: 'Signup detail',
    summary:
      'A signup record stores name, email, phone, home address, source, purchase, start date, waiver state, and attendance activity.',
    sections: [
      {
        title: 'Example records',
        rows: [
          {
            label: 'Ava Martinez',
            value: 'Intro Offer 7-Days',
            meta: 'ava.martinez@example.com - (973) 555-0112 - Aug 3, 2026',
          },
          {
            label: 'Priya Santos',
            value: 'Ritual membership',
            meta: 'priya.santos@example.com - waiver signed',
          },
          {
            label: 'Camila Reyes',
            value: 'Email updates only',
            meta: 'Newsletter lead with no purchase yet',
          },
        ],
      },
    ],
  },
  'email-blast': {
    eyebrow: 'Messaging',
    title: 'Email blast',
    summary:
      'Email blasts can target all signups or filtered groups like newsletter leads, active members, event buyers, or inactive customers.',
    sections: [
      {
        title: 'Send options',
        rows: [
          {
            label: 'All contacts',
            value: '5 recent records',
            meta: 'Members, buyers, and newsletter leads',
          },
          {
            label: 'Inactive customers',
            value: '12 member segment',
            meta: 'Attendance-based filter',
          },
          {
            label: 'Opening announcement',
            value: 'August 3, 2026',
            meta: 'Class launch reminder',
          },
        ],
      },
    ],
  },
  waivers: {
    eyebrow: 'Waivers',
    title: 'Waiver queue detail',
    summary:
      'Waiver clicks show signed, pending, guardian-required, and reminder status.',
    sections: [
      {
        title: 'Waiver status',
        rows: [
          {
            label: 'General studio waiver',
            value: '2 pending',
            meta: 'New customer queue',
          },
          {
            label: 'Membership terms',
            value: '2 pending',
            meta: 'Upgrade queue',
          },
          {
            label: 'Guardian signature',
            value: '3 pending',
            meta: 'Under-18 accounts',
          },
        ],
      },
    ],
  },
  automations: {
    eyebrow: 'Messages',
    title: 'Automation detail',
    summary:
      'Automations send after signup, booking, waiver holds, reminders, waitlists, and inactive-member triggers.',
    sections: [
      {
        title: 'Message triggers',
        rows: [
          { label: 'Welcome email', value: 'After signup', meta: 'Immediate' },
          {
            label: 'Booking confirmation',
            value: 'After reserve',
            meta: 'Email + SMS-ready',
          },
          {
            label: 'Class reminder',
            value: '24 hours before',
            meta: 'Avoid no-shows',
          },
          {
            label: 'Win-back',
            value: '21 inactive days',
            meta: 'Owner-approved sequence',
          },
        ],
      },
    ],
  },
  reports: {
    eyebrow: 'Reports',
    title: 'Reports detail',
    summary:
      'Reports explain revenue, attendance, fill rate, retention, and instructor performance.',
    sections: [
      {
        title: 'Available reports',
        rows: [
          {
            label: 'Revenue by package',
            value: 'Monthly',
            meta: 'Membership and drop-in split',
          },
          {
            label: 'Attendance by instructor',
            value: 'Weekly',
            meta: 'Booked vs attended',
          },
          {
            label: 'Retention and churn',
            value: 'Monthly',
            meta: 'Inactive customer tracking',
          },
        ],
      },
    ],
  },
  staff: {
    eyebrow: 'Staff',
    title: 'Staff detail',
    summary:
      'Staff records connect instructor classes, booking volume, attendance, and customer feedback.',
    sections: [
      {
        title: 'Instructor roster',
        rows: [
          { label: 'Vanessa Ramos', value: 'Rhyze Up', meta: '22 booked' },
          { label: 'Melissa Llanos', value: 'Rhyze Ritmo', meta: '18 booked' },
          { label: 'Adrianna', value: 'Pilates Pulse', meta: '12 booked' },
          {
            label: 'Nicole',
            value: 'Hypnotic Heels',
            meta: '18 booked + 6 waitlist',
          },
        ],
      },
    ],
  },
  settings: {
    eyebrow: 'Settings',
    title: 'Settings detail',
    summary:
      'Settings control booking rules, cancellation windows, waivers, reminders, credits, and room capacity.',
    sections: [
      {
        title: 'Current settings',
        rows: [
          {
            label: 'Cancellation window',
            value: '6 hours',
            meta: 'Late-cancel rules',
          },
          {
            label: 'Reminder timing',
            value: '24 hours',
            meta: 'Class reminder automation',
          },
          {
            label: 'Credit reset day',
            value: 'Monthly renewal date',
            meta: 'By package',
          },
          {
            label: 'Capacity rules',
            value: 'Room-based',
            meta: 'Controls waitlist',
          },
        ],
      },
    ],
  },
};

export function StudioOSDetailLayer() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeDetail = activeId ? detailCatalog[activeId] : null;
  const detailIds = useMemo(() => new Set(Object.keys(detailCatalog)), []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const trigger = target.closest<HTMLElement>('[data-studio-detail]');
      const interactiveTarget = target.closest<HTMLElement>(
        'a, button, input, select, textarea',
      );
      const detailId = trigger?.dataset.studioDetail;
      if (!detailId || !detailIds.has(detailId)) return;
      if (interactiveTarget && interactiveTarget !== trigger) return;

      event.preventDefault();
      setActiveId(detailId);
    };

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [detailIds]);

  useEffect(() => {
    if (!activeDetail) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveId(null);
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [activeDetail]);

  if (!activeDetail) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={activeDetail.title}
    >
      <button
        type="button"
        aria-label="Close detail"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={() => setActiveId(null)}
      />
      <article className="relative z-10 max-h-[88vh] w-full max-w-4xl overflow-y-auto border border-rhyze-gold/20 bg-rhyze-charcoal p-5 shadow-2xl shadow-black md:p-7">
        <button
          type="button"
          aria-label="Close"
          onClick={() => setActiveId(null)}
          className="focus-ring absolute right-4 top-4 rounded-full p-2 text-rhyze-cream/60 hover:text-rhyze-cream"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>

        <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-orange">
          {activeDetail.eyebrow}
        </p>
        <div className="mt-3 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <h2 className="font-display text-5xl leading-none tracking-wider md:text-7xl">
              {activeDetail.title}
            </h2>
            <p className="mt-4 max-w-2xl text-sm font-bold leading-relaxed text-rhyze-cream/65">
              {activeDetail.summary}
            </p>
          </div>
          {activeDetail.total && (
            <div className="border border-rhyze-gold/30 bg-rhyze-gold/10 p-4 text-right">
              <p className="text-[10px] font-black uppercase tracking-widest text-rhyze-gold">
                Total
              </p>
              <strong className="mt-2 block font-display text-5xl tracking-wider">
                {activeDetail.total}
              </strong>
            </div>
          )}
        </div>

        <div className="mt-7 grid gap-5">
          {activeDetail.sections.map((section) => (
            <section
              key={section.title}
              className="border border-white/10 bg-rhyze-black/35 p-4"
            >
              <h3 className="font-display text-3xl tracking-wider">
                {section.title}
              </h3>
              <div className="mt-4 divide-y divide-white/10">
                {section.rows.map((row) => (
                  <div
                    key={`${row.label}-${row.value}-${row.meta ?? ''}`}
                    className="grid gap-2 py-3 md:grid-cols-[1fr_auto] md:items-center"
                  >
                    <div>
                      <p className="text-sm font-black text-rhyze-cream">
                        {row.label}
                      </p>
                      {row.meta && (
                        <p className="mt-1 text-xs font-bold text-rhyze-cream/45">
                          {row.meta}
                        </p>
                      )}
                    </div>
                    <p className="text-sm font-black text-rhyze-gold">
                      {row.value}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}
