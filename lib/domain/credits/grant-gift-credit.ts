import 'server-only';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { strictStudioStart } from '@/lib/domain/schedule/edit-upcoming';
import {
  GIFT_CREDIT_PREFIX,
  GIFT_REASON_PREFIX,
  giftKindLabels,
} from './gift-credit';
export const giftCreditInput = z.object({
  userId: z.string().min(1),
  requestId: z.string().uuid(),
  kind: z.enum(['CLASS', 'EVENT', 'BOTH']),
  occasion: z.enum(['Birthday', 'Milestone', 'Other']),
  reason: z.string().trim().min(3).max(200),
  expirationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export function giftExpiration(date: string) {
  // Validate the selected day first, then resolve the following midnight in NJ.
  strictStudioStart(date + 'T12:00');
  const next = new Date(date + 'T12:00:00Z');
  next.setUTCDate(next.getUTCDate() + 1);
  return strictStudioStart(next.toISOString().slice(0, 10) + 'T00:00');
}
export async function grantGiftCredit(
  tx: Prisma.TransactionClient,
  input: z.infer<typeof giftCreditInput>,
  actorId: string,
  now = new Date(),
) {
  const value = giftCreditInput.parse(input);
  const actor = await tx.user.findUnique({
    where: { id: actorId },
    select: { role: true, status: true },
  });
  if (
    !actor ||
    actor.status !== 'ACTIVE' ||
    !['OWNER', 'ADMIN', 'MANAGER'].includes(actor.role)
  )
    throw Error('Gift permission required');
  const validUntil = giftExpiration(value.expirationDate);
  const id = `${GIFT_CREDIT_PREFIX}${value.kind}:${value.requestId}`;
  const reason = `${value.occasion}: ${value.reason}`;
  // Serializes concurrent gifts and existing booking entitlement writes for this member.
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${value.userId} FOR UPDATE`;
  const member = await tx.user.findUnique({
    where: { id: value.userId },
    select: { status: true },
  });
  if (!member || member.status !== 'ACTIVE')
    throw Error('Member is not active');
  // Request key is independent of the kind, so changed terms cannot create another credit.
  const key = `gift-grant:${value.requestId}`;
  const prior = await tx.creditLedgerEntry.findUnique({
    where: { sourceReturnKey: key },
    include: { creditAccount: true },
  });
  if (prior) {
    if (
      prior.creditAccount.id !== id ||
      prior.creditAccount.userId !== value.userId ||
      +prior.creditAccount.validUntil! !== +validUntil ||
      prior.reason !== GIFT_REASON_PREFIX + reason
    )
      throw Error('Gift request already used with different terms');
    return prior.creditAccount;
  }
  if (validUntil <= now) throw Error('Gift expiration must be today or later');
  const account = await tx.creditAccount.create({
    data: {
      id,
      userId: value.userId,
      label: `${value.kind === 'CLASS' ? 'Class' : 'Event'} credit — Gift (${giftKindLabels[value.kind]})`,
      isUnlimited: false,
      validFrom: now,
      validUntil,
    },
  });
  await tx.creditLedgerEntry.create({
    data: {
      creditAccountId: id,
      type: 'GRANT',
      quantity: 1,
      sourceReturnKey: key,
      reason: GIFT_REASON_PREFIX + reason,
    },
  });
  await tx.auditLog.create({
    data: {
      actorId,
      action: 'credit.gift-grant',
      entityType: 'User',
      entityId: value.userId,
      after: {
        creditAccountId: id,
        kind: value.kind,
        quantity: 1,
        reason,
        expirationDate: value.expirationDate,
        validUntil: validUntil.toISOString(),
        paymentRecorded: false,
      },
    },
  });
  return account;
}
