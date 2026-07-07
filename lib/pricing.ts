export type PricingTier = {
  id: string;
  name: string;
  price: string;
  cadence: string;
  perClass?: string;
  blurb: string;
  popular?: boolean;
  cta: { label: string; href: string };
};

export const trial = {
  price: '$7',
  duration: '7-Day Unlimited',
  subtitle: 'First-timers only · Unlimited classes · No commitment',
  cta: { label: 'Start Your $7 Trial', href: '/join' },
};

export const tiers: PricingTier[] = [
  {
    id: 'drop-in',
    name: 'Single Class (Drop-In)',
    price: '$30',
    cadence: 'per class',
    blurb: 'Your anchor rate. Perfect for trying a class or dropping in.',
    cta: { label: 'Book a Class', href: '/classes' },
  },
  {
    id: 'weekly',
    name: 'The Weekly Rhyzer',
    price: '$99',
    cadence: 'per month',
    perClass: '~$24.75 / class · 4 classes / mo',
    blurb:
      'For the member supplementing their routine with one Rhyze session a week.',
    cta: { label: 'Join Weekly', href: '/join' },
  },
  {
    id: 'twice',
    name: 'The Twice-A-Week',
    price: '$169',
    cadence: 'per month',
    perClass: '~$21.12 / class · 8 classes / mo',
    blurb: 'Our most popular tier, 30% savings over drop-in.',
    popular: true,
    cta: { label: 'Join Twice-A-Week', href: '/join' },
  },
  {
    id: 'unlimited',
    name: 'The Rhyze Up Unlimited',
    price: '$219',
    cadence: 'per month',
    perClass: '~$18 / class at 3x/week',
    blurb:
      'For our dedicated community members. Unlimited access to the floor.',
    cta: { label: 'Go Unlimited', href: '/join' },
  },
];

export const memberPerks = [
  {
    title: 'Glow-in-the-Dark Pop-ups',
    body: 'Member-only late-night fusion events, neon, black lights, and the whole Rhyze Tribe.',
  },
  {
    title: 'Buddy Pass',
    body: 'One guest pass per month. Bring a friend to Rhyze with you, on the house.',
  },
  {
    title: 'Retail Discount',
    body: '10% off all Rhyze-branded gear in-studio and online.',
  },
];
