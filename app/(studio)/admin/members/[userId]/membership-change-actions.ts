'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireApprovedOwner } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { getStripe, stripeIsConfigured } from '@/lib/payments/stripe';
import {
  quoteAdminPlanChange,
  confirmAdminPlanChange,
  reconcileAdminPlanChange,
} from '@/lib/payments/admin-plan-change';
import type { MembershipChangeResult } from '@/components/admin/AdminMembershipChangeForm';

const quoteInput = z.object({
  userId: z.string().min(1),
  membershipId: z.string().min(1),
  productId: z.string().min(1),
  timing: z.enum(['NOW', 'NEXT_RENEWAL', 'DATE']),
  date: z.string().default(''),
  monthlyPrice: z.string().optional(),
  discountDuration: z.string().optional(),
  discountMonths: z.string().optional(),
  discountReason: z.string().optional(),
  resetBillingCycle: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
});
export async function quoteMembershipChangeAction(
  data: FormData,
): Promise<MembershipChangeResult> {
  const actor = await requireApprovedOwner();
  if (!stripeIsConfigured())
    return {
      error:
        'Stripe is not connected in this local preview. No membership or payment was changed.',
    };
  const parsed = quoteInput.safeParse({
    ...Object.fromEntries(data),
    date: String(data.get('date') || ''),
  });
  if (!parsed.success) return { error: 'Choose a membership and start date.' };
  try {
    const record = await quoteAdminPlanChange(prisma, getStripe(), {
      ...parsed.data,
      actorId: actor.id,
    });
    const quote = record.quote as {
      toName: string;
      chargeCents: number;
      creditCents: number;
      monthlyCents: number;
    };
    return {
      quote: {
        ...quote,
        id: record.id,
        effectiveAt: record.effectiveAt.toISOString(),
        renewalAt: record.periodEnd.toISOString(),
        timing: record.timing,
      },
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Could not retrieve a Stripe quote. No membership was changed.',
    };
  }
}
export async function confirmMembershipChangeAction(
  data: FormData,
): Promise<MembershipChangeResult> {
  const actor = await requireApprovedOwner();
  if (!stripeIsConfigured())
    return {
      error:
        'Stripe is not connected in this local preview. No membership or payment was changed.',
    };
  const parsed = z
    .object({ quoteId: z.string().min(1), userId: z.string().min(1) })
    .safeParse(Object.fromEntries(data));
  if (!parsed.success)
    return { error: 'Review a membership change before confirming.' };
  try {
    const record = await confirmAdminPlanChange(prisma, getStripe(), {
      ...parsed.data,
      actorId: actor.id,
      replaceExistingDiscount: data.get('replaceExistingDiscount') === 'true',
    });
    revalidatePath(`/admin/members/${parsed.data.userId}`);
    revalidatePath('/member/membership');
    revalidatePath('/member');
    revalidatePath('/admin/payments');
    if (record.lastError)
      return {
        error:
          'This saved change needs a Stripe review. Do not submit a duplicate.',
        status: record.status,
      };
    return {
      status: record.status,
      message:
        record.status === 'APPLIED'
          ? (record.quote as { resetBillingCycle?: boolean }).resetBillingCycle
            ? 'Membership updated. A new paid month starts today.'
            : 'Membership updated. The renewal date is unchanged.'
          : record.status === 'SCHEDULED'
            ? 'Membership change scheduled in Stripe. The current plan remains active until the start date and successful payment.'
            : record.status === 'AWAITING_PAYMENT'
              ? 'Waiting for Stripe payment confirmation. The current paid plan remains in place; upgraded access has not been granted.'
              : 'This change is being verified. Refresh the client before taking another billing action.',
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'The change could not be verified. Check Stripe before retrying.',
    };
  }
}

export async function reconcileMembershipChangeAction(
  data: FormData,
): Promise<MembershipChangeResult> {
  const actor = await requireApprovedOwner();
  if (!stripeIsConfigured())
    return { error: 'Stripe is not connected in this preview.' };
  const parsed = z
    .object({ quoteId: z.string().min(1), userId: z.string().min(1) })
    .safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: 'Saved change not found.' };
  try {
    const record = await reconcileAdminPlanChange(prisma, getStripe(), {
      ...parsed.data,
      actorId: actor.id,
    });
    revalidatePath(`/admin/members/${parsed.data.userId}`);
    return {
      status: record.status,
      message: `Saved change verified: ${record.status.replaceAll('_', ' ').toLowerCase()}. No second change was created.`,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Manual Stripe review required.',
    };
  }
}
