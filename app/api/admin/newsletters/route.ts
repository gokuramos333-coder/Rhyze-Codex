import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { isTrustedAdminOrigin } from '@/lib/auth/request-origin';
import { newsletterActor } from '@/lib/newsletters/access';
import {
  audit,
  captureEnabled,
  json,
  loadCustomers,
  loadSchedule,
  origin,
  settings,
} from '@/lib/newsletters/repository';
import {
  approveCampaign,
  campaignReview,
  cancelCampaign,
  createCampaign,
  saveCampaign,
} from '@/lib/newsletters/campaigns';
import { templateCatalog } from '@/lib/newsletters/templates';
import {
  campaignMetrics,
  attributedOutcomes,
} from '@/lib/newsletters/analytics';
import { runNewsletterBatch } from '@/lib/newsletters/delivery';
import {
  audienceSchema,
  documentSchema,
  defaultWeek,
  resolveSendTime,
  safeLink,
  csvCell,
} from '@/lib/newsletters/domain';
import { sendNewsletterTest } from '@/lib/newsletters/test-delivery';
export async function GET(request: Request) {
  const actor = await newsletterActor();
  if (!actor)
    return NextResponse.json(
      { error: 'Admin access required' },
      { status: 403 },
    );
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const config = await settings();
  if (url.searchParams.get('context')) {
    const days = z.coerce
      .number()
      .int()
      .min(1)
      .max(365)
      .catch(30)
      .parse(url.searchParams.get('days'));
    const week = url.searchParams.get('week') || defaultWeek(new Date());
    const featured = (url.searchParams.get('featured') || '')
      .split(',')
      .filter(Boolean)
      .slice(0, 40);
    const [customers, schedule] = await Promise.all([
      loadCustomers(days, true),
      loadSchedule(week, featured),
    ]);
    return NextResponse.json({ customers, schedule });
  }
  if (url.searchParams.get('review') && id) {
    const sendAt = url.searchParams.get('sendAt');
    return NextResponse.json(
      await campaignReview(id, sendAt ? new Date(sendAt) : undefined),
    );
  }
  if (url.searchParams.get('export') && id) {
    const c = await prisma.emailCampaign.findUniqueOrThrow({
      where: { id },
      include: { recipients: { include: { events: true } } },
    });
    await audit(actor.id, 'EXPORTED', id, {});
    if (c.templateType === 'LEGACY') {
      const archives = await prisma.emailMessage.findMany({
        where: {
          template: 'CAMPAIGN',
          payload: { path: ['campaignId'], equals: id },
        },
        select: { to: true, status: true, sentAt: true, providerId: true },
      });
      const csv = [
        [
          'Email',
          'Archive status',
          'Recorded send time UTC',
          'Provider ID',
          'Engagement data',
        ],
        ...archives.map((m) => [
          m.to,
          m.status,
          m.sentAt?.toISOString() || 'Unavailable',
          m.providerId || 'Unavailable',
          'Historical tracking unavailable',
        ]),
      ]
        .map((row) => row.map(csvCell).join(','))
        .join('\r\n');
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition':
            'attachment; filename="rhyze-legacy-campaign.csv"',
          'Cache-Control': 'private, no-store',
        },
      });
    }

    const csv = [
      [
        'Email',
        'Membership at send',
        'Dispatch status',
        'Recorded opens',
        'Recorded clicks',
        'First open UTC',
        'Last open UTC',
      ],
      ...c.recipients.map((r) => {
        const opens = r.events
          .filter((e) => e.type === 'email.opened')
          .map((e) => e.occurredAt.toISOString())
          .sort();
        return [
          r.email,
          r.membershipAtSend,
          r.status,
          config.opensSupported || opens.length ? opens.length : 'Unavailable',
          config.clicksSupported ||
          r.events.some((e) => e.type === 'email.clicked')
            ? r.events.filter((e) => e.type === 'email.clicked').length
            : 'Unavailable',
          opens[0] || '',
          opens.at(-1) || '',
        ];
      }),
    ]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n');
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition':
          'attachment; filename="rhyze-campaign-report.csv"',
        'Cache-Control': 'private, no-store',
      },
    });
  }
  const detailed = !!id && url.searchParams.get('detail') === '1';
  const customerId = url.searchParams.get('customerId');
  const legacyMessages = detailed
    ? await prisma.emailMessage.findMany({
        where: {
          template: 'CAMPAIGN',
          payload: { path: ['campaignId'], equals: id! },
        },
        select: {
          id: true,
          to: true,
          subject: true,
          status: true,
          providerId: true,
          sentAt: true,
          htmlBody: true,
          textBody: true,
          payload: true,
        },
        orderBy: { sentAt: 'desc' },
      })
    : [];
  const campaigns = await prisma.emailCampaign.findMany({
    where: detailed
      ? { id: id! }
      : customerId
        ? { recipients: { some: { userId: customerId } } }
        : undefined,
    include: {
      createdBy: { select: { name: true } },
      recipients: {
        where: customerId ? { userId: customerId } : undefined,
        include: {
          events: true,
          emailMessage: {
            select: { providerId: true, htmlBody: detailed, sentAt: true },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (detailed) {
    const c = campaigns[0];
    if (!c)
      return NextResponse.json(
        { error: 'Campaign unavailable' },
        { status: 404 },
      );
    return NextResponse.json({
      campaign: {
        ...c,
        legacyMessages,
        metrics: campaignMetrics(c.recipients, config),
      },
    });
  }
  if (customerId)
    return NextResponse.json({
      campaigns: campaigns.map((c) => ({
        ...c,
        metrics: campaignMetrics(c.recipients, config),
      })),
      settings: config,
    });
  const week = url.searchParams.get('week') || defaultWeek(new Date());
  const [templates, assets, suppressions, customers, schedule, outcomes] =
    await Promise.all([
      prisma.newsletterTemplate.findMany({ orderBy: { updatedAt: 'desc' } }),
      prisma.newsletterAsset.findMany({ orderBy: { createdAt: 'desc' } }),
      prisma.marketingSuppression.findMany({ orderBy: { createdAt: 'desc' } }),
      loadCustomers(config.engagementDays, true),
      loadSchedule(week),
      attributedOutcomes(),
    ]);
  return NextResponse.json({
    campaigns: campaigns.map((c) => ({
      ...c,
      legacyMessages:
        c.templateType === 'LEGACY'
          ? legacyMessages.filter(
              (m) =>
                (m.payload as { campaignId?: string })?.campaignId === c.id,
            )
          : [],
      metrics: campaignMetrics(c.recipients, config),
    })),
    templates,
    catalog: templateCatalog,
    assets,
    suppressions,
    customers,
    schedule,
    week,
    settings: config,
    outcomes,
    capture: captureEnabled(),
    health: {
      sender: process.env.EMAIL_FROM || '',
      providerConfigured: !!process.env.RESEND_API_KEY,
      webhookConfigured:
        !!process.env.RESEND_WEBHOOK_SECRET &&
        !!process.env.RESEND_RECEIVING_API_KEY,
      deliveryEnabled: process.env.NEWSLETTER_DELIVERY_ENABLED === 'true',
      origin: origin(),
    },
    actor: { id: actor.id, name: actor.name },
  });
}
const id = z.string().min(1).max(150),
  version = z.number().int().nonnegative();
const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    templateType: z.string().optional(),
    templateId: id.optional(),
    duplicateId: id.optional(),
    lastWeekly: z.boolean().optional(),
    name: z.string().max(200).optional(),
  }),
  z.object({
    action: z.literal('save'),
    id,
    version,
    name: z.string().min(1).max(200),
    subject: z.string().max(250),
    previewText: z.string().max(500),
    document: documentSchema,
    audience: audienceSchema,
    targetWeek: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    scheduleMode: z.enum(['AUTO', 'EXPLICIT']),
  }),
  z.object({
    action: z.literal('approve'),
    id,
    version,
    reviewHash: z.string().length(64),
    confirmation: z.enum(['CONFIRM & SEND NOW', 'CONFIRM & SCHEDULE']),
    localTime: z.string().optional(),
    timezone: z.string().default('America/New_York'),
    chosenUtc: z.string().optional(),
  }),
  z.object({ action: z.literal('cancel'), id }),
  z.object({ action: z.literal('archive'), id }),
  z.object({ action: z.literal('capture') }),
  z.object({
    action: z.literal('template'),
    id,
    name: z.string().min(1).max(200),
  }),
  z.object({ action: z.literal('duplicateTemplate'), id }),
  z.object({
    action: z.literal('saveTemplate'),
    id,
    version,
    name: z.string().min(1).max(200),
    subject: z.string().min(1).max(250),
    previewText: z.string().max(500),
    document: documentSchema,
  }),
  z.object({
    action: z.literal('test'),
    id,
    operationKey: z.string().uuid(),
    recipient: z.string().email(),
    confirmation: z.literal('SEND TEST EMAIL'),
  }),
  z.object({
    action: z.literal('settings'),
    version,
    replyTo: z.string().email(),
    postalAddress: z.string().min(10).max(600),
    googleReviewUrl: z.string().max(2000),
    engagementDays: z.number().int().min(1).max(365),
    attributionDays: z.number().int().min(1).max(30),
    opensSupported: z.boolean(),
    clicksSupported: z.boolean(),
  }),
  z.object({
    action: z.literal('suppress'),
    email: z.string().email(),
    reason: z.enum(['Admin suppression', 'Unsubscribed', 'Do not contact']),
  }),
  z.object({
    action: z.literal('consent'),
    userId: id,
    version,
    consent: z.enum(['OPTED_IN', 'OPTED_OUT', 'UNKNOWN']),
    evidence: z.string().min(10).max(500),
  }),
]);
export async function POST(request: Request) {
  if (!isTrustedAdminOrigin(request))
    return NextResponse.json(
      { error: 'Same-origin request required' },
      { status: 403 },
    );
  const actor = await newsletterActor();
  if (!actor)
    return NextResponse.json(
      { error: 'Admin access required' },
      { status: 403 },
    );
  try {
    const input = schema.parse(await request.json());
    let result: unknown;
    switch (input.action) {
      case 'create':
        result = await createCampaign(actor.id, input);
        break;
      case 'save':
        result = await saveCampaign(actor.id, input);
        break;
      case 'approve': {
        const sendAt =
          input.confirmation === 'CONFIRM & SCHEDULE'
            ? resolveSendTime(
                input.localTime || '',
                input.timezone,
                input.chosenUtc,
              )
            : undefined;
        result = await approveCampaign(
          actor.id,
          input.id,
          input.version,
          input.reviewHash,
          sendAt,
          input.timezone,
        );
        break;
      }
      case 'cancel':
        result = await cancelCampaign(actor.id, input.id);
        break;
      case 'archive':
        await prisma.emailCampaign.update({
          where: { id: input.id },
          data: { archivedAt: new Date() },
        });
        await audit(actor.id, 'ARCHIVED', input.id, {});
        result = { archived: true };
        break;
      case 'capture':
        if (!captureEnabled())
          throw Error(
            'Preview capture is available only on the isolated local database.',
          );
        result = await runNewsletterBatch();
        break;
      case 'template': {
        const c = await prisma.emailCampaign.findUniqueOrThrow({
          where: { id: input.id },
        });
        result = await prisma.newsletterTemplate.create({
          data: {
            name: input.name,
            type: c.templateType,
            document: json(documentSchema.parse(c.document)),
            subject: c.subject,
            previewText: c.previewText || '',
            createdById: actor.id,
          },
        });
        await audit(actor.id, 'TEMPLATE_CREATED', input.id, {});
        break;
      }
      case 'duplicateTemplate': {
        const t = await prisma.newsletterTemplate.findUniqueOrThrow({
          where: { id: input.id },
        });
        result = await prisma.newsletterTemplate.create({
          data: {
            name: t.name + ' · copy',
            type: t.type,
            document: t.document!,
            subject: t.subject,
            previewText: t.previewText,
            createdById: actor.id,
          },
        });
        await audit(actor.id, 'TEMPLATE_DUPLICATED', input.id, {});
        break;
      }
      case 'saveTemplate': {
        const r = await prisma.newsletterTemplate.updateMany({
          where: { id: input.id, version: input.version },
          data: {
            name: input.name,
            subject: input.subject,
            previewText: input.previewText,
            document: json(input.document),
            version: { increment: 1 },
          },
        });
        if (!r.count) throw Error('Template changed. Reload before saving.');
        await audit(actor.id, 'TEMPLATE_EDITED', input.id, {});
        result = { saved: true };
        break;
      }
      case 'test': {
        result = await sendNewsletterTest(actor, input);
        break;
      }
      case 'settings': {
        if (input.googleReviewUrl && !safeLink(input.googleReviewUrl))
          throw Error('Enter a valid review URL.');
        const { action, version, ...data } = input;
        void action;
        await prisma.$transaction(async (tx) => {
          const existing = await tx.newsletterSettings.findUnique({
            where: { id: 'studio' },
          });
          if (!existing && version === 0)
            await tx.newsletterSettings.create({
              data: { id: 'studio', ...data },
            });
          else {
            const r = await tx.newsletterSettings.updateMany({
              where: { id: 'studio', version },
              data: { ...data, version: { increment: 1 } },
            });
            if (!r.count) throw Error('Settings changed. Reload first.');
          }
          await audit(actor.id, 'SETTINGS_CHANGED', 'studio', {}, tx);
        });
        result = { saved: true };
        break;
      }
      case 'suppress': {
        const email = input.email.trim().toLowerCase();
        await prisma.marketingSuppression.upsert({
          where: { email },
          update: { reason: input.reason, source: 'Admin' },
          create: { email, reason: input.reason, source: 'Admin' },
        });
        await audit(actor.id, 'SUPPRESSION_CHANGED', null, {
          reason: input.reason,
        });
        result = { saved: true };
        break;
      }
      case 'consent': {
        await prisma.$transaction(async (tx) => {
          await tx.customerLeadProfile.upsert({
            where: { userId: input.userId },
            update: {},
            create: { userId: input.userId },
          });
          const r = await tx.customerLeadProfile.updateMany({
            where: { userId: input.userId, version: input.version },
            data: {
              consent: input.consent,
              consentSource: input.evidence,
              consentAt: new Date(),
              version: { increment: 1 },
            },
          });
          if (!r.count) throw Error('Customer changed. Reload first.');
          await audit(
            actor.id,
            'CONSENT_RECORDED',
            input.userId,
            { consent: input.consent, evidence: input.evidence },
            tx,
          );
        });
        result = { saved: true };
        break;
      }
    }
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? e.issues.map((i) => i.message).join(' ')
            : e instanceof Error
              ? e.message
              : 'Unable to complete action.',
      },
      { status: 400 },
    );
  }
}
