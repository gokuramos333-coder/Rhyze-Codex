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
          { id: 'seed-room-main-floor', name: 'Main Floor', capacity: 25 },
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
    where: { email: 'vanessa@rhyzefit.com' },
    update: { name: 'Vanessa Ramos' },
    create: {
      email: 'vanessa@rhyzefit.com',
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
    where: { email: 'adrianna-jones@rhyze.local' },
    update: {
      name: 'Adrianna Jones',
      role: Role.INSTRUCTOR,
      status: 'ACTIVE',
    },
    create: {
      email: 'adrianna-jones@rhyze.local',
      name: 'Adrianna Jones',
      role: Role.INSTRUCTOR,
      status: 'ACTIVE',
      instructorProfile: {
        create: {
          photoUrl: '/founders/instructor-adriana.jpg',
          isActive: true,
        },
      },
    },
  });

  const rhyzeUp = await prisma.classTemplate.upsert({
    where: { slug: 'rhyze-up-vanessa' },
    update: {},
    create: {
      categoryId: categoryBySlug.dance.id,
      name: 'Rhyze Up with Vanessa',
      slug: 'rhyze-up-vanessa',
      description:
        'A music-led dance-cardio class built for energy, confidence, and community.',
      imageUrl: '/founders/classes.jpg',
      durationMinutes: 50,
      intensity: 'HIGH',
      defaultCapacity: 25,
      dropInPriceCents: 2500,
      tags: ['dance-cardio', 'all-levels'],
      equipment: [],
    },
  });
  const pilates = await prisma.classTemplate.upsert({
    where: { slug: 'pilates-pulse-adrianna' },
    update: {},
    create: {
      categoryId: categoryBySlug['yoga-pilates'].id,
      name: 'Pilates Pulse with Adrianna',
      slug: 'pilates-pulse-adrianna',
      description:
        'A functional Pilates flow focused on strength, stability, mobility, and intelligent alignment.',
      imageUrl: '/founders/pillar-yoga.jpeg',
      durationMinutes: 50,
      intensity: 'MODERATE',
      defaultCapacity: 25,
      dropInPriceCents: 2500,
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
        capacity: 25,
        priceCents: 2500,
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
        startAt: new Date('2026-08-04T23:10:00.000Z'),
        endAt: new Date('2026-08-05T00:00:00.000Z'),
        capacity: 25,
        priceCents: 2500,
      },
    }),
  ]);

  await Promise.all(
    [
      { slug: 'intro-trial', name: 'Intro Trial', description: 'Two weeks to explore the Rhyze class lineup.', kind: 'INTRO_TRIAL' as const, priceCents: 4900, includedCredits: 4, trialDays: 14 },
      { slug: 'monthly-unlimited', name: 'Monthly Unlimited', description: 'Unlimited eligible studio classes every month.', kind: 'MONTHLY_UNLIMITED' as const, priceCents: 16900, billingInterval: 'MONTHLY' as const, isUnlimited: true },
      {
        slug: 'eight-class-pack',
        name: '8-Class Pack',
        description: 'Includes 8 standard class credits valid for 3 months. Auto-renews every 3 months unless cancelled at least 14 days before renewal. Unused credits expire at the end of each 3-month period.',
        kind: 'CLASS_PACK' as const,
        priceCents: 17900,
        billingInterval: 'MONTHLY' as const,
        includedCredits: 8,
        alwaysAvailable: false,
        availabilityStart: new Date('2026-09-01T04:00:00.000Z'),
        customPlanType: 'QUARTERLY_8_CLASS_PACK',
      },
      { slug: 'drop-in', name: 'Drop-in', description: 'One class credit for any eligible class.', kind: 'DROP_IN' as const, priceCents: 2500, includedCredits: 1 },
    ].map((product) =>
      prisma.product.upsert({
        where: { slug: product.slug },
        update: product,
        create: { billingInterval: 'ONE_TIME', eligibleCategoryIds: [], ...product },
      }),
    ),
  );

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

  const owner = await prisma.user.upsert({
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
  const existingCredits = await prisma.creditAccount.findFirst({
    where: { userId: owner.id, label: 'Local Preview Credits' },
  });
  if (!existingCredits) {
    await prisma.creditAccount.create({
      data: {
        userId: owner.id,
        label: 'Local Preview Credits',
        entries: {
          create: {
            type: 'GRANT',
            quantity: 10,
            reason: 'Local development preview',
          },
        },
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
