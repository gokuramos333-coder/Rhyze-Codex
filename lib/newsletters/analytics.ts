import { qualifyingCampaignLink } from './domain';
import { prisma } from '@/lib/db/prisma';
import { settings, origin } from './repository';
export type MetricRecipient = {
  id: string;
  status: string;
  acceptedAt: Date | null;
  events: {
    type: string;
    occurredAt: Date;
    automated: boolean | null;
    link: string | null;
    detail?: string | null;
  }[];
};
export function campaignMetrics(
  recipients: MetricRecipient[],
  capabilities: { opensSupported: boolean; clicksSupported: boolean },
) {
  const has = (r: MetricRecipient, type: string) =>
    r.events.some((e) => e.type === type);
  const delivered = recipients.filter((r) => has(r, 'email.delivered'));
  const opens = recipients.flatMap((r) =>
    r.events.filter((e) => e.type === 'email.opened'),
  );
  const clicks = recipients.flatMap((r) =>
    r.events.filter((e) => e.type === 'email.clicked'),
  );
  const openedDelivered = delivered.filter((r) =>
    has(r, 'email.opened'),
  ).length;
  const clickedDelivered = delivered.filter((r) =>
    has(r, 'email.clicked'),
  ).length;
  const opened = capabilities.opensSupported || opens.length > 0;
  const clicked = capabilities.clicksSupported || clicks.length > 0;
  const accepted = recipients.filter(
    (r) => r.acceptedAt || has(r, 'email.sent') || has(r, 'email.delivered'),
  ).length;
  const links = [...new Set(clicks.map((e) => e.link).filter(Boolean))]
    .map((link) => ({
      link,
      total: clicks.filter((e) => e.link === link).length,
      unique: recipients.filter((r) =>
        r.events.some((e) => e.type === 'email.clicked' && e.link === link),
      ).length,
    }))
    .sort((a, b) => b.total - a.total);
  return {
    selected: recipients.length,
    eligible: recipients.filter(
      (r) => !['EXCLUDED', 'CANCELLED'].includes(r.status),
    ).length,
    excluded: recipients.filter((r) => r.status === 'EXCLUDED').length,
    accepted,
    delivered: delivered.length,
    deliveryRate: accepted ? delivered.length / accepted : null,
    uniqueOpens: opened
      ? recipients.filter((r) => has(r, 'email.opened')).length
      : null,
    totalOpens: opened ? opens.length : null,
    repeatOpens: opened
      ? Math.max(
          0,
          opens.length -
            recipients.filter((r) => has(r, 'email.opened')).length,
        )
      : null,
    openRate:
      opened && delivered.length ? openedDelivered / delivered.length : null,
    openRateNumerator: opened ? openedDelivered : null,
    uniqueClicks: clicked
      ? recipients.filter((r) => has(r, 'email.clicked')).length
      : null,
    totalClicks: clicked ? clicks.length : null,
    clickRate:
      clicked && delivered.length ? clickedDelivered / delivered.length : null,
    clickRateNumerator: clicked ? clickedDelivered : null,
    unsubscribed: recipients.filter((r) => has(r, 'unsubscribe')).length,
    complaints: recipients.filter((r) => has(r, 'email.complained')).length,
    hardBounces: recipients.filter((r) =>
      r.events.some(
        (e) =>
          e.type === 'email.bounced' && e.detail?.toLowerCase() === 'permanent',
      ),
    ).length,
    otherBounces: recipients.filter((r) =>
      r.events.some(
        (e) =>
          e.type === 'email.bounced' && e.detail?.toLowerCase() !== 'permanent',
      ),
    ).length,
    softBounces: null,
    failed: recipients.filter(
      (r) => r.status === 'FAILED' || has(r, 'email.failed'),
    ).length,
    unknown: recipients.filter((r) => r.status === 'UNKNOWN').length,
    pending: recipients.filter(
      (r) =>
        ['QUEUED', 'RETRY', 'DISPATCHING', 'ACCEPTED'].includes(r.status) &&
        !has(r, 'email.delivered') &&
        !has(r, 'email.failed') &&
        !has(r, 'email.bounced'),
    ).length,
    captured: recipients.filter((r) => r.status === 'CAPTURED').length,
    automatedEvents: recipients
      .flatMap((r) => r.events)
      .filter((e) => e.automated === true).length,
    links,
    lastUpdated:
      recipients
        .flatMap((r) => r.events)
        .map((e) => new Date(e.occurredAt).toISOString())
        .sort()
        .at(-1) || null,
  };
}
export async function attributedOutcomes() {
  const config = await settings();
  const clicks = await prisma.newsletterEvent.findMany({
    where: {
      type: 'email.clicked',
      OR: [{ automated: false }, { automated: null }],
    },
    include: { recipient: { select: { userId: true, campaignId: true } } },
    orderBy: { occurredAt: 'desc' },
  });
  const ids = [
    ...new Set(
      clicks.map((c) => c.recipient.userId).filter((x): x is string => !!x),
    ),
  ];
  if (!ids.length) return [];
  const earliest = clicks.at(-1)!.occurredAt;
  const [bookings, purchases] = await Promise.all([
    prisma.booking.findMany({
      where: { userId: { in: ids }, bookedAt: { gte: earliest } },
      include: { occurrence: { include: { template: true } } },
    }),
    prisma.purchase.findMany({
      where: {
        userId: { in: ids },
        paidAt: { gte: earliest },
        status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
      },
      include: { product: true },
    }),
  ]);
  const outcomes = [
    ...bookings.map((b) => ({
      id: 'booking:' + b.id,
      userId: b.userId,
      date: b.bookedAt,
      kind: b.occurrence.template.isEvent ? 'Event booking' : 'Class booking',
      status: b.status,
      amountCents: null as number | null,
      net: b.status !== 'CANCELLED' && b.occurrence.status !== 'CANCELLED',
      path: 'schedule',
    })),
    ...purchases.map((p) => ({
      id: 'purchase:' + p.id,
      userId: p.userId,
      date: p.paidAt!,
      kind: ['MONTHLY_UNLIMITED', 'LIMITED_MEMBERSHIP', 'VIP'].includes(
        p.product.kind,
      )
        ? 'Membership purchase'
        : 'Completed purchase',
      status: p.status,
      amountCents: p.amountCents - p.refundedAmountCents,
      net: p.status !== 'REFUNDED',
      path: 'memberships',
    })),
  ];
  return outcomes.flatMap((o) => {
    const click = clicks.find(
      (c) =>
        c.recipient.userId === o.userId &&
        c.occurredAt <= o.date &&
        o.date.getTime() - c.occurredAt.getTime() <=
          config.attributionDays * 86400000 &&
        qualifyingCampaignLink(
          c.link,
          origin(),
          c.recipient.campaignId,
          o.path as 'schedule' | 'memberships',
        ),
    );
    return click
      ? [
          {
            ...o,
            campaignId: click.recipient.campaignId,
            clickAt: click.occurredAt,
            rule: `Last qualifying recorded click within ${config.attributionDays} days; not proof of causation`,
          },
        ]
      : [];
  });
}
