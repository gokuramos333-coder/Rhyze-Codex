import type Stripe from 'stripe';
import { parseDollarDiscount, quoteDiscountValue, type DiscountValue } from './value';
import { zonedLocalDateTimeToDate } from '@/lib/domain/schedule/recurrence-service';

export const CAMPAIGN_ZONE = 'America/New_York';
export type CampaignTerms = { id: string; code: string; percentOff: number | null; amountOffCents?: number | null; enabled: boolean; startsAt: Date; endsAt: Date | null; duration?: string; durationMonths?: number | null; productIds: string[] };
export function campaignStatus(campaign: Pick<CampaignTerms, 'enabled' | 'startsAt' | 'endsAt'>, now = new Date()) {
  if (!campaign.enabled) return 'Disabled';
  if (now < campaign.startsAt) return 'Scheduled';
  if (campaign.endsAt && now >= campaign.endsAt) return 'Expired';
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
  const kind = String(form.get('discountKind') || 'PERCENT');
  if (!['PERCENT','FIXED'].includes(kind)) throw Error('Select a commercial discount type.');
  if (kind === 'FIXED' ? Boolean(form.get('percentOff')) : Boolean(form.get('amountOff'))) throw Error('Select exactly one discount value.');
  const percentText = String(form.get('percentOff') || '');
  const percentOff = kind === 'PERCENT' ? Number(percentText) : null;
  const amountOffCents = kind === 'FIXED' ? parseDollarDiscount(String(form.get('amountOff') || '')) : null;
  const productIds = [...new Set(form.getAll('productIds').map(String))];
  const startsAt = parseEastern(String(form.get('startsAt') || ''));
  const noEnd = form.get('noEnd');
  if (noEnd != null && noEnd !== 'true') throw Error('Invalid sale availability.');
  const endsAt = noEnd === 'true' ? null : parseEastern(String(form.get('endsAt') || ''));
  const duration = String(form.get('duration') || 'once');
  const monthsText = String(form.get('durationMonths') || '');
  const durationMonths = duration === 'repeating' ? Number(monthsText) : null;
  if (duration === 'repeating' ? !/^[1-9][0-9]{0,2}$/.test(monthsText) : Boolean(monthsText)) throw Error('Enter whole months only for a limited monthly discount.');
  campaignDuration({duration,durationMonths});
  if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code) || code === 'RHYZE2026') throw Error('Use a unique 3–32 character code; RHYZE2026 is reserved.');
  if (kind === 'PERCENT' && (!/^[1-9][0-9]?$/.test(percentText) || percentOff === null || percentOff < 1 || percentOff > 99)) throw Error('Percent must be an integer from 1 to 99.');
  if (!productIds.length || productIds.length > 100 || productIds.some(id => !id || id.length > 100)) throw Error('Select eligible products.');
  if (endsAt && endsAt <= startsAt) throw Error('Redemption end must follow start.');
  return { code, percentOff, amountOffCents, productIds, startsAt, endsAt, duration, durationMonths };
}
// Disable stops new issuance, not existing price commitments. The fixed ceiling
// is sale close + 30 minutes, capped at the provider's 24-hour session maximum.
// Provider validation can still reject late requests; never extend on retry.
export function campaignCheckout(campaign: CampaignTerms, product: { id: string; kind: string; billingInterval: string; priceCents: number }, now = new Date()) {
  if (!campaign.enabled || now < campaign.startsAt || (campaign.endsAt && now >= campaign.endsAt)) throw Error('Campaign unavailable or closing.');
  if (!campaign.productIds.includes(product.id) || !campaignProductEligible(product)) throw Error('Product not eligible.');
  if (campaignDuration(campaign).duration !== 'once' && product.billingInterval !== 'MONTHLY') throw Error('Recurring discounts require monthly memberships.');
  return { discountCents: campaignValueQuote(campaign, product).discountCents, expiresAt: Math.min((campaign.endsAt ? Math.floor(campaign.endsAt.getTime()/1000)+1800 : Infinity), Math.floor(now.getTime()/1000)+86400) };
}
type CampaignValue = Pick<CampaignTerms, 'percentOff' | 'amountOffCents'>;
export function campaignDiscountValue(campaign: CampaignValue): DiscountValue {
  if (campaign.amountOffCents != null && campaign.percentOff == null) return {kind:'FIXED',amountOffCents:campaign.amountOffCents};
  if (campaign.percentOff != null && campaign.amountOffCents == null) return {kind:'PERCENT',percentOff:campaign.percentOff};
  throw Error('Select exactly one commercial discount value.');
}
export function campaignValueQuote(campaign: CampaignValue, product: {priceCents:number;billingInterval:string}) {
  return quoteDiscountValue(product.priceCents, campaignDiscountValue(campaign), product.billingInterval as 'ONE_TIME'|'MONTHLY');
}
export function campaignQuoteSnapshot(campaign: CampaignTerms, product: {id:string;priceCents:number;billingInterval:string}) {
  return {version:1,purpose:'COMMERCIAL',campaignId:campaign.id,code:campaign.code,productId:product.id,currency:'usd',percentOff:campaign.percentOff,amountOffCents:campaign.amountOffCents ?? null,priceCents:product.priceCents,...campaignValueQuote(campaign,product),...campaignDuration(campaign),perCustomerLimit:1,refundedUseRetained:true};
}
export function campaignValueLabel(campaign: CampaignValue) {
  const value=campaignDiscountValue(campaign);
  return value.kind==='FIXED' ? `$${(value.amountOffCents/100).toFixed(2)}` : `${value.percentOff}%`;
}
type DurationTerms = Pick<CampaignTerms, 'duration' | 'durationMonths'>;
export function campaignDuration(terms: DurationTerms): {duration:'once'|'repeating'|'forever';durationMonths?:number} {
  const duration = terms.duration ?? 'once';
  if (!['once','repeating','forever'].includes(duration)) throw Error('Select a valid discount duration.');
  if (duration === 'repeating') {
    if (!Number.isInteger(terms.durationMonths) || terms.durationMonths! < 1 || terms.durationMonths! > 600) throw Error('Discount duration must be 1–600 whole months.');
    return {duration, durationMonths:terms.durationMonths!};
  }
  if (terms.durationMonths != null) throw Error('Only limited monthly discounts have a month count.');
  return {duration:duration as 'once'|'forever'};
}
export function campaignDurationLabel(terms: DurationTerms) {
  const {duration,durationMonths}=campaignDuration(terms);
  return duration==='once' ? 'First payment only' : duration==='forever' ? 'Lifetime while subscribed' : `First ${durationMonths} months`;
}
export async function ensureCampaignCoupon(stripe: Stripe, campaign: Pick<CampaignTerms, 'id' | 'percentOff' | 'amountOffCents' | 'duration' | 'durationMonths'>) {
  const value=campaignDiscountValue(campaign);
  quoteDiscountValue(2147483648,value,'ONE_TIME');
  const {duration,durationMonths}=campaignDuration(campaign);
  const suffix=duration==='repeating' ? `repeating_${durationMonths}` : duration;
  const fixed=value.kind==='FIXED';
  const id = fixed ? `rhyze_campaign_${campaign.id}_usd_${value.amountOffCents}_${suffix}` : `rhyze_campaign_${campaign.id}_${value.percentOff}_${suffix}`;
  try {
    const existing = await stripe.coupons.retrieve(id);
    const matches=fixed ? existing.amount_off===value.amountOffCents && existing.currency==='usd' && existing.percent_off==null : existing.percent_off===value.percentOff && existing.amount_off==null;
    if (!existing.valid || !matches || existing.duration !== duration || (existing.duration_in_months ?? null) !== (durationMonths ?? null) || existing.applies_to?.products?.length) throw Error('Campaign coupon terms mismatch.');
    return existing;
  } catch (error) {
    if ((error as { code?: string }).code !== 'resource_missing') throw error;
  }
  const label=duration==='once'?'first payment':duration==='forever'?'while subscribed':`${durationMonths} months`;
  return stripe.coupons.create({ id, ...(fixed ? {amount_off:value.amountOffCents,currency:'usd'} : {percent_off:value.percentOff}), duration, ...(durationMonths ? {duration_in_months:durationMonths} : {}), name: `Rhyze ${campaignValueLabel(campaign)} ${label}` }, { idempotencyKey: id });
}
