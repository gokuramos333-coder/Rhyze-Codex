import { beforeEach, describe, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({
  user: { id: 'cmryg3hyo000zw9wrhuigtu3y', email: 'jolielampkin@gmail.com' },
  waiver: null as any,
  checkoutCalls: [] as any[],
  invitationCalls: [] as any[],
}));
vi.mock('@/lib/auth/session', () => ({
  requireArea: async () => f.user,
  requireApprovedOwner: async () => ({
    id: 'owner',
    email: 'owner@example.com',
  }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    product: {
      findFirst: async () => ({
        id: 'public',
        slug: 'vip-access-pass',
        kind: 'VIP',
        billingInterval: 'MONTHLY',
        isPublic: true,
        isActive: true,
        alwaysAvailable: true,
      }),
    },
    user: {
      findUnique: async () => ({
        memberships: [
          {
            id: 'cms446vaw0069l709pi1gr4yo',
            purchaseId: null,
            stripeSubscriptionId: null,
          },
        ],
      }),
    },
    waiverVersion: { findFirst: async () => ({ id: 'waiver1' }) },
    waiverAcceptance: { findUnique: async () => f.waiver },
    $transaction: async (fn: any) => fn({}),
  },
}));
vi.mock('@/lib/payments/stripe', () => ({
  getStripe: () => ({}),
  stripeIsConfigured: () => true,
}));
vi.mock('@/lib/payments/somble-recovery-checkout', () => ({
  startSombleRecoveryCheckout: async (...args: any[]) => {
    f.checkoutCalls.push(args[2]);
    return 'https://checkout.stripe.com/recovery';
  },
}));
vi.mock('@/lib/notifications/somble-recovery-invitation', () => ({
  queueSombleRecoveryInvitation: async (...args: any[]) => {
    f.invitationCalls.push(args[1]);
    return { id: 'queued' };
  },
}));
import {
  startCheckoutAction,
  startSombleRecoveryAction,
} from '@/app/(portal)/member/membership/actions';
import { sendSombleRecoveryInvitationAction } from '@/app/(studio)/admin/members/[userId]/actions';
beforeEach(() => {
  f.checkoutCalls = [];
  f.invitationCalls = [];
  f.waiver = null;
});
describe('recovery action authorization boundaries', () => {
  it('blocks generic recurring checkout for a legacy recovery member', async () => {
    const form = new FormData();
    form.set('productId', 'public');
    await expect(startCheckoutAction(form)).rejects.toThrow(
      /recovery-required/,
    );
    expect(f.checkoutCalls).toHaveLength(0);
  });
  it('requires the existing signed waiver before provider setup', async () => {
    const form = new FormData();
    form.set('membershipId', 'cms446vaw0069l709pi1gr4yo');
    form.set('recurringConsent', 'on');
    await expect(startSombleRecoveryAction(form)).rejects.toThrow(
      /redirect:.*waiver/,
    );
    expect(f.checkoutCalls).toHaveLength(0);
  });
  it('does not accept a different member recovery ID from the posted form', async () => {
    f.waiver = { id: 'accepted' };
    const form = new FormData();
    form.set('membershipId', 'cms446vbs006fl709vf1ay2ev');
    form.set('recurringConsent', 'on');
    await expect(startSombleRecoveryAction(form)).rejects.toThrow(
      /recovery-unavailable/,
    );
    expect(f.checkoutCalls).toHaveLength(0);
  });
  it('passes authenticated identity and explicit consent, never a posted identity/origin', async () => {
    f.waiver = { id: 'accepted' };
    process.env.NEXT_PUBLIC_APP_URL = 'https://rhyzefit.com';
    const form = new FormData();
    form.set('membershipId', 'cms446vaw0069l709pi1gr4yo');
    form.set('recurringConsent', 'on');
    form.set('userId', 'attacker');
    form.set('origin', 'https://evil.test');
    await expect(startSombleRecoveryAction(form)).rejects.toThrow(
      'redirect:https://checkout.stripe.com/recovery',
    );
    expect(f.checkoutCalls[0]).toMatchObject({
      userId: f.user.id,
      consent: true,
      origin: 'https://rhyzefit.com',
    });
  });
  it('queues only through an explicit approved-owner action', async () => {
    const form = new FormData();
    form.set('userId', f.user.id);
    await expect(sendSombleRecoveryInvitationAction(form)).rejects.toThrow(
      /sent=recovery/,
    );
    expect(f.invitationCalls[0]).toMatchObject({
      userId: f.user.id,
      actor: { id: 'owner', email: 'owner@example.com' },
    });
  });
});
