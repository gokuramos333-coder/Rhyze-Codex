export type PricingTier = {
  id: string;
  name: string;
  price: string;
  cadence: string;
  perClass?: string;
  blurb: string;
  bullets: string[];
  popular?: boolean;
  cta: { label: string; href: string };
};

export const openingBillingNote =
  'Monthly memberships begin on August 3, 2026, when Rhyze Fitness officially opens. The $7 trial activates when the client books their first class and automatically expires 7 calendar days after that first booked class.';

export const trial = {
  price: '$7',
  duration: '7-Day Unlimited',
  subtitle:
    'First-timers only · Starts with your first booked class · Expires after 7 days',
  cta: { label: 'Start Your $7 Trial', href: '/sign-up?plan=trial' },
};

export const tiers: PricingTier[] = [
  {
    id: 'intro-offer',
    name: 'Intro Offer 7-Days',
    price: '$7',
    cadence: '/ 7 credits',
    perClass: 'Class Pack',
    popular: false,
    blurb:
      'Includes 7 consecutive days of unlimited access to all standard classes, starting when the client books their first class. Excludes premium specialty classes and workshops. Valid for first-time clients only.',
    bullets: [
      'Activates when first class is booked',
      'Expires automatically 7 days after first booked class',
      'Unlimited standard classes during the trial window',
      'Specialty events and workshops excluded',
      'Valid for first-time clients only',
    ],
    cta: { label: 'Choose Plan', href: '/sign-up?plan=intro-offer' },
  },
  {
    id: 'full-rhythm',
    name: 'Ritual',
    price: '$168',
    cadence: '/ month',
    perClass: '8 Classes / Month Membership',
    popular: true,
    blurb:
      'Includes 8 standard classes per billing cycle at $21 per class. Auto-renews monthly, excludes premium specialty events and workshops, includes a unique 15% merch promo code, and credits do not roll over.',
    bullets: [
      'Billing begins August 3, 2026 for opening month',
      '8 standard class credits per month',
      'Specialty events and workshops excluded',
      'Unique member promo code for 15% off Rhyze merchandise',
      'Credits do not roll over',
    ],
    cta: { label: 'Choose Plan', href: '/sign-up?plan=full-rhythm' },
  },
  {
    id: 'elevate',
    name: 'Elevate',
    price: '$92',
    cadence: '/ month',
    perClass: '4 Classes / Month Membership',
    popular: false,
    blurb:
      'Includes 4 standard classes per billing cycle. Includes a unique 10% merch promo code. Credits do not roll over.',
    bullets: [
      'Billing begins August 3, 2026 for opening month',
      '4 standard class credits per month',
      'Specialty events and workshops excluded',
      'Unique member promo code for 10% off Rhyze merchandise',
      'Credits do not roll over',
    ],
    cta: { label: 'Choose Plan', href: '/sign-up?plan=elevate' },
  },
  {
    id: 'vip-access-pass',
    name: 'The VIP Access Pass',
    price: '$199',
    cadence: '/ month',
    perClass: 'AUGUST ONLY',
    popular: false,
    blurb:
      'Founding Members lock in $199/month for life. Unlimited full access to all standard classes, 1 eligible specialty class per month, and a unique 20% merch promo code.',
    bullets: [
      'Billing begins August 3, 2026 for opening month',
      'Unlimited standard classes',
      '1 eligible specialty event per month',
      'Eligible event choices are announced monthly',
      'Unique member promo code for 20% off Rhyze merchandise',
    ],
    cta: { label: 'Choose Plan', href: '/sign-up?plan=vip-access-pass' },
  },
];
