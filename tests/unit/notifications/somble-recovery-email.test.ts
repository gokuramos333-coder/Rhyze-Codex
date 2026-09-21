import { describe, expect, it } from 'vitest';
import { renderTransactionalEmail } from '@/lib/notifications/email-content';
import { queueSombleRecoveryInvitation } from '@/lib/notifications/somble-recovery-invitation';

describe('approved Somble billing recovery invitation', () => {
  it('renders the reviewed apology, founding amounts, eight-class allowance and secure CTA', () => {
    const email = renderTransactionalEmail({
      subject: 'Action needed: reconnect your Rhyze membership billing',
      template: 'SOMBLE_BILLING_RECOVERY',
      payload: {
        firstName: 'Jolie',
        amount: '$92',
        day: '3',
        ordinal: '3rd',
        planName: 'OG Rhyze Tribe',
        benefits: 'Your eight-class monthly allowance remains connected.',
        recoveryUrl: '/member/membership?recovery=cms446vaw0069l709pi1gr4yo',
      },
    });
    expect(email.text).toContain('Hi Jolie,');
    expect(email.text).toContain("We're sorry for the inconvenience.");
    expect(email.text).toContain('Your August payment of $92 is recorded.');
    expect(email.text).toContain('Your September 3 renewal was not charged.');
    expect(email.text).toContain('September 3–October 3');
    expect(email.text).toContain(
      'on the 3rd of each month, beginning October 3',
    );
    expect(email.text).toContain('eight-class monthly allowance');
    expect(email.html).toContain('Complete my membership billing setup');
    expect(email.text).toContain('not be charged again for August');
  });
  it('queues once through the existing outbox and approves only the exact recovery template with audit', async () => {
    const state: any = { email: null, reviews: [], audits: [] };
    const tx: any = {
      user: {
        findUnique: async () => ({
          id: 'cmryg3hyn000uw9wrjgudtj7l',
          email: 'amyanjum2@gmail.com',
          memberships: [
            {
              id: 'cms446vbs006fl709vf1ay2ev',
              userId: 'cmryg3hyn000uw9wrjgudtj7l',
              status: 'ACTIVE',
              purchaseId: null,
              stripeSubscriptionId: null,
              product: {
                id: 'cmrykjq1b0003w9n37dqaaeh2',
                slug: 'vip-access-pass',
                kind: 'VIP',
                billingInterval: 'MONTHLY',
              },
            },
          ],
        }),
      },
      emailTemplateReview: {
        upsert: async (args: any) => {
          state.reviews.push(args);
        },
      },
      emailMessage: {
        upsert: async ({ create }: any) =>
          (state.email ||= { id: 'email1', status: 'QUEUED', ...create }),
      },
      auditLog: { create: async ({ data }: any) => state.audits.push(data) },
    };
    const input = {
      userId: 'cmryg3hyn000uw9wrjgudtj7l',
      actor: { id: 'owner1', email: 'owner@example.com' },
      now: new Date('2026-09-21T18:00Z'),
    };
    const first = await queueSombleRecoveryInvitation(tx, input);
    const second = await queueSombleRecoveryInvitation(tx, input);
    expect(first.id).toBe(second.id);
    expect(state.email.to).toBe('amyanjum2@gmail.com');
    expect(state.email.payload.amount).toBe('$199');
    expect(state.email.payload.day).toBe('4');
    expect(state.email.payload.recoveryUrl).toContain(
      'cms446vbs006fl709vf1ay2ev',
    );
    expect(
      state.reviews.every(
        (r: any) => r.where.template === 'SOMBLE_BILLING_RECOVERY',
      ),
    ).toBe(true);
    expect(state.audits[0].action).toBe('somble-recovery.invitation-queued');
  });
});
