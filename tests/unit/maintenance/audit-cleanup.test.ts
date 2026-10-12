import { describe, expect, it } from 'vitest';
import { eligibleLegacyEmail, eligibleHistoricalFee } from '@/lib/maintenance/audit-cleanup';
const unsent = { status: 'QUEUED', providerId: null, sentAt: null, direction: 'OUTBOUND', createdAt: new Date('2026-07-27'), template: 'WELCOME' };
describe('owner-authorized October 11 cleanup boundaries', () => {
  it('only cancels the old unsent July templates and pre-cutoff birthday backlog', () => {
    expect(eligibleLegacyEmail(unsent)).toBe(true);
    expect(eligibleLegacyEmail({ ...unsent, template: 'BIRTHDAY_WEEK_AHEAD', createdAt: new Date('2026-10-10') })).toBe(true);
    for (const extra of [{status:'PROCESSING'}, {status:'SENT'}, {providerId:'provider'}, {sentAt:new Date()}, {direction:'INBOUND'}, {template:'PASSWORD_RESET'}, {createdAt:new Date('2026-10-12')}]) {
      expect(eligibleLegacyEmail({ ...unsent, ...extra })).toBe(false);
    }
  });
  it('never waives a different, paid, trial, or provider-backed payment', () => {
    const fee = { id:'cmuos96ak0007lf09kmpe12dw', bookingId:'cmuojug6g0001la09p1c77oxg', kind:'NO_SHOW_FEE', status:'FAILED', amountCents:1000, currency:'usd', stripePaymentIntentId:null, stripeInvoiceId:null, stripeCheckoutSessionId:null, booking:{policySnapshot:{accessType:'STANDARD',accessProductKind:'LIMITED_MEMBERSHIP'}} };
    expect(eligibleHistoricalFee(fee)).toBe(true);
    for (const extra of [{id:'different'}, {status:'SUCCEEDED'}, {amountCents:19900}, {stripePaymentIntentId:'pi_test'}, {booking:{policySnapshot:{accessProductKind:'TRIAL'}}}]) {
      expect(eligibleHistoricalFee({...fee,...extra})).toBe(false);
    }
  });
});
