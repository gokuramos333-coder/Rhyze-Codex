import { randomUUID } from 'crypto';
import { prisma } from '../../lib/db/prisma';
import { hashPassword } from '../../lib/auth/password';
import {
  addDays,
  defaultWeek,
  localSendCandidates,
} from '../../lib/newsletters/domain';
import { createCampaign } from '../../lib/newsletters/campaigns';
import { logOutreach } from '../../lib/newsletters/repository';
async function main() {
  const u = new URL(process.env.DATABASE_URL || 'http://invalid');
  if (
    !['127.0.0.1', 'localhost'].includes(u.hostname) ||
    u.pathname !== '/rhyze_newsletter_preview' ||
    process.env.NEWSLETTER_CAPTURE !== 'true'
  )
    throw Error('Isolated preview database required.');
  const password = process.env.PREVIEW_ADMIN_PASSWORD;
  if (!password) throw Error('Missing local fixture password');
  const owner = await prisma.user.upsert({
    where: { email: 'automation-admin@rhyze.local' },
    update: {},
    create: {
      id: 'preview-owner',
      email: 'automation-admin@rhyze.local',
      name: 'Preview Admin',
      role: 'OWNER',
      status: 'ACTIVE',
      emailVerified: new Date(),
      passwordHash: await hashPassword(password),
    },
  });
  const helper = await prisma.user.upsert({
    where: { email: 'preview-manager@rhyze.local' },
    update: {},
    create: {
      id: 'preview-manager',
      email: 'preview-manager@rhyze.local',
      name: 'Morgan Staff',
      role: 'MANAGER',
      status: 'ACTIVE',
      passwordHash: await hashPassword(password),
    },
  });
  const teacher = await prisma.user.upsert({
    where: { email: 'preview-instructor@rhyze.local' },
    update: {},
    create: {
      id: 'preview-instructor',
      email: 'preview-instructor@rhyze.local',
      name: 'Sample Instructor',
      role: 'INSTRUCTOR',
      status: 'ACTIVE',
      passwordHash: await hashPassword(password),
    },
  });
  const category = await prisma.classCategory.upsert({
    where: { slug: 'preview-movement' },
    update: {},
    create: {
      id: 'preview-category',
      slug: 'preview-movement',
      name: 'Movement',
      color: '#ff5c45',
    },
  });
  const names = [
    'Alex Morgan',
    'Jordan Ellis',
    'Casey Quinn',
    'Taylor Brooks',
    'Riley Parker',
    'Avery Lane',
    'Jamie Reed',
    'Sam Rivera',
  ];
  for (let i = 0; i < names.length; i++)
    await prisma.user.upsert({
      where: { email: `sample-${i + 1}@example.test` },
      update: {},
      create: {
        id: `preview-customer-${i}`,
        email: `sample-${i + 1}@example.test`,
        name: names[i],
        status: 'ACTIVE',
        role: 'MEMBER',
        emailVerified: new Date(),
        passwordHash: await hashPassword(password),
        memberProfile: { create: { phone: `555-010${i}` } },
        notificationPreference: { create: { marketingEmail: i !== 5 } },
        leadProfile: {
          create: {
            consent: i === 3 ? 'UNKNOWN' : i === 5 ? 'OPTED_OUT' : 'OPTED_IN',
            consentSource:
              i === 3 ? null : 'Synthetic preview consent — not a real person',
            consentAt: new Date(),
            doNotContact: i === 6,
            outcome: i === 6 ? 'DO_NOT_CONTACT' : 'NOT_CONTACTED',
          },
        },
      },
    });
  const product = await prisma.product.upsert({
    where: { slug: 'preview-membership' },
    update: {},
    create: {
      id: 'preview-plan',
      slug: 'preview-membership',
      name: 'Sample Unlimited',
      description: 'Synthetic preview plan',
      kind: 'MONTHLY_UNLIMITED',
      priceCents: 0,
      billingInterval: 'MONTHLY',
      isUnlimited: true,
      eligibleCategoryIds: [],
      isPublic: false,
    },
  });
  for (const i of [1, 7])
    if (
      !(await prisma.membership.findFirst({
        where: { userId: `preview-customer-${i}` },
      }))
    )
      await prisma.membership.create({
        data: {
          userId: `preview-customer-${i}`,
          productId: product.id,
          status: i === 1 ? 'ACTIVE' : 'EXPIRED',
          currentPeriodStart: new Date(Date.now() - 86400000 * 30),
          currentPeriodEnd: new Date(
            Date.now() + (i === 1 ? 30 : -1) * 86400000,
          ),
        },
      });
  const week = defaultWeek(new Date());
  const items = [
    ['Flow & Restore', 0, 9, false],
    ['Rhyze Ritmo', 0, 18, false],
    ['Power Yoga', 1, 7, false],
    ['Work & Tone', 2, 18, false],
    ['Community Dance', 4, 19, true],
    ['Weekend Reset', 5, 10, false],
  ] as const;
  for (let index = 0; index < items.length; index++) {
    const [name, day, hour, event] = items[index];
    const slug = 'preview-' + index;
    const template = await prisma.classTemplate.upsert({
      where: { slug },
      update: {},
      create: {
        id: 'preview-template-' + index,
        slug,
        name,
        description:
          'Sample schedule content for this isolated preview. Explore movement and connection with the Rhyze community.',
        categoryId: category.id,
        durationMinutes: event ? 75 : 50,
        defaultCapacity: 20,
        tags: [],
        equipment: [],
        isEvent: event,
      },
    });
    for (let w = -1; w < 3; w++) {
      const date = addDays(week, day + w * 7);
      const start = new Date(
        localSendCandidates(
          `${date}T${String(hour).padStart(2, '0')}:00`,
          'America/New_York',
        )[0],
      );
      const oid = `preview-session-${w + 1}-${index}`;
      await prisma.classOccurrence.upsert({
        where: { id: oid },
        update: {},
        create: {
          id: oid,
          templateId: template.id,
          instructorId: teacher.id,
          startAt: start,
          endAt: new Date(start.getTime() + template.durationMinutes * 60000),
          capacity: 20,
          status: 'SCHEDULED',
          priceCents: 0,
        },
      });
      if (w === -1)
        for (const customerIndex of [0, 2, 4]) {
          const booking = await prisma.booking.upsert({
            where: {
              occurrenceId_userId: {
                occurrenceId: oid,
                userId: `preview-customer-${customerIndex}`,
              },
            },
            update: {},
            create: {
              occurrenceId: oid,
              userId: `preview-customer-${customerIndex}`,
              status: 'ATTENDED',
              source: 'PREVIEW_FIXTURE',
            },
          });
          await prisma.attendanceRecord.upsert({
            where: {
              occurrenceId_userId: {
                occurrenceId: oid,
                userId: `preview-customer-${customerIndex}`,
              },
            },
            update: {},
            create: {
              occurrenceId: oid,
              userId: `preview-customer-${customerIndex}`,
              bookingId: booking.id,
              status: 'ATTENDED',
              checkedInAt: start,
            },
          });
        }
    }
  }
  await prisma.newsletterSettings.upsert({
    where: { id: 'studio' },
    update: {},
    create: {
      id: 'studio',
      replyTo: 'preview@example.test',
      opensSupported: false,
      clicksSupported: false,
    },
  });
  if (
    !(await prisma.customerOutreach.findFirst({
      where: { userId: 'preview-customer-0' },
    }))
  ) {
    await logOutreach(owner, {
      userId: 'preview-customer-0',
      version: 0,
      operationKey: randomUUID(),
      type: 'OUTREACH',
      method: 'TEXT',
      outcome: 'INTERESTED',
      note: 'Sample outreach note: interested in evening classes.',
      assignedToId: helper.id,
      followUpAt: new Date(Date.now() + 2 * 86400000).toISOString(),
    });
  }
  if (!(await prisma.emailCampaign.count())) {
    await createCampaign(owner.id, {
      templateType: 'WEEKLY',
      name: 'This week at Rhyze · sample draft',
    });
    await createCampaign(owner.id, {
      templateType: 'MEMBERSHIP',
      name: 'Find your rhythm · sample draft',
    });
  }
  console.log(
    JSON.stringify({
      syntheticCustomers: 8,
      owner: 'local preview account',
      week,
      liveDataUsed: false,
      emailsSent: 0,
    }),
  );
}
main().finally(() => prisma.$disconnect());
