export type ClassCategory = 'dance' | 'yoga' | 'strength';
export type ClassLevel = 'foundation' | 'signature' | 'peak';

export type RhyzeClass = {
  slug: string;
  name: string;
  category: ClassCategory;
  level: ClassLevel;
  duration: number; // minutes
  tagline: string;
  description: string;
  whatToExpect: string[];
  whatToBring: string[];
};

export const categoryLabel: Record<ClassCategory, string> = {
  dance: 'Dance',
  yoga: 'Yoga & Pilates',
  strength: 'Strength & HIIT',
};

export const levelLabel: Record<ClassLevel, string> = {
  foundation: 'Foundation',
  signature: 'Signature',
  peak: 'Peak',
};

export const levelColor: Record<ClassLevel, string> = {
  foundation: 'bg-level-foundation/20 text-level-foundation border-level-foundation/40',
  signature: 'bg-level-signature/20 text-level-signature border-level-signature/40',
  peak: 'bg-level-peak/20 text-level-peak border-level-peak/40',
};

export const classes: RhyzeClass[] = [
  // DANCE
  {
    slug: 'rhyze-and-groove',
    name: 'Rhyze & Groove',
    category: 'dance',
    level: 'foundation',
    duration: 60,
    tagline: 'Your signature high-energy dance party',
    description:
      'Our signature dance-cardio ride. Low lights, loud music, simple choreography you pick up on the fly. Show up, move, sweat, smile.',
    whatToExpect: [
      'Easy-to-follow choreography, cued every 8 counts',
      'High-energy playlists across pop, hip-hop, Latin, and house',
      'Calorie burn without feeling like a workout',
    ],
    whatToBring: ['Sneakers you can pivot in', 'Water bottle', 'A towel'],
  },
  {
    slug: 'ritmo-rhyze',
    name: 'Rhyze Ritmo',
    category: 'dance',
    level: 'signature',
    duration: 60,
    tagline: 'A nod to Latin roots, pure rhythm and soul',
    description:
      'Get ready to move! Rhyze Ritmo blends high-energy Latin rhythms with easy-to-follow dance fitness choreography. It’s a full-body cardio party designed to let you lose yourself in the music, torch calories, and leave feeling completely empowered. No dance experience required—just bring your energy!',
    whatToExpect: [
      'Latin-rooted choreography with styling breakdowns',
      'Taught bilingually when it counts',
      'Expect to leave glowing',
    ],
    whatToBring: ['Flat dance sneakers', 'Water', 'A hair tie'],
  },
  {
    slug: 'rhyze-revolution',
    name: 'Rhyze Revolution',
    category: 'dance',
    level: 'peak',
    duration: 60,
    tagline: 'Fast-paced, choreography-based cardio blast',
    description:
      'For the dancer hiding inside your cardio. Tighter choreography, quicker transitions, bigger payoff. Peak effort, peak energy, peak you.',
    whatToExpect: [
      'Progressive choreography built across the hour',
      'Elevated heart rate from minute one',
      'An end-of-class performance run-through',
    ],
    whatToBring: ['Sneakers', 'Water', 'Your competitive streak'],
  },
  {
    slug: 'afternoon-rhyze',
    name: 'Afternoon Rhyze',
    category: 'dance',
    level: 'signature',
    duration: 45,
    tagline: 'That midday energy boost',
    description:
      'A 45-minute midday reset, dance-cardio that shakes off the morning and relaunches your afternoon.',
    whatToExpect: [
      '45 tight minutes, perfect lunch break',
      'Upbeat, accessible choreography',
      'Back to your day feeling lit up',
    ],
    whatToBring: ['Sneakers', 'Water'],
  },
  // YOGA & PILATES
  {
    slug: 'rhyze-and-align',
    name: 'Rhyze & Align',
    category: 'yoga',
    level: 'foundation',
    duration: 60,
    tagline: 'Flow-based yoga to center mind and body',
    description:
      'A vinyasa-style flow that links breath to movement. Approachable for beginners, layered for those who want to go deeper.',
    whatToExpect: [
      'Breath-led sun salutations and standing flows',
      'Optional variations at every pose',
      'A grounding savasana to close',
    ],
    whatToBring: ['Mat', 'Water', 'Comfortable layers'],
  },
  {
    slug: 'zen-rhyze',
    name: 'Zen Rhyze',
    category: 'yoga',
    level: 'foundation',
    duration: 60,
    tagline: 'Low lights, deep stretches, mindful movement',
    description:
      'Slow, restorative, candlelit. Long holds, deep opens, and space to breathe. The recovery your body keeps asking for.',
    whatToExpect: [
      'Longer passive holds (2-4 minutes)',
      'Props and bolsters for full support',
      'Guided breathwork throughout',
    ],
    whatToBring: ['Mat', 'Socks', 'An open mind'],
  },
  {
    slug: 'core-rhyze',
    name: 'Core Rhyze',
    category: 'yoga',
    level: 'signature',
    duration: 50,
    tagline: 'Pilates-focused, strengthen your powerhouse',
    description:
      'A Pilates-informed core-and-glute burner. Small movements, big shakes, real strength that shows up in everything else you do.',
    whatToExpect: [
      'Targeted core, glute, and back work',
      'Low-impact but deeply challenging',
      'A mat + light resistance equipment',
    ],
    whatToBring: ['Mat', 'Water', 'Grip socks (optional)'],
  },
  {
    slug: 'the-daily-rhyze',
    name: 'The Daily Rhyze',
    category: 'yoga',
    level: 'foundation',
    duration: 45,
    tagline: 'Your go-to morning flow',
    description:
      'A brisk, energizing morning flow to wake up the body and set the tone. Designed to be your daily anchor.',
    whatToExpect: [
      'Gentle warm-up into a steady flow',
      'Light core work to activate',
      'Out the door in 45',
    ],
    whatToBring: ['Mat', 'Water'],
  },
  // STRENGTH & HIIT
  {
    slug: 'rhyze-to-the-challenge',
    name: 'Rhyze to the Challenge',
    category: 'strength',
    level: 'peak',
    duration: 50,
    tagline: 'High-intensity circuit / strength',
    description:
      'Circuit-style strength training at pace. Compound lifts, bodyweight burners, and timed intervals designed to max out every muscle group.',
    whatToExpect: [
      'Rotating stations with dumbbells and bands',
      'Short bursts, short rests',
      'A leaderboard if you want it',
    ],
    whatToBring: ['Cross trainers', 'Water', 'A towel'],
  },
  {
    slug: 'power-rhyze',
    name: 'Power Rhyze',
    category: 'strength',
    level: 'peak',
    duration: 60,
    tagline: 'Heavy lifting for explosive strength',
    description:
      'Our most traditional strength class. Deadlifts, squats, presses, pulls, coached technique, progressive load, real results.',
    whatToExpect: [
      'Barbell and dumbbell work',
      'Form cues every set',
      'Programmed rest so you can actually move weight',
    ],
    whatToBring: ['Cross trainers', 'Water', 'Lifting shoes (optional)'],
  },
  {
    slug: 'rhyze-and-grind',
    name: 'Rhyze & Grind',
    category: 'strength',
    level: 'signature',
    duration: 45,
    tagline: 'Gritty, high-octane HIIT',
    description:
      'No-equipment HIIT that uses every inch of the floor. Sprints, burpees, jumps, the one you brag about surviving.',
    whatToExpect: [
      'Tabata and EMOM-style intervals',
      'Bodyweight plus minimal equipment',
      'A playlist that carries you',
    ],
    whatToBring: ['Cross trainers', 'Water', 'A towel'],
  },
  {
    slug: 'limitless-rhyze',
    name: 'Limitless Rhyze',
    category: 'strength',
    level: 'peak',
    duration: 60,
    tagline: 'Push past your personal bests',
    description:
      'A benchmarking peak class. Track your numbers, chase your previous self, rewrite what you thought you were capable of.',
    whatToExpect: [
      'Measured lifts with tracked PRs',
      'Coach-led programming block by block',
      'A community that cheers loud',
    ],
    whatToBring: ['Cross trainers', 'Water', 'A notebook'],
  },
];

export const getClass = (slug: string) => classes.find((c) => c.slug === slug);
