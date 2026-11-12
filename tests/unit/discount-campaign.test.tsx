import { beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { campaignCheckout, campaignProductEligible, parseCampaignForm, ensureCampaignCoupon } from '@/lib/domain/discounts/campaign';
import { DiscountCampaignForm } from '@/components/admin/DiscountCampaignForm';
const f = vi.hoisted(() => ({ owner: vi.fn(), transaction: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ requireApprovedOwner: f.owner }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { $transaction: f.transaction } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (s: string) => { throw Error(s); } }));
import { createDiscountCampaignAction, setDiscountCampaignEnabledAction } from '@/app/(studio)/admin/discounts/actions';
const now = new Date('2026-11-10T17:00:00Z');
const campaign = { id: 'synthetic', code: 'SYNTHETIC15', percentOff: 15, enabled: true, startsAt: now, endsAt: new Date('2026-11-11T17:00:00Z'), productIds: ['monthly', 'pack'] };
const product = { id: 'monthly', kind: 'LIMITED_MEMBERSHIP', billingInterval: 'MONTHLY', priceCents: 9200 };
function form() { const d = new FormData(); Object.entries({ code: 'SYNTHETIC15', percentOff: '15', startsAt: '2026-11-10T12:00', endsAt: '2026-11-11T12:00' }).forEach(([k,v]) => d.set(k,v)); d.append('productIds','monthly'); return d; }
beforeEach(() => vi.resetAllMocks());
it('quotes exact first-payment cents and caps early checkout at provider 24 hours', () => {
 expect(campaignCheckout(campaign, product, now)).toEqual({ discountCents: 1380, expiresAt: Math.floor(now.getTime()/1000)+86400 });
 expect(campaignCheckout(campaign, { ...product, id: 'pack', kind: 'CLASS_PACK', billingInterval: 'ONE_TIME' }, now).discountCents).toBe(1380);
});
it.each([
 ['before start', { startsAt: new Date(now.getTime()+1) }, now],
 ['disabled', { enabled: false }, now],
 ['expired', { endsAt: now }, now],
])('rejects %s', (_, changes, time) => expect(() => campaignCheckout({ ...campaign, ...changes }, product, time)).toThrow());
it('admits through the final millisecond with a fixed maximum 30-minute deadline', () => {
 const end = new Date(now.getTime()+1);
 expect(campaignCheckout({ ...campaign, endsAt: end }, product, now).expiresAt).toBe(Math.floor(now.getTime()/1000)+1800);
});
it('allows a short sale without a provider-motivated early cutoff', () => {
 const d=form(); d.set('endsAt','2026-11-10T12:01'); expect(parseCampaignForm(d).endsAt!.toISOString()).toBe('2026-11-10T17:01:00.000Z');
});
it('rejects unselected product and disallowed kinds/cadences', () => {
 expect(() => campaignCheckout(campaign, { ...product, id: 'other' }, now)).toThrow();
 expect(campaignProductEligible({ kind: 'INTRO_TRIAL', billingInterval: 'ONE_TIME' })).toBe(false);
 expect(campaignProductEligible({ kind: 'VIP', billingInterval: 'YEARLY' })).toBe(false);
});
it('interprets owner wall times in Eastern and rejects ambiguous/nonexistent times', () => {
 expect(parseCampaignForm(form()).startsAt.toISOString()).toBe('2026-11-10T17:00:00.000Z');
 for (const date of ['2026-03-08T02:30','2026-11-01T01:30','2026-02-30T12:00']) { const d=form(); d.set('startsAt',date); expect(() => parseCampaignForm(d)).toThrow(); }
});
it('rejects invalid percent, reserved codes and empty scope', () => {
 for (const [key,value] of [['percentOff','0'],['percentOff','100'],['percentOff','15.5'],['code','RHYZE2026'],['code','bad code'],['endsAt','2026-11-09T12:00']]) { const d=form(); d.set(key,value); expect(() => parseCampaignForm(d)).toThrow(); }
 const d=form(); d.delete('productIds'); expect(() => parseCampaignForm(d)).toThrow();
});
it('creates/reuses a deterministic unrestricted once-only provider coupon', async () => {
 const create = vi.fn().mockResolvedValue({ id: 'coupon' });
 const retrieve = vi.fn().mockRejectedValue({ code: 'resource_missing' });
 await ensureCampaignCoupon({ coupons: { create, retrieve } } as never, campaign);
 expect(create).toHaveBeenCalledWith(expect.objectContaining({ percent_off: 15, duration: 'once' }), expect.objectContaining({ idempotencyKey: expect.any(String) }));
 expect(create.mock.calls[0][0].applies_to).toBeUndefined();
 retrieve.mockResolvedValue({ id: create.mock.calls[0][0].id, valid: true, percent_off: 15, duration: 'once' });
 await ensureCampaignCoupon({ coupons: { create, retrieve } } as never, campaign);
 expect(create).toHaveBeenCalledTimes(1);
});
it('denies both owner writes before database access', async () => {
 f.owner.mockRejectedValue(Error('denied'));
 await expect(createDiscountCampaignAction(form())).rejects.toThrow('denied');
 await expect(setDiscountCampaignEnabledAction(form())).rejects.toThrow('denied');
 expect(f.transaction).not.toHaveBeenCalled();
});
it('persists campaign attribution and excludes it from referral commissions during fulfillment', () => {
 expect(readFileSync('app/(portal)/member/membership/actions.ts','utf8')).toContain('discountCampaignId: campaign.id');
 expect(readFileSync('lib/payments/webhook-processor.ts','utf8')).toContain('purchase.discountCents > 0 && !purchase.discountCampaignId');
 expect(readFileSync('app/(portal)/member/membership/page.tsx','utf8')).toContain("'campaign-unavailable'");
});
it('links Sales to the owner-only Discounts route and shows pack code entry', () => {
 expect(readFileSync('app/(studio)/admin/page.tsx','utf8')).toContain('href="/admin/discounts"');
 expect(readFileSync('app/(portal)/member/membership/page.tsx','utf8')).toContain("product.kind === 'CLASS_PACK'");
});
it('renders owner terms, eligible product selection and explicit lease/deferred policy', () => {
 const html=renderToStaticMarkup(<DiscountCampaignForm products={[{ id:'monthly',name:'Synthetic monthly' }]} action={async () => {}} />);
 for (const text of ['Create discount code','America/New_York','First payment only','30 minutes','One use per customer per sale','Codes start disabled','Disabling does not revoke','No stacking','Fixed amounts','productIds','datetime-local']) expect(html).toContain(text);
});
