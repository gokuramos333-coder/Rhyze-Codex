import { approvedOwnerEmails } from '@/lib/auth/owner-access';
import type { Prisma } from '@prisma/client';
import { queueEmail } from '@/lib/notifications/email-queue';

/** All membership invoice handlers share one transactional, invoice-scoped notice. */
export async function queuePaymentFailureEmail(
  tx: Prisma.TransactionClient,
  user: { id: string; email: string; name: string | null },
  invoice: {
    id: string;
    status?: string | null;
    amount_due?: number;
    amount_remaining?: number;
    currency?: string;
  },
) {
  const amountCents = invoice.amount_remaining ?? invoice.amount_due;
  // Hydrated invoice state can already be paid when an older failure is delivered.
  if (
    invoice.status !== 'open' ||
    !Number.isSafeInteger(amountCents) ||
    Number(amountCents) <= 0
  )
    return;
  const settled = await tx.paymentRecord.findUnique({
    where: { stripeInvoiceId: invoice.id },
    select: { status: true },
  });
  if (
    settled &&
    ['SUCCEEDED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED'].includes(
      settled.status,
    )
  )
    return;
  await queueEmail(tx, {
    userId: user.id,
    to: user.email,
    subject: 'Your Rhyze payment needs attention',
    template: 'PAYMENT_FAILED',
    dedupeKey: `payment-failed:${invoice.id}`,
    payload: {
      name: user.name || 'Rhyzer',
      amountCents: Number(amountCents),
      currency: invoice.currency || 'usd',
      billingUrl: '/sign-in?callbackUrl=%2Fmember%2Fbilling',
    },
  });

  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: (invoice.currency || 'usd').toUpperCase(),
  }).format(Number(amountCents) / 100);
  const memberName = user.name || user.email;
  const adminUrl = `/admin/members/${user.id}#payment-history`;
  const title = `Membership payment failed: ${memberName}`;
  const admins = await tx.user.findMany({
    where: {
      role: 'OWNER',
      status: 'ACTIVE',
      email: { in: approvedOwnerEmails(), mode: 'insensitive' },
    },
    select: { id: true },
  });
  if (admins.length)
    await tx.inAppNotification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        title,
        body: `${memberName}'s membership payment of ${amount} did not go through. Review their billing before retrying.`,
        link: adminUrl,
        dedupeKey: `payment-failed-admin:${invoice.id}:${admin.id}`,
      })),
      skipDuplicates: true,
    });
  for (const to of ['melissa@rhyzefit.com', 'vanessa@rhyzefit.com']) {
    await queueEmail(tx, {
      to,
      subject: `${title} — ${amount}`,
      template: 'ADMIN_PAYMENT_FAILED',
      dedupeKey: `payment-failed-admin:${invoice.id}:${to}`,
      payload: {
        memberName,
        memberEmail: user.email,
        amount,
        invoiceId: invoice.id,
        adminUrl,
      },
    });
  }
}
