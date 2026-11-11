import type Stripe from 'stripe';
import { zonedLocalDateTimeToDate } from '@/lib/domain/schedule/recurrence-service';

export const CAMPAIGN_ZONE = 'America/New_York';
export type CampaignTerms = { id: string; code: string; percentOff: number; enabled: boolean; startsAt: Date; endsAt: Date; productIds: string[] };
export function campaignStatus(campaign: Pick<CampaignTerms, 'enabled' | 'startsAt' | 'endsAt'>, now = new Date()) {
  if (!campaign.enabled) return 'Disabled';
  if (now < campaign.startsAt) return 'Scheduled';
  if (now >= campaign.endsAt) return 'Expired';
  return 'Active';
}
export function campaignProductEligible(product: { kind: string; billingInterval: string }) {
  return (product.kind === 'CLASS_PACK' && product.billingInterval === 'ONE_TIME') ||
    (['MONTHLY_UNLIMITED', 'LIMITED_MEMBERSHIP', 'VIP'].includes(product.kind) && product.billingInterval === 'MONTHLY');
}
function localMinute(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: CAMPAIGN_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const p = (name: string) => parts.find(x => x.type === name)?.value;
  return `${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}`;
}
function parseEastern(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw Error('Use an Eastern local date and time.');
  const date = zonedLocalDateTimeToDate(value, CAMPAIGN_ZONE);
  if (localMinute(date) !== value || [-3600000,3600000].some(offset => localMinute(new Date(date.getTime()+offset)) === value)) throw Error('Invalid or ambiguous Eastern time. Choose a time outside the daylight-saving transition.');
  return date;
}
export function parseCampaignForm(form: FormData) {
  const code = String(form.get('code') || '').trim().toUpperCase();
  const percentOff = Number(form.get('percentOff'));
  const productIds = [...new Set(form.getAll('productIds').map(String))];
  const startsAt = parseEastern(String(form.get('startsAt') || ''));
  const endsAt = parseEastern(String(form.get('endsAt') || ''));
  if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code) || code === 'RHYZE2026') throw Error('Use a unique 3–32 character code; RHYZE2026 is reserved.');
  if (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 99) throw Error('Percent must be an integer from 1 to 99.');
  if (!productIds.length || productIds.length > 100 || productIds.some(id => !id || id.length > 100)) throw Error('Select eligible products.');
  if (endsAt <= startsAt) throw Error('Redemption end must follow start.');
  return { code, percentOff, productIds, startsAt, endsAt };
}
// Disable stops new issuance, not existing price commitments. The fixed ceiling
// is sale close + 30 minutes, capped at the provider's 24-hour session maximum.
// Provider validation can still reject late requests; never extend on retry.
export function campaignCheckout(campaign: CampaignTerms, product: { id: string; kind: string; billingInterval: string; priceCents: number }, now = new Date()) {
  if (!campaign.enabled || now < campaign.startsAt || now >= campaign.endsAt) throw Error('Campaign unavailable or closing.');
  if (!campaign.productIds.includes(product.id) || !campaignProductEligible(product)) throw Error('Product not eligible.');
  return { discountCents: Math.round(product.priceCents * campaign.percentOff / 100), expiresAt: Math.min(Math.floor(campaign.endsAt.getTime()/1000)+1800, Math.floor(now.getTime()/1000)+86400) };
}
export async function ensureCampaignCoupon(stripe: Stripe, campaign: Pick<CampaignTerms, 'id' | 'percentOff'>) {
  const id = `rhyze_campaign_${campaign.id}_${campaign.percentOff}_once`;
  try {
    const existing = await stripe.coupons.retrieve(id);
    if (!existing.valid || existing.percent_off !== campaign.percentOff || existing.duration !== 'once' || existing.applies_to?.products?.length) throw Error('Campaign coupon terms mismatch.');
    return existing;
  } catch (error) {
    if ((error as { code?: string }).code !== 'resource_missing') throw error;
  }
  // No applies_to: checkout enforces stable application product IDs. ONE_TIME
  // items intentionally retain inline product_data (stale recurring-price safety).
  return stripe.coupons.create({ id, percent_off: campaign.percentOff, duration: 'once', name: `Rhyze ${campaign.percentOff}% first payment` }, { idempotencyKey: id });
}
