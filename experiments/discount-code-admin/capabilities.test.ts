import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FinancialReportView } from '@/components/admin/FinancialReportView';
import { buildFinancialReport } from '@/lib/admin/financial-report';
import { readFileSync, writeFileSync } from 'node:fs';

// SYNTHETIC characterization of the published action. No DB/provider/network access.
const f = vi.hoisted(() => ({
  auth: vi.fn(), product: vi.fn(), user: vi.fn(), redeemed: vi.fn(), previous: vi.fn(),
  referral: vi.fn(), attribution: vi.fn(), purchase: vi.fn(), update: vi.fn(),
  campaign: vi.fn(), retrieveCoupon: vi.fn(), coupon: vi.fn(), checkout: vi.fn(), promotions: vi.fn(),
}));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ requireArea: f.auth }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  discountCampaign: { findUnique: f.campaign }, product: { findFirst: f.product }, user: { findUnique: f.user },
  waiverVersion: { findFirst: async () => ({ id: 'synthetic-waiver' }) },
  waiverAcceptance: { findUnique: async () => ({ id: 'synthetic-acceptance' }) },
  discountRedemption: { findFirst: f.redeemed }, purchase: { findFirst: f.previous, create: f.purchase, update: f.update },
  referralCode: { findFirst: f.referral }, referralAttribution: { upsert: f.attribution },
} }));
vi.mock('@/lib/payments/stripe', () => ({ stripeIsConfigured: () => true, getStripe: () => ({
  coupons: { create: f.coupon, retrieve: f.retrieveCoupon }, promotionCodes: { list: f.promotions },
  checkout: { sessions: { create: f.checkout } },
}) }));
vi.mock('@/lib/notifications/email-queue', () => ({ queueEmail: vi.fn() }));
import { startCheckoutAction } from '@/app/(portal)/member/membership/actions';

const monthly = { id: 'synthetic-monthly', name: 'Synthetic monthly', slug: 'synthetic-monthly', description: '', kind: 'LIMITED_MEMBERSHIP', billingInterval: 'MONTHLY', priceCents: 9200, stripePriceId: 'price_synthetic', isPublic: true, isActive: true };
const pack = { ...monthly, id: 'synthetic-pack', slug: 'synthetic-pack', name: 'Synthetic pack', kind: 'CLASS_PACK', billingInterval: 'ONE_TIME' };
function form(code = '') { const data = new FormData(); data.set('productId', 'synthetic-monthly'); data.set('referralCode', code); return data; }
beforeEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
  f.auth.mockResolvedValue({ id: 'synthetic-member', email: 'member@example.invalid', name: 'Synthetic Member' });
  f.product.mockResolvedValue(monthly); f.user.mockResolvedValue({ stripeCustomerId: null, memberships: [] });
  f.campaign.mockResolvedValue(null); f.retrieveCoupon.mockRejectedValue({ code: 'resource_missing' });
  f.redeemed.mockResolvedValue(null); f.previous.mockResolvedValue(null); f.referral.mockResolvedValue(null);
  f.purchase.mockResolvedValue({ id: 'synthetic-purchase' }); f.update.mockResolvedValue({});
  f.coupon.mockResolvedValue({ id: 'coupon_synthetic' });
  f.checkout.mockResolvedValue({ id: 'cs_synthetic', url: 'https://checkout.example.invalid/synthetic' });
  f.attribution.mockResolvedValue({ referralCodeId: 'synthetic-referral' });
  // This provider-only fixture deliberately has no corresponding instructor referral.
  f.promotions.mockResolvedValue({ data: [{ id: 'promo_synthetic', code: 'SYNTHETIC15', active: true, promotion: { type: 'coupon', coupon: { id: 'coupon_synthetic', percent_off: 15, duration: 'once' } } }] });
});

