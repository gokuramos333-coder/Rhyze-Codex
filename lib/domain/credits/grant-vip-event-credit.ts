import type { Prisma } from '@prisma/client';
import type { VipMonthlyBenefitWindow } from './vip-monthly-benefits';

// Caller must establish a paid VIP entitlement. Shared deterministic identity
// prevents the paid-upgrade handler and monthly job from granting twice.
export async function grantVipEventCredit(
  tx: Pick<Prisma.TransactionClient, 'creditAccount'>,
  userId: string,
  window: VipMonthlyBenefitWindow,
) {
  // A legacy grant may have used a fixed UTC offset; the calendar-month
  // label still identifies the same benefit, even after timezone correction.
  const existing = await tx.creditAccount.findFirst({
    where: {
      userId,
      label: window.eventCreditLabel,
    },
    select: { id: true },
  });
  if (existing) return false;
  await tx.creditAccount.upsert({
    where: { id: `vip-event:${userId}:${window.key}` },
    update: {},
    create: {
      id: `vip-event:${userId}:${window.key}`,
      userId,
      label: window.eventCreditLabel,
      validFrom: window.validFrom,
      validUntil: window.validUntil,
      entries: {
        create: { type: 'GRANT', quantity: 1, reason: window.eventGrantReason },
      },
    },
  });
  return true;
}
