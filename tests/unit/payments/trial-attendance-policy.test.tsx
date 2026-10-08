import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TrialPurchaseConfirmation } from '@/components/memberships/TrialPurchaseConfirmation';
import { cancellationPolicyDecision } from '@/lib/domain/bookings/cancellation-policy';
import { TrialPolicyConsent } from '@/components/memberships/TrialPolicyConsent';
import { parseTrialPolicyConsent } from '@/lib/domain/memberships/trial-policy-consent';
import { renderTransactionalEmail } from '@/lib/notifications/email-content';
import { chargeAttendanceFeeWithGateway, type AttendanceFeeGateway } from '@/lib/payments/attendance-fee';

const clause = 'I authorize Rhyze Fitness to retain my card on file and automatically bill a non-refundable $10 fee for any class reservation cancelled within 2 hours of start time or marked as a no-show.';
const policy = "Studio spots are reserved exclusively for booked guests. Any cancellation made within 2 hours of class start time, or an unattended session, will result in an automatic, non-refundable $10 late fee charged to your card on file. Thank you for respecting our instructors' schedules and your fellow dancers' availability.";

describe('trial attendance disclosure', () => {
  it('places the full disclosure immediately below the confirmation header', () => {
    const html = renderToStaticMarkup(<TrialPurchaseConfirmation />);
    expect(html).toContain('YOUR TRIAL IS ACTIVE</h2><div');
    expect(html).toContain('Late Cancellation &amp; No-Show Policy');
    expect(html).toContain('automatic, non-refundable $10');
  });
  it.each([[120 * 60000 + 1, 0], [120 * 60000, 1000], [120 * 60000 - 1, 1000]])('applies the exact two-hour boundary (%s milliseconds)', (before, fee) => {
    const startAt=new Date('2026-10-11T17:00:00Z');
    expect(cancellationPolicyDecision({startAt,requestedAt:new Date(startAt.getTime()-before),accessType:'INTRO_TRIAL',isEvent:false,hasReservedCredit:false}).feeCents).toBe(fee);
  });
  it('shows the exact required authorization and retains the accepted copy', () => {
    expect(renderToStaticMarkup(<TrialPolicyConsent />)).toContain(clause);
    expect(parseTrialPolicyConsent('on').policyAcceptance).toMatchObject({ authorizationText: clause, policyText: policy, nonRefundable: true });
  });
  it.each(['MEMBERSHIP_PURCHASE_CONFIRMATION','PAYMENT_RECEIPT'])('includes mandatory trial policy in %s despite editable copy overrides', (template) => {
    const email = renderTransactionalEmail({subject:'Trial activated',template,payload:{productKind:'INTRO_TRIAL',amount:700},copyOverride:{calloutTitle:'',calloutBody:''}});
    expect(email.text).toContain(policy);
    expect(email.html).toContain('Late Cancellation &amp; No-Show Policy');
    expect(email.html).toContain('non-refundable $10');
  });
  it('does not add trial copy to other membership receipts', () => {
    const email = renderTransactionalEmail({subject:'VIP',template:'PAYMENT_RECEIPT',payload:{productKind:'VIP'}});
    expect(email.text).not.toContain(policy);
  });
});

describe('trial attendance uses the original payment card', () => {
  const input = {bookingId:'booking',userId:'member',stripeCustomerId:'cus_current',feeType:'LATE_CANCELLATION' as const,amountCents:1000,idempotencyKey:'fee-booking'};
  function fake(source: { customerId: string; paymentMethodId: string } | null) {
    const requests: unknown[]=[];
    const gateway = {
      resolveTrialPaymentSource: async () => ({isTrial:true,...source}),
      retrieveCustomer: async () => ({deleted:false,defaultPaymentMethodId:'pm_unrelated'}),
      listAttachedCardPaymentMethodIds: async () => ['pm_another'],
      createPaymentIntent: async (r: unknown) => {requests.push(r);return {id:'pi_fee',status:'succeeded'};},
      recordAttempt: async () => {},
    } as AttendanceFeeGateway;
    return {gateway,requests};
  }
  it.each(['LATE_CANCELLATION','NO_SHOW'] as const)('charges the original card/customer for %s, not a different saved card', async feeType => {
    const f=fake({customerId:'cus_trial',paymentMethodId:'pm_trial'});
    expect((await chargeAttendanceFeeWithGateway({...input,feeType},f.gateway)).status).toBe('SUCCEEDED');
    expect(f.requests).toEqual([expect.objectContaining({customer:'cus_trial',paymentMethod:'pm_trial',amount:1000,offSession:true,idempotencyKey:'fee-booking'})]);
  });
  it('does not fall back to another card after an issuer decline', async () => {
    const f=fake({customerId:'cus_trial',paymentMethodId:'pm_trial'});
    let attempts=0;
    f.gateway.createPaymentIntent=async () => {attempts++;throw new Error('declined');};
    expect((await chargeAttendanceFeeWithGateway(input,f.gateway)).status).toBe('FAILED');
    expect(attempts).toBe(1);
  });
  it('fails closed if the trial card cannot be verified', async () => {
    const f=fake(null);
    expect((await chargeAttendanceFeeWithGateway(input,f.gateway)).status).toBe('FAILED');
    expect(f.requests).toHaveLength(0);
  });
});