describe('current published capabilities', () => {
  it('rejects a provider-only general code before creating any purchase', async () => {
    await expect(startCheckoutAction(form('SYNTHETIC15'))).rejects.toThrow('result=referral-invalid');
    expect(f.purchase).not.toHaveBeenCalled(); expect(f.promotions).not.toHaveBeenCalled(); expect(f.checkout).not.toHaveBeenCalled();
  });
  it('rejects a class-pack code before provider lookup', async () => {
    f.product.mockResolvedValue(pack);
    await expect(startCheckoutAction(form('SYNTHETIC15'))).rejects.toThrow('result=referral-ineligible');
    expect(f.purchase).not.toHaveBeenCalled(); expect(f.promotions).not.toHaveBeenCalled();
  });
  it('does not enable Stripe promotion entry for normal monthly checkout', async () => {
    await expect(startCheckoutAction(form())).rejects.toThrow('redirect:https://checkout.example.invalid/synthetic');
    expect(f.checkout.mock.calls[0][0].allow_promotion_codes).not.toBe(true);
    expect(f.checkout.mock.calls[0][0]).toMatchObject({ mode: 'subscription', discounts: undefined, subscription_data: { metadata: { productId: monthly.id } } });
    expect(f.checkout.mock.calls[0][0].subscription_data.trial_end).toBeUndefined();
    expect(f.checkout.mock.calls[0][0].subscription_data.billing_cycle_anchor).toBeUndefined();
  });
  it('keeps packs one-time using inline product_data, not a stable provider product', async () => {
    f.product.mockResolvedValue(pack);
    await expect(startCheckoutAction(form())).rejects.toThrow('redirect:https://checkout.example.invalid/synthetic');
    const params = f.checkout.mock.calls[0][0];
    expect(params).toMatchObject({ mode: 'payment', subscription_data: undefined, line_items: [{ price_data: { unit_amount: 9200, product_data: { metadata: { rhyzeProductId: pack.id } } } }] });
    expect(params.line_items[0].price_data.product).toBeUndefined();
    expect(params.allow_promotion_codes).not.toBe(true);
  });
  it('preserves instructor five-percent once-only discount and attribution', async () => {
    f.referral.mockResolvedValue({ id: 'synthetic-referral' });
    await expect(startCheckoutAction(form('SYNTHETICREF'))).rejects.toThrow('redirect:https://checkout.example.invalid/synthetic');
    expect(f.coupon).toHaveBeenCalledWith(expect.objectContaining({ amount_off: 460, duration: 'once' }), expect.anything());
    expect(f.purchase).toHaveBeenCalledWith({ data: expect.objectContaining({ amountCents: 8740, discountCents: 460 }) });
    expect(f.checkout.mock.calls[0][0].discounts).toEqual([{ coupon: 'coupon_synthetic' }]);
    expect(f.checkout.mock.calls[0][0].metadata.referralCodeId).toBe('synthetic-referral');
  });
  it('blocks any earlier paid discount from another referral checkout', async () => {
    f.previous.mockResolvedValue({ id: 'synthetic-prior-purchase' });
    await expect(startCheckoutAction(form('SYNTHETICREF'))).rejects.toThrow('result=referral-used');
    expect(f.purchase).not.toHaveBeenCalled();
  });
  it('rejects the expired September campaign in the requested November window', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-08T17:00:00Z'));
    try { await expect(startCheckoutAction(form('RHYZE2026'))).rejects.toThrow('result=rhyze2026-expired'); }
    finally { vi.useRealTimers(); }
    expect(f.checkout).not.toHaveBeenCalled();
  });
  it('checks member authorization before purchase/provider calls', async () => {
    f.auth.mockRejectedValue(new Error('synthetic unauthorized'));
    await expect(startCheckoutAction(form())).rejects.toThrow('synthetic unauthorized');
    expect(f.product).not.toHaveBeenCalled(); expect(f.checkout).not.toHaveBeenCalled();
  });
  it('returns a generic checkout error instead of exposing provider details to the member', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    f.checkout.mockRejectedValue(new Error('synthetic provider details'));
    await expect(startCheckoutAction(form())).rejects.toThrow('redirect:/member/membership?result=checkout-error');
    expect(f.update).toHaveBeenCalledWith({ where: { id: 'synthetic-purchase' }, data: { status: 'FAILED', failedAt: expect.any(Date) } });
    log.mockRestore();
  });
});

