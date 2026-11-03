import 'server-only';
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { OWNER_UNLIMITED_PREFIX } from './owner-unlimited-access';

export async function grantOwnerUnlimitedAccess(tx: Prisma.TransactionClient, input: {
  actor: { id: string; role: string }; userId: string; validUntil: Date; reason: string; now?: Date;
}) {
  const now = input.now ?? new Date();
  const reason = input.reason.trim();
  if (input.actor.role !== 'OWNER' || !input.userId || reason.length < 5 || reason.length > 240 ||
    !Number.isFinite(input.validUntil.getTime()) || input.validUntil <= now ||
    input.validUntil.getTime() - now.getTime() > 366 * 86400000) throw Error('Invalid owner access grant');
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${input.userId} FOR UPDATE`;
  const user = await tx.user.findUnique({ where: { id: input.userId }, select: { status: true } });
  if (!user || user.status !== 'ACTIVE') throw Error('Member is not active');
  const id = OWNER_UNLIMITED_PREFIX + createHash('sha256').update(`${input.userId}:${input.validUntil.toISOString()}`).digest('hex').slice(0, 32);
  // Repeat submissions for the same member and expiry return the original audited grant.
  const existing = await tx.creditAccount.findUnique({ where: { id } });
  if (existing) return existing;
  const account = await tx.creditAccount.create({ data: {
    id, userId: input.userId, isUnlimited: true, validFrom: now, validUntil: input.validUntil,
    label: 'Owner-granted unlimited standard classes',
  } });
  await tx.creditLedgerEntry.create({ data: {
    creditAccountId: id, type: 'GRANT', quantity: 0, reason: `Owner-approved unlimited access: ${reason}`,
  } });
  await tx.auditLog.create({ data: {
    actorId: input.actor.id, action: 'credit.owner-unlimited-grant', entityType: 'User', entityId: input.userId,
    after: { creditAccountId: id, isUnlimited: true, validFrom: now.toISOString(), validUntil: input.validUntil.toISOString(), reason, paymentRecorded: false },
  } });
  return account;
}
