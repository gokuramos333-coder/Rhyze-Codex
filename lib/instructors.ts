export type Instructor = {
  slug: string;
  firstName: string;
  lastName: string;
  role: string;
  descriptor?: string;
  photo: string;
  quote?: string;
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
    specialties: ['RHYZE UP', 'Dance', 'HIIT'],
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
    specialties: ['RITMO', 'Latin Dance', 'Choreography'],
    instagram: 'mllanos.rhyze',
    email: 'melissa@rhyzefit.com',
  },
  {
    slug: 'adrianna-jones',
    firstName: 'Adrianna',
    lastName: 'Jones',
    role: 'RYT 500 (YOGA)',
    descriptor: 'VINYASA FLOW & FUNCTIONAL MOVEMENT',
    photo: '/founders/instructor-adriana.jpg',
    bio: "Adrianna teaches yoga for modern bodies. With more than seven years of teaching experience and a 500-hour Vinyasa certification, she combines traditional yoga practices with a deep understanding of strength, stability, mobility, and functional movement. Her approach emphasizes mindful movement, intelligent alignment, and developing strength throughout the body's full range of motion.\n\nKnown for her focus on balance training, joint health, and the mind-muscle connection, Adrianna helps students build not only flexibility, but resilience, confidence, and trust in their bodies. She is passionate about making yoga accessible to everyone, from first-time students and active older adults to seasoned practitioners looking to deepen their practice. Her classes offer an inviting blend of challenge, curiosity, and self-discovery, encouraging students to move with intention and leave feeling stronger, more connected, and more capable than when they arrived.",
    specialties: ['Vinyasa Flow', 'Functional Movement'],
  },
  {
    slug: 'julie-reese',
    firstName: 'Julie',
    lastName: 'Reese',
    role: 'HIIT INSTRUCTOR / PERSONAL TRAINER',
    descriptor: 'FUNCTIONAL FITNESS & CONDITIONING',
    photo: '/founders/instructor-julie.jpg',
    bio: 'Julie is a NASM Certified Personal Trainer, Group Fitness Instructor, and Corrective Exercise Specialist dedicated to helping individuals build strength, confidence, and a healthier quality of life through functional fitness.\n\nHer athletic journey began in dance, training from age three through her twenties, before she transitioned into competitive boxing and CrossFit. With over a decade of experience as a full-time CrossFit coach, Julie brings a diverse skill set to every session. She holds additional certifications in kettlebell training, Olympic lifting, powerlifting, strongman, and boot camp instruction, allowing her to create dynamic programs tailored to all fitness levels.\n\nAs a mother of two active boys, Julie understands the challenges of balancing fitness with everyday life. Her coaching combines accountability, education, and encouragement to build sustainable habits. Julie believes true fitness is about pushing beyond perceived limitations and finding the confidence to embrace challenges, while emphasizing self-compassion and recognizing that progress is not always linear. Whether you are a beginner or looking to elevate your performance, Julie is committed to guiding you through safe, effective, and empowering workouts.',
    specialties: ['HIIT', 'Functional Fitness', 'Conditioning'],
  },
  {
    slug: 'jessica-blundetto',
    firstName: 'Jessica',
    lastName: 'Blundetto',
    role: 'DANCE FIT / HEELS',
    photo: '/founders/instructor-jessica.jpg',
    bio: 'Hey, I’m Jess! I have over 30 years of dance experience, having trained and performed in a wide variety of styles, including ballet, hip-hop, modern, lyrical, ballroom, salsa, bachata, rumba, and cha-cha. My passion for movement and dance has led me to teach students of all ages, from children as young as 2½ years old to adults, helping each dancer build confidence, technique, and a lifelong love for movement.\n\nIn addition to dance instruction, I am an experienced fitness instructor who loves creating fun, effective workouts that inspire individuals to stay active and reach their personal goals. My teaching style focuses on making fitness accessible, engaging, and enjoyable for every fitness level.',
    specialties: ['Dance Fit', 'Heels'],
  },
  {
    slug: 'tricia-johnsen',
    firstName: 'Tricia',
    lastName: 'Johnsen',
    role: 'HIP-HOP HAPPY HOUR',
    photo: '/founders/instructor-tricia.jpg',
    bio: 'Tricia Johnsen is a dancer, choreographer, and fitness instructor with a background in TV, video, film, and the music industry. Her performance and choreography credits include work connected to music and entertainment projects such as Chris Brown’s “Run It,” Samantha Jade’s Step Up, and David Archuleta’s “Crush.”\n\nShe is the founder of TCJ Dance Fitness, a brand she has run for over 10 years, offering high-energy, beginner-friendly dance fitness classes as well as specialized formats including heels and themed choreography sessions. In addition to group classes, Tricia also creates private dance party experiences, signature Hip Hop Half Hour sessions designed as fun, high-energy private events for groups.',
    specialties: ['Hip-Hop', 'Dance Fitness'],
  },
  {
    slug: 'carla-hotrock',
    firstName: 'Carla',
    lastName: 'Hotrock',
    role: 'CORE-WERK',
    photo: '/founders/instructor-carla.jpg',
    bio: 'Carla is a passionate fitness professional with over 15 years of experience helping people become stronger, healthier, and more confident. Her classes are designed for all fitness levels, with a focus on building strength, improving endurance, and creating healthy habits that last a lifetime.\n\nKnown for her motivating coaching style and positive energy, Carla believes fitness is about so much more than changing your body—it’s about building confidence, resilience, and a mindset that carries into every part of life. Whether you’re picking up a dumbbell for the first time or looking to challenge yourself, she’ll meet you where you are and help you reach your next level.\n\nOutside the gym, Carla is continuing her education in healthcare while inspiring others to live stronger, healthier lives. Her motto is simple: Strong body. Strong mind. Strong spirit.',
    specialties: ['Core-Werk'],
  },
];

export const getInstructor = (slug: string) =>
  instructors.find((i) => i.slug === slug);