describe('rendered and browser discovery only', () => {
  it('verifies Sales links Discounts and packs expose the code field', () => {
    const admin = readFileSync('app/(studio)/admin/page.tsx', 'utf8');
    expect(admin).toContain("panel === 'sales'");
    expect(admin).toContain('/admin/discounts');
    const member = readFileSync('app/(portal)/member/membership/page.tsx', 'utf8');
    expect(member).toContain("product.kind === 'CLASS_PACK'");
  });
  it('runs real Chromium against synthetic Sales rendering and the actual mocked checkout action', async () => {
    // Diagnostic transport only: not a new application route, auth flow, or owner preview.
    // Admin content is the production FinancialReportView with empty synthetic sources.
    // The explicitly labelled checkout driver calls the actual server action with provider/DB doubles.
    const report = buildFinancialReport({ purchases: [], commerceOrders: [], purchaseRefunds: [], commerceRefunds: [], sombleTransactions: [], providerEvents: [], paymentRecords: [] }, { range: 'custom', from: '2026-11-01', to: '2026-11-30' });
    const adminHtml = renderToStaticMarkup(createElement(FinancialReportView, { report, basePath: '/admin' }));
    const server = createServer(async (req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      if (req.method === 'POST' && req.url === '/checkout-driver') {
        let body = ''; for await (const chunk of req) body += chunk;
        const params = new URLSearchParams(body);
        f.product.mockResolvedValue(params.get('kind') === 'pack' ? pack : monthly);
        try { await startCheckoutAction(form(params.get('code') || '')); res.end('Unexpected no redirect'); }
        catch (error) { res.end(`<pre>${String(error).replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre>`); }
        return;
      }
      if (req.method !== 'GET') { res.statusCode = 405; res.end('Not allowed'); return; }
      res.end(`<!doctype html><title>Synthetic capability diagnostic — NOT a feature preview</title><h1>Synthetic capability diagnostic — NOT a feature preview</h1><a href="/admin">Existing Sales component</a><a href="/driver">Checkout diagnostic driver</a>${req.url?.startsWith('/admin') ? adminHtml : '<form method="POST" action="/checkout-driver"><label for="synthetic-product">Product</label><select id="synthetic-product" name="kind"><option value="monthly">Synthetic monthly</option><option value="pack">Synthetic pack</option></select><label>Code<input name="code"></label><button>Exercise existing action</button></form>'}`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('No local server');
    const origin = `http://127.0.0.1:${address.port}`;
    const browser = await chromium.launch({ headless: true });
    const observations: string[] = [];
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(5000);
      page.setDefaultNavigationTimeout(5000);
      await page.route('**/*', (route) => route.request().url().startsWith(origin) ? route.continue() : route.abort());
      await page.goto(`${origin}/admin`);
      expect(await page.getByRole('button', { name: /create.*discount/i }).count()).toBe(0);
      expect(await page.locator('body').innerText()).toContain('Synthetic capability diagnostic');
      observations.push('Actual Sales FinancialReportView rendered with synthetic empty sources; no create-discount button. Not full admin authentication/navigation verification.');
      await page.getByRole('link', { name: 'Checkout diagnostic driver' }).click();
      await page.getByLabel('Code', { exact: true }).fill('SYNTHETIC15');
      await page.getByRole('button', { name: 'Exercise existing action' }).click();
      expect(await page.locator('pre').innerText()).toContain('result=referral-invalid');
      observations.push('Real browser submitted synthetic monthly general code to actual action: referral-invalid, zero provider checkout calls.');
      await page.goto(`${origin}/driver`);
      await page.getByLabel('Product', { exact: true }).selectOption('pack');
      await page.getByLabel('Code', { exact: true }).fill('SYNTHETIC15');
      await page.getByRole('button', { name: 'Exercise existing action' }).click();
      expect(await page.locator('pre').innerText()).toContain('result=referral-ineligible');
      expect(f.checkout).not.toHaveBeenCalled(); expect(f.purchase).not.toHaveBeenCalled();
      observations.push('Real browser submitted synthetic pack general code: referral-ineligible, zero purchase/provider checkout calls. Driver is not production member UI; published pack UI hides code input.');
      writeFileSync('../browser-discovery.json', JSON.stringify({ kind: 'synthetic diagnostic, not feature preview', provider: 'mocked, no real redemption', observations }, null, 2));
    } finally { await browser.close(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
  }, 30000);
});

// Original RED source/outputs retained outside source. These acceptance fixtures
// now use app-managed eligibility, not provider-only promotions.
describe('requested standalone minimum app-managed campaign', () => {
  beforeEach(() => { f.campaign.mockResolvedValue({ id: 'synthetic-campaign', code: 'SYNTHETIC15', percentOff: 15, enabled: true, startsAt: new Date(Date.now()-60000), endsAt: new Date(Date.now()+86400000), productIds: [monthly.id, pack.id] }); });
  it('applies a general 15 percent code to first monthly invoice with exact cents', async () => {
    await expect(startCheckoutAction(form('SYNTHETIC15'))).rejects.toThrow('redirect:https://checkout.example.invalid/synthetic');
    expect(f.purchase).toHaveBeenCalledWith({ data: expect.objectContaining({ amountCents: 7820, discountCents: 1380 }) });
    expect(f.checkout.mock.calls[0][0].discounts).toEqual([{ coupon: 'coupon_synthetic' }]);
    expect(f.purchase.mock.calls[0][0].data.discountCampaignId).toBe('synthetic-campaign');
    expect(f.checkout.mock.calls[0][0].expires_at).toBeGreaterThan(Math.floor(Date.now()/1000)+1800);
    expect(f.checkout.mock.calls[0][0].metadata.referralCodeId).toBe('');
    expect(f.attribution).not.toHaveBeenCalled();
    expect(f.coupon.mock.calls[0][0]).toMatchObject({percent_off:15,duration:'once'});
    expect(f.coupon.mock.calls[0][0].applies_to).toBeUndefined();
  });
  it('applies a general 15 percent code to a one-time class pack', async () => {
    f.product.mockResolvedValue(pack);
    await expect(startCheckoutAction(form('SYNTHETIC15'))).rejects.toThrow('redirect:https://checkout.example.invalid/synthetic');
    expect(f.purchase).toHaveBeenCalledWith({ data: expect.objectContaining({ amountCents: 7820, discountCents: 1380 }) });
    expect(f.checkout.mock.calls[0][0].mode).toBe('payment');
    expect(f.checkout.mock.calls[0][0].line_items[0].price_data.product_data.metadata.rhyzeProductId).toBe(pack.id);
  });
  it.each(['disabled','future','expired','closing','wrong-product'])('rejects %s campaign before purchase/provider calls', async (state) => {
    const c={ id:'synthetic-campaign',code:'SYNTHETIC15',percentOff:15,enabled:state!=='disabled',startsAt:new Date(Date.now()+(state==='future'?60000:-60000)),endsAt:new Date(Date.now()+(state==='expired'?-1:state==='closing'?1800000:86400000)),productIds:state==='wrong-product'?[]:[monthly.id] };
    f.campaign.mockResolvedValue(c);
    await expect(startCheckoutAction(form('SYNTHETIC15'))).rejects.toThrow('result=campaign-unavailable');
    expect(f.purchase).not.toHaveBeenCalled();expect(f.coupon).not.toHaveBeenCalled();expect(f.checkout).not.toHaveBeenCalled();
  });
  it('fails closed when disabled during provider coupon creation', async()=>{
    const log=vi.spyOn(console,'error').mockImplementation(()=>{});
    f.coupon.mockImplementation(async()=>{f.campaign.mockResolvedValue({enabled:false});return{id:'coupon_synthetic'};});
    await expect(startCheckoutAction(form('SYNTHETIC15'))).rejects.toThrow('result=checkout-error');
    expect(f.checkout).not.toHaveBeenCalled();
    expect(f.update).toHaveBeenCalledWith({where:{id:'synthetic-purchase'},data:{status:'FAILED',failedAt:expect.any(Date)}});
    log.mockRestore();
  });
  it('does not allow a campaign after a previous paid discount',async()=>{
    f.previous.mockResolvedValue({id:'prior'});
    await expect(startCheckoutAction(form('SYNTHETIC15'))).rejects.toThrow('result=referral-used');
    expect(f.checkout).not.toHaveBeenCalled();
  });
});
