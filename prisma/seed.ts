import { PrismaClient, Role } from '@prisma/client';
import { hashPassword, validatePassword } from '../lib/auth/password';

const prisma = new PrismaClient();

async function main() {
  const location = await prisma.location.upsert({
    where: { id: 'seed-location-lafayette' },
    update: {},
    create: {
      id: 'seed-location-lafayette',
      name: 'Rhyze Fitness',
      address: '75 NJ-15, Building J, Lafayette Township, NJ 07848',
      rooms: {
        create: [
          { id: 'seed-room-main-floor', name: 'Main Floor', capacity: 24 },
          { id: 'seed-room-studio-b', name: 'Studio B', capacity: 16 },
        ],
      },
    },
    include: { rooms: true },
  });

  const categories = await Promise.all(
    [
      ['dance', 'Dance', '#F05A3C'],
      ['yoga-pilates', 'Yoga & Pilates', '#FFC72C'],
      ['strength-hiit', 'Strength & HIIT', '#F7931E'],
    ].map(([slug, name, color]) =>
      prisma.classCategory.upsert({
        where: { slug },
        update: { name, color },
        create: { slug, name, color },
      }),
    ),
  );

  const categoryBySlug = Object.fromEntries(
    categories.map((category) => [category.slug, category]),
  );
  const mainFloor = location.rooms.find((room) => room.name === 'Main Floor')!;
  const studioB = location.rooms.find((room) => room.name === 'Studio B')!;

  const vanessa = await prisma.user.upsert({
    where: { email: 'vanessa@rhyze.local' },
    update: { role: Role.INSTRUCTOR },
    create: {
      email: 'vanessa@rhyze.local',
      name: 'Vanessa Ramos',
      role: Role.INSTRUCTOR,
      status: 'INVITED',
      instructorProfile: {
        create: {
          photoUrl: '/founders/instructor-vanessa.jpg',
          isActive: true,
        },
      },
    },
  });
  const adrianna = await prisma.user.upsert({
    where: { email: 'adrianna@rhyze.local' },
    update: { role: Role.INSTRUCTOR },
    create: {
      email: 'adrianna@rhyze.local',
      name: 'Adrianna',
      role: Role.INSTRUCTOR,
      status: 'INVITED',
      instructorProfile: {
        create: {
          photoUrl: '/founders/instructor-adriana.jpg',
          isActive: true,
        },
      },
    },
  });

  const rhyzeUp = await prisma.classTemplate.upsert({
    where: { slug: 'rhyze-up' },
    update: {},
    create: {
      categoryId: categoryBySlug.dance.id,
      name: 'Rhyze Up',
      slug: 'rhyze-up',
      description:
        'A music-led dance-cardio class built for energy, confidence, and community.',
      imageUrl: '/founders/classes.jpg',
      durationMinutes: 50,
      intensity: 'HIGH',
      defaultCapacity: 24,
      dropInPriceCents: 2800,
      tags: ['dance-cardio', 'all-levels'],
      equipment: [],
    },
  });
  const pilates = await prisma.classTemplate.upsert({
    where: { slug: 'pilates-pulse' },
    update: {},
    create: {
      categoryId: categoryBySlug['yoga-pilates'].id,
      name: 'Pilates Pulse',
      slug: 'pilates-pulse',
      description:
        'A functional Pilates flow focused on strength, stability, mobility, and intelligent alignment.',
      imageUrl: '/founders/pillar-yoga.jpeg',
      durationMinutes: 50,
      intensity: 'MODERATE',
      defaultCapacity: 16,
      dropInPriceCents: 2600,
      tags: ['pilates', 'core', 'all-levels'],
      equipment: ['Mat'],
    },
  });

  await Promise.all([
    prisma.classOccurrence.upsert({
      where: { id: 'seed-occ-pilates-2026-08-03' },
      update: {},
      create: {
        id: 'seed-occ-pilates-2026-08-03',
        templateId: pilates.id,
        instructorId: adrianna.id,
        roomId: studioB.id,
        startAt: new Date('2026-08-03T14:00:00.000Z'),
        endAt: new Date('2026-08-03T14:50:00.000Z'),
        capacity: 16,
        priceCents: 2600,
      },
    }),
    prisma.classOccurrence.upsert({
      where: { id: 'seed-occ-rhyze-up-2026-08-05' },
      update: {},
      create: {
        id: 'seed-occ-rhyze-up-2026-08-05',
        templateId: rhyzeUp.id,
        instructorId: vanessa.id,
        roomId: mainFloor.id,
        startAt: new Date('2026-08-05T22:30:00.000Z'),
        endAt: new Date('2026-08-05T23:20:00.000Z'),
        capacity: 24,
        priceCents: 2800,
      },
    }),
  ]);

  const email = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_OWNER_PASSWORD;

  if (!email || !password) {
    console.info(
      'Skipping owner seed. Set SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD to create one.',
    );
    return;
  }

  const validation = validatePassword(password);
  if (!validation.valid) {
    throw new Error(validation.errors.join(' '));
  }

  await prisma.user.upsert({
    where: { email },
    update: { role: Role.OWNER, status: 'ACTIVE' },
    create: {
      email,
      passwordHash: await hashPassword(password),
      role: Role.OWNER,
      notificationPreference: { create: {} },
      memberProfile: { create: {} },
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
