export const site = {
  name: 'Rhyze Fitness',
  tagline: 'In Rhythm, We Rise',
  url: 'https://www.rhyzefitness.com',
  description:
    'Elevate your mind, energize your body, and evolve your soul. Rhyze Fitness is a boutique movement studio offering dance, yoga, and strength classes for all levels.',
  address: {
    line1: 'The Shoppes at Lafayette',
    line2: '75 NJ-15, Lafayette Township, NJ 07848',
    line3: 'Building J',
    mapQuery:
      'The Shoppes at Lafayette, 75 NJ-15, Lafayette Township, NJ 07848, Building J',
  },
  phone: '(973) 506-8565',
  phoneTel: '+19735068565',
  emails: {
    vanessa: 'vanessa@rhyzefit.com',
    melissa: 'melissa@rhyzefit.com',
  },
  instagram: {
    handle: '@rhyze.fitness',
    url: 'https://instagram.com/rhyze.fitness',
  },
  hours: [{ days: 'Mon - Sun', hours: '8:00 AM - 8:00 PM' }],
  hoursNote: 'Varies depending on the scheduled classes',
} as const;

export const primaryNav = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  {
    label: 'Classes',
    href: '/classes',
    children: [
      { label: 'Schedule', href: '/classes#schedule' },
      { label: 'Class List', href: '/classes#list' },
    ],
  },
  { label: 'Events', href: '/#events' },
  { label: 'Instructors', href: '/instructors' },
  { label: 'Shop', href: '/shop' },
  { label: 'Gallery', href: '/gallery' },
  { label: 'Contact', href: '/contact' },
] as const;
