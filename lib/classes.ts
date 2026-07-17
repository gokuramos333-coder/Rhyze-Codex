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
  {
    slug: 'core-360-carla-rio',
    name: 'Core 360 w/ Carla Rio',
    category: 'strength',
    level: 'signature',
    duration: 50,
    tagline: 'Functional core strength, posture, and balance from every angle',
    description:
      'Core 360 builds functional core strength from every angle, blending standing stability work with mat-based training for the pelvic floor, lower back, and deep abdominals. Carla guides you through focused progressions that improve posture, balance, injury prevention, and confidence in how your body moves.',
    whatToExpect: [
      'Standing stability work fused with mat-based core sequencing',
      'Posture, balance, pelvic floor, lower back, and deep abdominal focus',
      'Precise coaching for safe, intentional core engagement',
    ],
    whatToBring: ['Comfortable athletic wear', 'Water bottle', 'Sneakers or grip socks'],
  },
  {
    slug: 'dance-fit-jessica',
    name: 'Dance Fit w/ Jessica',
    category: 'dance',
    level: 'signature',
    duration: 50,
    tagline: 'High-energy dance cardio with strength and toning',
    description:
      'Dance Fit with Jessica is a high-energy, feel-good workout that blends upbeat dance cardio with strength and toning. Expect great music, welcoming vibes, and a confidence-building sweat that feels more like a dance party than a traditional fitness class.',
    whatToExpect: [
      'Dance-cardio blended with functional strength and sculpting',
      'A welcoming, judgment-free dance party atmosphere',
      'A confidence-building full-body sweat',
    ],
    whatToBring: ['Comfortable athletic wear', 'Supportive sneakers', 'Water bottle'],
  },
  {
    slug: 'grind-and-grow-carla-reo',
    name: 'Grind & Grow w/ Carla Reo',
    category: 'strength',
    level: 'signature',
    duration: 50,
    tagline: 'Full-body strength with dumbbells, kettlebells, bands, and more',
    description:
      'Grind & Grow with Carla is a full-body strength class using dumbbells, kettlebells, bands, and more to build lean muscle, burn calories, increase bone density, and boost confidence. It is supportive, high-energy, and built for beginners through seasoned lifters.',
    whatToExpect: [
      'Full-body strength work with free weights and resistance tools',
      'Lean muscle, bone density, joint health, and metabolism focus',
      'Supportive coaching for beginners through seasoned lifters',
    ],
    whatToBring: ['Supportive athletic sneakers', 'Comfortable workout clothes', 'Water bottle'],
  },
  {
    slug: 'heels-101-walk-with-me-jessica',
    name: 'Heels 101 "Walk with Me" with Jessica',
    category: 'dance',
    level: 'foundation',
    duration: 50,
    tagline: 'Beginner-friendly heels fundamentals',
    description:
      'Heels 101 "Walk with Me" with Jessica is a beginner-friendly heels class focused on posture, balance, walking technique, and confidence. It is designed to help you learn how to move safely and feel strong in heels before progressing into more choreographed heels work.',
    whatToExpect: [
      'Foundational heels movement and walking technique',
      'Beginner-friendly pacing with confidence-building support',
      'A focused class for learning how to move safely in heels',
    ],
    whatToBring: ['Supportive heels', 'Comfortable clothes you can move in', 'Water bottle'],
  },
  {
    slug: 'hypnotic-heels-jessica',
    name: 'Hypnotic Heels w/ Jessica',
    category: 'dance',
    level: 'peak',
    duration: 75,
    tagline: 'A specialty heels class for confidence, technique, and flow',
    description:
      'Hypnotic Heels with Jessica is a 75-minute specialty class for beginner to intermediate dancers ready to build confidence, technique, and flow in heels. You will warm up, practice posture and balance, learn a choreographed routine, and explore a fresh monthly theme.',
    whatToExpect: [
      'A barefoot or socks warm-up before heels work',
      'Posture, balance, strutting, and choreographed routine work',
      'Optional group and solo video runs',
    ],
    whatToBring: ['Sturdy heels with ankle support', 'Knee pads', 'Water bottle'],
  },
  {
    slug: 'ignite-julie',
    name: 'Ignite w/ Julie',
    category: 'strength',
    level: 'signature',
    duration: 50,
    tagline: 'Dynamic full-body conditioning with Julie',
    description:
      'Ready to spark your strength and power up your week? Ignite with Julie is a full-body conditioning class using dumbbells, bands, gliders, and bodyweight work to build strength, core stability, balance, and confidence with safe, smart coaching for all levels.',
    whatToExpect: [
      'Functional conditioning with dumbbells, bands, gliders, and bodyweight work',
      'Strength, core stability, balance, and conditioning in one class',
      'All-levels coaching with progressions and modifications',
    ],
    whatToBring: ['Comfortable supportive athletic wear', 'Sneakers', 'Water bottle'],
  },
  {
    slug: 'pilates-pulse-adrianna',
    name: 'Pilates Pulse w/ Adrianna',
    category: 'yoga',
    level: 'signature',
    duration: 50,
    tagline: 'Pilates precision with a modern rhythmic pulse',
    description:
      'Ready to find your fire? Pilates Pulse with Adrianna is a dynamic, high-energy fusion designed to sculpt, strengthen, and energize. Expect classic Pilates precision with a modern rhythmic pulse, using light weights, Pilates balls, and rings for a low-impact burn.',
    whatToExpect: [
      'Classic Pilates precision with a modern rhythmic pulse',
      'Light hand weights, Pilates balls, and Pilates rings',
      'Low-impact strength with modifications and challenges',
    ],
    whatToBring: ['Comfortable athletic wear', 'Water bottle', 'Grip socks or bare feet'],
  },
  {
    slug: 'real-riddim-dance-workout-vanessa',
    name: 'Real Riddim Dance Workout w/ Vanessa',
    category: 'dance',
    level: 'signature',
    duration: 50,
    tagline: 'Caribbean-style follow-along dance fitness',
    description:
      'Real Riddim with Vanessa is a Caribbean-style, follow-along dance fitness workout powered by Reggae, Dancehall, Afrobeats, and Dembow. Expect high-energy peaks, slow sensual grooves, lower-body and core focus, and a party vibe with no dance experience required.',
    whatToExpect: [
      'Follow-along Caribbean-style choreography',
      'Reggae, Dancehall, Afrobeats, and Dembow soundtrack',
      'Lower-body, hip mobility, and core-focused movement',
    ],
    whatToBring: ['Comfortable athletic wear or dancewear', 'Supportive sneakers', 'Water bottle'],
  },
  {
    slug: 'rhyze-ritmo-melissa',
    name: 'Rhyze Ritmo w/ Melissa',
    category: 'dance',
    level: 'signature',
    duration: 50,
    tagline: 'Latin rhythms and full-body cardio with Melissa',
    description:
      'Rhyze Ritmo with Melissa is a high-energy, full-body cardio party inspired by the vibrant spirit and soulful warmth of South America. Move through easy-to-follow Latin dance fitness choreography set to Salsa, Brazilian Funk, Merengue, Reggaeton, Samba, Cumbia, and Afro beats.',
    whatToExpect: [
      'Latin rhythms with easy-to-follow dance-fitness choreography',
      'Salsa, Brazilian Funk, Merengue, Reggaeton, Samba, Cumbia, and Afro beats',
      'A high-energy cardio party open to all levels',
    ],
    whatToBring: ['Comfortable athletic wear', 'Supportive sneakers', 'Plenty of water'],
  },
  {
    slug: 'rhyze-up-vanessa',
    name: 'Rhyze Up w/ Vanessa',
    category: 'dance',
    level: 'signature',
    duration: 50,
    tagline: 'Signature rhythm-driven dance fitness with Vanessa',
    description:
      'Rhyze Up with Vanessa is a signature dance-fitness experience created to elevate the mind, energize the body, and evolve the soul. This rhythm-driven, follow-along class blends electronic, Latin, and global-inspired music with high-intensity peaks and soulful flow.',
    whatToExpect: [
      'Follow-along choreography driven by rhythm and energy',
      'Electronic, Latin, and global-inspired music',
      'High-intensity peaks balanced with hypnotic flow',
    ],
    whatToBring: ['Comfortable athletic wear', 'Supportive sneakers', 'Water bottle'],
  },
  {
    slug: 'soul-line-and-groove-rachel',
    name: 'Soul Line & Groove w/ Rachel',
    category: 'dance',
    level: 'foundation',
    duration: 50,
    tagline: 'Soulful line-dancing, collective movement, and pure joy',
    description:
      'Soul Line & Groove with Rachel is a soulful line-dancing class built around connection, rhythm, and joy. Learn smooth, synchronized patterns step by step to soul, neo-soul, old-school R&B, and country while getting a fun cardio workout in a community-first vibe.',
    whatToExpect: [
      'Step-by-step soul line-dancing routines',
      'Soul, neo-soul, old-school R&B, and country music',
      'A social cardio workout built around community',
    ],
    whatToBring: ['Comfortable clothes you can sweat in', 'Smooth-soled sneakers', 'Water bottle'],
  },
  {
    slug: 'tcj-hip-hop-happy-hour-tricia',
    name: 'TCJ Hip-Hop Happy Hour w/ Tricia',
    category: 'dance',
    level: 'signature',
    duration: 75,
    tagline: 'Beginner-friendly hip-hop choreography that feels like a night out',
    description:
      'TCJ Hip-Hop Happy Hour with Tricia is a beginner-friendly dance experience that feels more like a night out than a workout. Each session breaks down a hip-hop or pop routine step by step to a different track, so you can move, sweat, and have fun at any level.',
    whatToExpect: [
      'Step-by-step hip-hop or pop choreography',
      'A different track and routine each session',
      'Beginner-friendly movement with no experience needed',
    ],
    whatToBring: ['Comfortable dancewear', 'Supportive sneakers', 'Water bottle'],
  },
  {
    slug: 'yoga-flow-adrianna',
    name: 'Yoga Flow w/ Adrianna',
    category: 'yoga',
    level: 'foundation',
    duration: 50,
    tagline: 'Vinyasa flow and functional movement for modern bodies',
    description:
      'Yoga Flow with Adrianna blends traditional Vinyasa with functional movement to build strength, stability, and mobility. Expect mindful sequencing, intelligent alignment, joint health, balance training, and an accessible challenge for first-time and seasoned students.',
    whatToExpect: [
      'Traditional Vinyasa flow blended with functional movement',
      'Strength, stability, mobility, alignment, and joint-health focus',
      'Mindful movement for first-time students and seasoned practitioners',
    ],
    whatToBring: ['Yoga mat', 'Comfortable layers', 'Water bottle'],
  },
];

export const getClass = (slug: string) => classes.find((c) => c.slug === slug);
