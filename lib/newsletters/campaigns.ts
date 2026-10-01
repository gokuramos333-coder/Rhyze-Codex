import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  audienceSchema,
  blockSchema,
  documentSchema,
  defaultWeek,
  resolveAudience,
  validateContent,
  materialChanges,
  type ScheduleItem,
} from './domain';
import {
  audit,
  captureEnabled,
  json,
  loadCustomers,
  loadSchedule,
  origin,
  settings,
} from './repository';
import { renderNewsletter } from './render';
import { templateCatalog } from './templates';
import { campaignDeletionBlock, deletableCampaignStatuses } from './deletion';

export async function campaignReview(id: string, sendAt?: Date) {
  const campaign = await prisma.emailCampaign.findUniqueOrThrow({
    where: { id },
  });
  const document = documentSchema.parse(campaign.document);
  const audience = audienceSchema.parse(campaign.audience);
  const config = await settings();
  const planned = sendAt || campaign.scheduledFor || new Date();
  const targetWeek =
    campaign.scheduleMode === 'AUTO'
      ? defaultWeek(planned)
      : campaign.targetWeek || defaultWeek(planned);
  const schedule = await loadSchedule(
    targetWeek,
    document.blocks.flatMap((b) => (b.occurrenceId ? [b.occurrenceId] : [])),
  );
  const recipients = resolveAudience(
    await loadCustomers(audience.days, true),
    audience,
  );
  const sender = process.env.EMAIL_FROM || '';
  const errors = validateContent({
    subject: campaign.subject,
    document,
    type: campaign.templateType,
    schedule,
    sender: captureEnabled() ? 'Local capture (no delivery)' : sender,
    replyTo: config.replyTo,
    postalAddress: config.postalAddress,
    googleReviewUrl: config.googleReviewUrl,
    now: new Date(Math.max(Date.now(), planned.getTime())),
  });
  const imageUrls = document.blocks
    .filter((b) => b.type === 'image' && b.url)
    .map((b) => b.url);
  if (imageUrls.length) {
    const approvedAssets = await prisma.newsletterAsset.findMany({
      where: { url: { in: imageUrls } },
      select: { url: true },
    });
    if (
      imageUrls.some(
        (url) => !approvedAssets.some((asset) => asset.url === url),
      )
    )
      errors.push(
        'Use uploaded newsletter-library images so the approved image is retained with the campaign.',
      );
  }
  if (campaign.templateType === 'OFFER' && !document.deadline)
    errors.push('Add the approved offer expiration.');
  if (!recipients.eligible.length) errors.push('No eligible recipients.');
  if (!captureEnabled() && process.env.NEWSLETTER_DELIVERY_ENABLED !== 'true')
    errors.push(
      'Newsletter delivery is disabled pending release approval and provider setup.',
    );
  const snapshot = {
    origin: origin(),
    subject: campaign.subject,
    previewText: campaign.previewText || '',
    document,
    audience,
    targetWeek,
    schedule,
    sender: sender || 'Preview capture',
    replyTo: config.replyTo,
    postalAddress: config.postalAddress,
    templateType: campaign.templateType,
    version: campaign.version,
    configVersion: config.version,
  };
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        snapshot,
        eligible: recipients.eligible.map((x) => x.email).sort(),
        planned: sendAt?.toISOString() || null,
      }),
    )
    .digest('hex');
  const preview = renderNewsletter({
    ...snapshot,
    origin: origin(),
    unsubscribeUrl: origin() + '/newsletter/unsubscribe/preview',
    campaignId: id,
  });
  return {
    campaign,
    snapshot,
    recipients,
    errors,
    hash,
    preview,
    capture: captureEnabled(),
  };
}
export async function createCampaign(
  actorId: string,
  input: {
    templateType?: string;
    templateId?: string;
    duplicateId?: string;
    lastWeekly?: boolean;
    name?: string;
  },
) {
  const source = input.duplicateId
    ? await prisma.emailCampaign.findUniqueOrThrow({
        where: { id: input.duplicateId },
      })
    : input.lastWeekly
      ? await prisma.emailCampaign.findFirst({
          where: { templateType: 'WEEKLY', status: 'SENT' },
          orderBy: { sentAt: 'desc' },
        })
      : null;
  const master = input.templateId
    ? await prisma.newsletterTemplate.findUniqueOrThrow({
        where: { id: input.templateId },
      })
    : null;
  const starter =
    templateCatalog.find(
      (t) => t.type === (input.lastWeekly ? 'WEEKLY' : input.templateType),
    ) || templateCatalog[0];
  const document = documentSchema.parse(
    (source && !source.document
      ? {
          ...starter.document,
          blocks: [
            blockSchema.parse({
              id: 'legacy-heading',
              type: 'heading',
              text: source.subject,
              fontSize: 32,
            }),
            blockSchema.parse({
              id: 'legacy-copy',
              type: 'text',
              text: source.body,
            }),
          ],
        }
      : source?.document) ||
      master?.document ||
      starter.document,
  );
  // A draft copy keeps editable design but never approval, jobs, recipients or analytics.
  const targetWeek = defaultWeek(new Date());
  const c = await prisma.emailCampaign.create({
    data: {
      createdById: actorId,
      name:
        input.name ||
        `${source?.name || master?.name || starter.name}${source ? ' · copy' : ''}`,
      subject: source?.subject || master?.subject || starter.subject,
      previewText:
        source?.previewText || master?.previewText || starter.previewText,
      body: '',
      segment: 'NEWSLETTER_V1',
      templateType:
        (source?.templateType === 'LEGACY'
          ? 'ANNOUNCEMENT'
          : source?.templateType) ||
        master?.type ||
        starter.type,
      document: json(document),
      audience: source?.audience || json({ groups: ['ALL'], days: 30 }),
      targetWeek,
      holdReason: source
        ? 'Review manually written dates and offers in this new draft.'
        : null,
    },
  });
  await audit(actorId, 'CREATED', c.id, {
    sourceId: source?.id,
    templateId: master?.id,
  });
  return c;
}
export async function saveCampaign(
  actorId: string,
  input: {
    id: string;
    version: number;
    name: string;
    subject: string;
    previewText: string;
    document: unknown;
    audience: unknown;
    targetWeek: string;
    scheduleMode: string;
  },
) {
  const document = documentSchema.parse(input.document);
  const audience = audienceSchema.parse(input.audience);
  return prisma.$transaction(async (tx) => {
    const c = await tx.emailCampaign.findUniqueOrThrow({
      where: { id: input.id },
    });
    if (
      c.sentSnapshot ||
      ['SENDING', 'SENT', 'PARTIALLY_SENT'].includes(c.status)
    )
      throw Error(
        'Sent content is immutable. Duplicate this campaign to edit.',
      );
    const result = await tx.emailCampaign.updateMany({
      where: {
        id: c.id,
        version: input.version,
        sentSnapshot: { equals: Prisma.DbNull },
        status: {
          in: ['DRAFT', 'SCHEDULED', 'NEEDS_REVIEW', 'CANCELLED', 'FAILED'],
        },
      },
      data: {
        name: input.name,
        subject: input.subject,
        previewText: input.previewText,
        document: json(document),
        audience: json(audience),
        targetWeek: input.targetWeek,
        scheduleMode: input.scheduleMode,
        version: { increment: 1 },
        status: c.status === 'SCHEDULED' ? 'NEEDS_REVIEW' : 'DRAFT',
        approvedAt: null,
        approvedById: null,
        approvedVersion: null,
        approvedSnapshot: Prisma.DbNull,
        holdReason:
          c.status === 'SCHEDULED'
            ? 'Content or audience changed. Reconfirm to schedule.'
            : null,
      },
    });
    if (!result.count)
      throw Error('Another admin changed this draft. Reload before saving.');
    await audit(
      actorId,
      'EDITED',
      c.id,
      { version: input.version + 1, reapprovalRequired: true },
      tx,
    );
    return tx.emailCampaign.findUniqueOrThrow({ where: { id: c.id } });
  });
}
export async function approveCampaign(
  actorId: string,
  id: string,
  version: number,
  reviewHash: string,
  sendAt?: Date,
  timezone = 'America/New_York',
) {
  const review = await campaignReview(id, sendAt);
  if (review.hash !== reviewHash)
    throw Error(
      'The content, schedule or audience changed. Review the refreshed preview.',
    );
  if (review.errors.length) throw Error(review.errors.join(' '));
  const result = await prisma.emailCampaign.updateMany({
    where: {
      id,
      version,
      status: { in: ['DRAFT', 'SCHEDULED', 'NEEDS_REVIEW', 'CANCELLED'] },
      sentSnapshot: { equals: Prisma.DbNull },
    },
    data: {
      status: 'SCHEDULED',
      timezone,
      scheduledFor: sendAt || new Date(),
      approvedAt: new Date(),
      approvedById: actorId,
      approvedVersion: version + 1,
      version: { increment: 1 },
      approvedSnapshot: json(review.snapshot),
      holdReason: null,
      targetWeek: review.snapshot.targetWeek,
    },
  });
  if (!result.count)
    throw Error('Campaign changed or delivery already started.');
  await audit(actorId, 'APPROVED', id, {
    version,
    sendAt: sendAt?.toISOString() || 'NOW',
    eligible: review.recipients.eligible.length,
    capture: review.capture,
  });
  return { scheduled: true };
}
export async function deleteCampaign(
  actorId: string,
  id: string,
  version: number,
) {
  return prisma.$transaction(async (tx) => {
    const c = await tx.emailCampaign.findUnique({
      where: { id },
      include: { _count: { select: { recipients: true } } },
    });
    if (!c)
      throw Error('Campaign unavailable. It may already have been deleted.');
    const blocked = campaignDeletionBlock({
      ...c,
      recipientCount: Math.max(c.recipientCount, c._count.recipients),
    });
    if (blocked) throw Error(blocked);
    // The predicates also protect against edits/approval/dispatch after the read.
    // Recipient foreign keys are restrictive; no delivery records are cascaded.
    const result = await tx.emailCampaign.deleteMany({
      where: {
        id,
        version,
        status: { in: [...deletableCampaignStatuses] },
        templateType: { not: 'LEGACY' },
        sentSnapshot: { equals: Prisma.DbNull },
        sentAt: null,
        recipientCount: 0,
        recipients: { none: {} },
      },
    });
    if (!result.count) throw Error('Campaign changed. Reload before deleting.');
    await audit(
      actorId,
      'DELETED',
      id,
      {
        name: c.name,
        status: c.status,
        version: c.version,
      },
      tx,
    );
    return { deleted: true };
  });
}

