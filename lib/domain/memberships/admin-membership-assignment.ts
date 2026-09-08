import { z } from 'zod';
import { resolveAnalyticsRange } from '@/lib/admin/analytics-range';

const assignmentSchema = z.object({
  productId: z.string().min(1, 'Choose a membership plan.'),
  accessEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose an access end date.'),
  reason: z.string().trim().min(3, 'Enter the reason for this assignment.').max(240),
});

export function parseAdminMembershipAssignmentInput(
  input: Record<string, unknown>,
  now = new Date(),
) {
  const parsed = assignmentSchema.parse(input);
  const end = resolveAnalyticsRange({
    range: 'custom',
    from: parsed.accessEndDate,
    to: parsed.accessEndDate,
  }, now).end;
  if (end <= now) throw new Error('Choose a future access end date.');
  return { ...parsed, end };
}

export function assignedMembershipRecords(input: {
  actorId: string;
  userId: string;
  now: Date;
  end: Date;
  reason: string;
  product: {
    id: string;
    name: string;
    includedCredits: number | null;
    isUnlimited: boolean;
  };
}) {
  const assignment = {
    source: 'ADMIN_ASSIGNMENT',
    actorId: input.actorId,
    reason: input.reason,
    accessEndsAt: input.end.toISOString(),
  };
  return {
    purchase: {
      userId: input.userId,
      productId: input.product.id,
      amountCents: 0,
      status: 'PAID' as const,
      paidAt: input.now,
      policyAcceptance: assignment,
    },
    membership: {
      userId: input.userId,
      productId: input.product.id,
      status: 'ACTIVE' as const,
      currentPeriodStart: input.now,
      currentPeriodEnd: input.end,
      activatedAt: input.now,
    },
    creditAccount: {
      userId: input.userId,
      label: `${input.product.name} — admin assigned`,
      isUnlimited: input.product.isUnlimited,
      validFrom: input.now,
      validUntil: input.end,
    },
    grant: !input.product.isUnlimited && (input.product.includedCredits || 0) > 0
      ? {
          type: 'GRANT' as const,
          quantity: input.product.includedCredits!,
          reason: `Admin membership assignment: ${input.reason}`,
        }
      : null,
    audit: assignment,
  };
}
