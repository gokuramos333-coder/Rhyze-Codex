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
    role: 'Founder & Creative Director',
    photo: '/founders/instructor-vanessa.jpg',
    quote: 'Find the power in your own rhythm.',
    bio: "Vanessa's foundation in movement began in her teenage years, when she first discovered her drive for fitness and discipline. While she entered the industry as a certified personal trainer, she quickly transitioned into group exercise and found her true calling. For nearly two decades, she has dedicated herself to dance fitness, building an extensive career as an instructor while simultaneously performing as a professional showgirl. Her time on stage for high-profile events provided the creative spark to launch her first business, Bastet Ent, a specialized agency for elite dancers and specialty acts.\n\nNow a seasoned entrepreneur, Vanessa has channeled her lifelong passion for dance and her deep expertise in group movement into her second venture, Rhyze Fitness. As a wife and mother of two, Vanessa understands the importance of balance and the deep need for community. Her mission is to bridge the gap between high-end performance and boutique fitness, moving away from the intimidation of traditional gyms to create an inclusive, high-energy space. Rather than focusing solely on technique, Vanessa prioritizes making every person feel welcome and empowered, helping them find their own rhythm and a sense of belonging through the joy of dance.",
    specialties: ['Dance', 'HIIT'],
    instagram: 'vanessaramos.rhyze',
    email: 'vanessa@rhyzefit.com',
  },
  {
    slug: 'melissa-llanos',
    firstName: 'Melissa',
    lastName: 'Llanos',
    role: 'Co-Founder · Instructor',
    photo: '/founders/instructor-melissa.jpg',
    quote:
      "Your only limit is the one you build yourself. Let's break it down together.",
    bio: "For Melissa, movement isn't just a workout, it's a lifelong language. Born and raised in Colombia, she has been dancing since she could walk, carrying the vibrant rhythms of her heritage in every step. For years, friends and students alike told her the same thing: 'You were born to teach.' After a lifetime of movement, Melissa is finally stepping into the role she was destined for. As the co-founder of Rhyze Fitness, she brings that lifelong passion to the floor, helping you find your own rhythm while pushing your limits. To Melissa, there is nothing more rewarding than seeing her community Rhyze together. When you step into her class, expect high energy, authentic soul, and a reminder that you belong on this floor.",
    specialties: ['Latin Dance', 'Choreography'],
    instagram: 'mllanos.rhyze',
    email: 'melissa@rhyzefit.com',
  },
];

export const getInstructor = (slug: string) =>
  instructors.find((i) => i.slug === slug);
