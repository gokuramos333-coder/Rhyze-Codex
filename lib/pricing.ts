import { sombleMembershipsUrl } from '@/lib/somble';

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
    id: 'intro-offer',
    name: 'Intro Offer 7-Days',
    price: '$7',
    cadence: '/ 7 credits',
    perClass: 'Class Pack',
    popular: false,
    blurb:
      'Includes 7 consecutive days of unlimited access to all standard classes. Excludes all premium specialty classes and workshops. Valid for first-time clients only.',
    cta: { label: 'Join Membership', href: sombleMembershipsUrl },
  },
  {
    id: 'full-rhythm',
    name: 'Full Rhythm',
    price: '$168',
    cadence: '/ month',
    perClass: '8 Classes / Month Membership',
    popular: true,
    blurb:
      'Includes 8 standard classes per billing cycle. 20% off merchandise. Credits do not roll over.',
    cta: { label: 'Join Membership', href: sombleMembershipsUrl },
  },
  {
    id: 'elevate',
    name: 'Elevate',
    price: '$92',
    cadence: '/ month',
    perClass: '4 Classes / Month Membership',
    popular: false,
    blurb:
      'Includes 4 standard classes per billing cycle. 10% off all Rhyze Merchandise. Credits do not roll over.',
    cta: { label: 'Join Membership', href: sombleMembershipsUrl },
  },
  {
    id: 'vip-access-pass',
    name: 'The VIP Access Pass',
    price: '$199',
    cadence: '/ month',
    perClass: 'AUGUST ONLY',
    popular: false,
    blurb:
      'Founding Members lock in $199/month for life. Unlimited full access to all standard classes and 1 specialty class per month. 30% off all Rhyze Fitness merchandise.',
    cta: { label: 'Join Membership', href: sombleMembershipsUrl },
  },
];