export async function cancelCampaign(actorId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const c = await tx.emailCampaign.findUniqueOrThrow({ where: { id } });
    if (c.status === 'SENT')
      throw Error('Already sent. Messages cannot be recalled.');
    await tx.emailCampaign.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        approvedAt: null,
        version: { increment: 1 },
        holdReason:
          'Cancelled. Already-dispatched messages cannot be recalled.',
      },
    });
    await tx.newsletterRecipient.updateMany({
      where: { campaignId: id, status: { in: ['QUEUED', 'RETRY'] } },
      data: { status: 'CANCELLED' },
    });
    await audit(
      actorId,
      'CANCELLED',
      id,
      {
        alreadyDispatched: await tx.newsletterRecipient.count({
          where: { campaignId: id, acceptedAt: { not: null } },
        }),
      },
      tx,
    );
    return { cancelled: true };
  });
}
export async function prepareCampaign(id: string) {
  const c = await prisma.emailCampaign.findUniqueOrThrow({ where: { id } });
  if (c.sentSnapshot) return;
  if (c.status !== 'SCHEDULED' || c.approvedVersion !== c.version) return;
  const r = await campaignReview(id);
  const approved = c.approvedSnapshot as unknown as {
    schedule: ScheduleItem[];
    configVersion: number;
    sender: string;
    origin: string;
  };
  const changes = materialChanges(approved.schedule || [], r.snapshot.schedule);
  const errors = [
    ...r.errors,
    ...changes,
    ...(approved.configVersion !== r.snapshot.configVersion ||
    approved.sender !== r.snapshot.sender ||
    approved.origin !== r.snapshot.origin
      ? ['Sender/settings changed since approval.']
      : []),
  ];
  if (errors.length) {
    const held = await prisma.emailCampaign.updateMany({
      where: { id, version: c.version, status: 'SCHEDULED' },
      data: { status: 'NEEDS_REVIEW', holdReason: errors.join(' ') },
    });
    if (!held.count) return;
    await audit(null, 'HELD', id, { reasons: errors });
    const owners = await prisma.user.findMany({
      where: { role: 'OWNER', status: 'ACTIVE' },
      select: { id: true },
    });
    for (const owner of owners)
      await prisma.inAppNotification.upsert({
        where: { dedupeKey: `newsletter-held:${id}:${c.version}:${owner.id}` },
        create: {
          userId: owner.id,
          title: 'Newsletter needs review',
          body: errors.join(' ').slice(0, 500),
          link: '/admin/newsletters',
          dedupeKey: `newsletter-held:${id}:${c.version}:${owner.id}`,
        },
        update: {},
      });
    return;
  }
  await prisma.$transaction(
    async (tx) => {
      const claim = await tx.emailCampaign.updateMany({
        where: {
          id,
          version: c.version,
          status: 'SCHEDULED',
          sentSnapshot: { equals: Prisma.DbNull },
        },
        data: {
          status: 'SENDING',
          sentSnapshot: json(r.snapshot),
          recipientCount: r.recipients.eligible.length,
        },
      });
      if (!claim.count) return;
      for (const entry of r.recipients.entries) {
        await tx.newsletterRecipient.upsert({
          where: { campaignId_email: { campaignId: id, email: entry.email } },
          update: {},
          create: {
            campaignId: id,
            email: entry.email,
            userId: entry.customer.id.startsWith('subscriber:')
              ? null
              : entry.customer.id,
            firstName:
              entry.customer.name === 'Newsletter subscriber'
                ? null
                : entry.customer.name.split(' ')[0],
            membershipAtSend: entry.customer.membership,
            status: entry.reason ? 'EXCLUDED' : 'QUEUED',
            exclusionReason: entry.reason,
          },
        });
      }
      await audit(
        null,
        'SNAPSHOT_FROZEN',
        id,
        {
          eligible: r.recipients.eligible.length,
          excluded: r.recipients.excluded.length,
        },
        tx,
      );
    },
    { timeout: 30000 },
  );
}
