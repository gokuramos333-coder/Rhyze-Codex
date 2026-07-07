export const site = {
  name: 'Rhyze Fitness',
  tagline: 'In Rhythm We Rise',
  url: 'https://rhyzefit.com',
  description:
    'A boutique dance, yoga, and HIIT studio opening in Lafayette, NJ. Elevate your energy. Rhyze together.',
  address: {
    line1: 'The Shoppes at Lafayette',
    line2: '75 NJ-15, Lafayette Township, NJ 07848',
    mapQuery: 'The Shoppes at Lafayette, 75 NJ-15, Lafayette Township, NJ 07848',
  },
  phone: '(201) 921-7133',
  phoneTel: '+12019217133',
  emails: {
    vanessa: 'vanessa@rhyzefit.com',
    melissa: 'melissa@rhyzefit.com',
  },
  instagram: {
    handle: '@rhyze.fitness',
    url: 'https://instagram.com/rhyze.fitness',
  },
  hours: [
    { days: 'Mon - Fri', hours: '7:00 AM - 8:00 PM' },
    { days: 'Sat - Sun', hours: '8:00 AM - 2:00 PM' },
  ],
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
      { label: 'Levels', href: '/classes#levels' },
    ],
  },
  { label: 'Instructors', href: '/instructors' },
  { label: 'Shop', href: '/shop' },
  { label: 'Gallery', href: '/gallery' },
  { label: 'Contact', href: '/contact' },
] as const;
