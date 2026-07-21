export const site = {
  name: 'Rhyze Fitness',
  tagline: 'In Rhythm We Rise',
  url: 'https://rhyzefit.com',
  description:
    'A boutique dance, yoga, and HIIT studio opening in Lafayette, NJ. Elevate your energy. Rhyze together.',
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
  { label: 'Instructors', href: '/instructors' },
  { label: 'Shop', href: '/shop' },
  { label: 'Gallery', href: '/gallery' },
  { label: 'Contact', href: '/contact' },
] as const;
