import { buildCheckoutWalletParameters } from '@/lib/payments/checkout-config';
import type Stripe from 'stripe';

export const RECOVERY_VERSION = 'somble-september-2026-v1';
export const RECOVERY_TEMPLATE = 'SOMBLE_BILLING_RECOVERY';
export const RECOVERY_SUBJECT =
  'Action needed: reconnect your Rhyze membership billing';
export type Recovery = Readonly<{
  userId: string;
  membershipId: string;
  email: string;
  firstName: string;
  legacySlug: string;
  legacyProductId: string | null;
  kind: 'LIMITED_MEMBERSHIP' | 'VIP';
  productId: string;
  productSlug: string;
  name: string;
  amountCents: number;
  day: 3 | 4;
  standardAccountId: string | null;
  legacyCreditAccountIds: readonly string[];
}>;
const recoveries: readonly Recovery[] = Object.freeze([
  Object.freeze({
    userId: 'cmryg3hyo000zw9wrhuigtu3y',
    membershipId: 'cms446vaw0069l709pi1gr4yo',
    email: 'jolielampkin@gmail.com',
    firstName: 'Jolie',
    legacySlug: 'somble-og-rhyze-tribe',
    legacyProductId: null,
    kind: 'LIMITED_MEMBERSHIP',
    productId: 'rhyze-og-tribe-private-2026',
    productSlug: 'og-rhyze-tribe-2026',
    name: 'OG Rhyze Tribe',
    amountCents: 9200,
    day: 3,
    standardAccountId: null,
    legacyCreditAccountIds: Object.freeze([
      'cmsoujv7l001dkz09yrcubhj5',
      'cmt0yghmx0066kz09qc535t15',
    ]),
  }),
  Object.freeze({
    userId: 'cmryg3hyn000uw9wrjgudtj7l',
    membershipId: 'cms446vbs006fl709vf1ay2ev',
    email: 'amyanjum2@gmail.com',
    firstName: 'Amy',
    legacySlug: 'vip-access-pass',
    legacyProductId: 'cmrykjq1b0003w9n37dqaaeh2',
    kind: 'VIP',
    productId: 'rhyze-founding-vip-private-2026',
    productSlug: 'founding-vip-private-2026',
    name: 'Founding VIP',
    amountCents: 19900,
    day: 4,
    standardAccountId: 'cmt0h9noi0009ji09he8j5j8r',
    legacyCreditAccountIds: Object.freeze([]),
  }),
  Object.freeze({
    userId: 'cmryg3hy70000w9wrszwya76i',
    membershipId: 'cms446vb4006bl709io10m50p',
    email: 'kimrusbach@gmail.com',
    firstName: 'Kim-Marie',
    legacySlug: 'vip-access-pass',
    legacyProductId: 'cmrykjq1b0003w9n37dqaaeh2',
    kind: 'VIP',
    productId: 'rhyze-founding-vip-private-2026',
    productSlug: 'founding-vip-private-2026',
    name: 'Founding VIP',
    amountCents: 19900,
    day: 3,
    standardAccountId: 'cmt0h9npe000eji095xlgjzde',
    legacyCreditAccountIds: Object.freeze([]),
  }),
]);
export function recoveryForUser(userId: string) {
  return recoveries.find((r) => r.userId === userId) ?? null;
}
export function recoveryPurchaseId(r: Recovery) {
  return `${RECOVERY_VERSION}:${r.membershipId}`;
}
export function recoveryVipMaintenance(
  membership: {
    userId: string;
    id: string;
    purchaseId: string | null;
    currentPeriodEnd: Date | null;
  },
  now: Date,
) {
  const r = recoveryForUser(membership.userId);
  // September's approved legacy benefits remain untouched, but these exact
  // unpaid recovery memberships must not gain another free calendar month.
  const awaitingRecovery = Boolean(
    r &&
    r.kind === 'VIP' &&
    membership.id === r.membershipId &&
    membership.purchaseId === null,
  );
  const recovered = Boolean(
    r &&
    r.kind === 'VIP' &&
    membership.id === r.membershipId &&
    membership.purchaseId === recoveryPurchaseId(r),
  );
  return {
    purchaseOwnsClasses: recovered,
    benefitsEligible: awaitingRecovery
      ? now < new Date('2026-10-01T04:00:00Z')
      : !recovered ||
        Boolean(
          membership.currentPeriodEnd && membership.currentPeriodEnd > now,
        ),
  };
}
export function recoveryPeriod(r: Recovery) {
  return {
    start: new Date(`2026-09-0${r.day}T04:00:00Z`),
    end: new Date(`2026-10-0${r.day}T16:00:00Z`),
  };
}
export type RecoveryMembership = {
  id: string;
  userId: string;
  purchaseId: string | null;
  stripeSubscriptionId: string | null;
  status: string;
  product: { id: string; slug: string; kind: string; billingInterval: string };
};
export function eligibleRecovery(
  user: { id: string; email: string },
  memberships: RecoveryMembership[],
  now = new Date(),
) {
  const r = recoveryForUser(user.id);
  if (
    !r ||
    user.email !== r.email ||
    now.getTime() >= recoveryPeriod(r).end.getTime() - 49 * 60 * 60 * 1000
  )
    return null;
  const current = memberships.filter(
    (m) =>
      ['ACTIVE', 'TRIALING', 'PAST_DUE', 'PAUSED'].includes(m.status) &&
      m.product.billingInterval !== 'ONE_TIME',
  );
  const m = current.find((m) => m.id === r.membershipId);
  if (
    current.length !== 1 ||
    !m ||
    m.status !== 'ACTIVE' ||
    m.userId !== r.userId ||
    m.purchaseId ||
    m.stripeSubscriptionId ||
    m.product.slug !== r.legacySlug ||
    m.product.kind !== r.kind ||
    (r.legacyProductId && m.product.id !== r.legacyProductId)
  )
    return null;
  return r;
}
export function recoveryCheckoutParams(
  r: Recovery,
  input: {
    customerId: string;
    purchaseId: string;
    origin: string;
    expiresAt: number;
  },
): Stripe.Checkout.SessionCreateParams {
  const metadata = {
    recovery: RECOVERY_VERSION,
    purchaseId: input.purchaseId,
    userId: r.userId,
    membershipId: r.membershipId,
    productId: r.productId,
  };
  const base = `${input.origin}/member/membership`;
  const plan = r.kind === 'VIP' ? '&plan=vip_access' : '';
  return {
    mode: 'subscription',
    ...buildCheckoutWalletParameters(),
    customer: input.customerId,
    client_reference_id: input.purchaseId,
    payment_method_types: ['card'],
    payment_method_collection: 'always',
    billing_address_collection: 'required',
    allow_promotion_codes: false,
    automatic_tax: { enabled: false },
    expires_at: input.expiresAt,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: r.amountCents,
          tax_behavior: 'inclusive',
          product_data: {
            name: `${r.name}: September ${r.day}–October ${r.day}, 2026 recovery`,
          },
        },
      },
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: r.amountCents,
          tax_behavior: 'inclusive',
          recurring: { interval: 'month' },
          product_data: {
            name: `${r.name}: monthly from October ${r.day}, 2026`,
          },
        },
      },
    ],
    metadata,
    subscription_data: {
      metadata,
      trial_end: recoveryPeriod(r).end.getTime() / 1000,
      trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
    },
    custom_text: {
      submit: {
        message: `Pay $${r.amountCents / 100} for September ${r.day}–October ${r.day} now. Authorize $${r.amountCents / 100} monthly beginning October ${r.day}. This is paid September recovery, not a free membership trial. August will not be charged again.`,
      },
    },
    success_url: `${base}?result=success${plan}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}?result=recovery-cancelled${plan}`,
  };
}
export function recoveryCreditConsumption(
  r: Recovery,
  entries: {
    creditAccountId: string;
    bookingId: string | null;
    quantity: number;
    startAt: Date;
  }[],
) {
  const period = recoveryPeriod(r);
  const balances = new Map<string, number>();
  for (const e of entries) {
    if (
      !e.bookingId ||
      !r.legacyCreditAccountIds.includes(e.creditAccountId) ||
      e.startAt < period.start ||
      e.startAt >= period.end
    )
      continue;
    balances.set(e.bookingId, (balances.get(e.bookingId) ?? 0) + e.quantity);
  }
  return [...balances.values()].reduce(
    (total, quantity) => total + Math.max(0, -quantity),
    0,
  );
}
