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
  'The $7 trial is available now. It activates on the date of the client’s first booked standard class and automatically expires 7 calendar days after that first booking.';

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
    id: 'eight-class-pack',
    name: '8-Class Pack',
    price: '$179',
    cadence: '/ 3 months',
    perClass: '8 classes · valid 3 months',
    popular: false,
    blurb:
      'Includes 8 standard class credits valid for 3 months. Auto-renews every 3 months unless cancelled at least 14 days before renewal. Unused credits expire at the end of each 3-month period.',
    bullets: [
      'Available September 1, 2026',
      '8 standard class credits valid for 3 months',
      'Auto-renews every 3 months at $179',
      'Cancel at least 14 days before renewal',
      'Specialty events and workshops excluded',
    ],
    cta: { label: 'Choose Pack', href: '/sign-up?plan=eight-class-pack' },
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
    price: '$222',
    cadence: '/ month',
    perClass: 'VIP Membership',
    popular: false,
    blurb:
      'Unlimited full access to all standard classes, 1 eligible specialty class per month, and a unique 20% merch promo code. New membership buyers can use RHYZE2026 September 1–7 for 20% off the first 2 months.',
    bullets: [
      'Regular VIP rate starts September 1, 2026',
      'Unlimited standard classes',
      '1 eligible specialty event per month',
      'RHYZE2026 sale: 20% off the first 2 months for new membership buyers only',
      'Eligible event choices are announced monthly',
      'Unique member promo code for 20% off Rhyze merchandise',
    ],
    cta: { label: 'Choose Plan', href: '/sign-up?plan=vip-access-pass' },
  },
];
