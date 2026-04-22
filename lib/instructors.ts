export type Instructor = {
  slug: string;
  firstName: string;
  lastName: string;
  role: string;
  photo: string;
  quote: string;
  bio: string;
  bioIsPlaceholder?: boolean;
  specialties: string[];
  instagram?: string;
  email?: string;
};

export const instructors: Instructor[] = [
  {
    slug: 'vanessa-ramos',
    firstName: 'Vanessa',
    lastName: 'Ramos',
    role: 'Co-Founder · Instructor',
    photo: '/founders/founder-vanessa-1.jpg',
    quote: 'Movement is my love language — come write yours with us.',
    // TODO: Replace with Vanessa's final bio
    bio: "Vanessa is the heart and co-founder of Rhyze Fitness. With a lifelong passion for movement and building community, she created Rhyze to be the welcoming, high-energy space she always dreamed of. Full bio coming soon.",
    bioIsPlaceholder: true,
    specialties: ['Dance', 'HIIT'],
    instagram: 'vanessa.ramos',
    email: 'vanessa@rhyzefit.com',
  },
  {
    slug: 'melissa-llanos',
    firstName: 'Melissa',
    lastName: 'Llanos',
    role: 'Co-Founder · Instructor',
    photo: '/founders/founder-melissa-1.jpg',
    quote:
      "Your only limit is the one you build yourself. Let's break it down together.",
    bio: "For Melissa, movement isn't just a workout — it's a lifelong language. Born and raised in Colombia, she has been dancing since she could walk, carrying the vibrant rhythms of her heritage in every step. For years, friends and students alike told her the same thing: 'You were born to teach.' After a lifetime of movement, Melissa is finally stepping into the role she was destined for. As the co-founder of Rhyze Fitness, she brings that lifelong passion to the floor, helping you find your own rhythm while pushing your limits. To Melissa, there is nothing more rewarding than seeing her community Rhyze together. When you step into her class, expect high energy, authentic soul, and a reminder that you belong on this floor.",
    specialties: ['Latin Dance', 'Choreography'],
    instagram: 'melissa.llanos',
    email: 'melissa@rhyzefit.com',
  },
];

export const getInstructor = (slug: string) =>
  instructors.find((i) => i.slug === slug);
