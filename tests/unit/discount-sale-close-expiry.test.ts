import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {campaignCheckout,parseCampaignForm} from '@/lib/domain/discounts/campaign';
const start=new Date('2030-01-01T00:00:00Z');
const end=new Date('2030-01-03T00:00:00Z');
const c={id:'synthetic',code:'TEST',percentOff:15,enabled:true,startsAt:start,endsAt:end,productIds:['p']};
const p={id:'p',kind:'CLASS_PACK',billingInterval:'ONE_TIME',priceCents:9200};
it.each([['early',end.getTime()-7200000],['final minute',end.getTime()-60000],['last millisecond',end.getTime()-1],['24h cap',start.getTime()]])('%s fixed ceiling',(_,ms)=>{
 const now=new Date(ms); expect(campaignCheckout(c,p,now).expiresAt).toBe(Math.min(Math.floor(end.getTime()/1000)+1800,Math.floor(ms/1000)+86400));
});
it('fractional sale end rounds down never beyond grace',()=>{expect(campaignCheckout({...c,endsAt:new Date(end.getTime()+999)},p,new Date(end.getTime()-60000)).expiresAt).toBe(end.getTime()/1000+1800)});
it('start inclusive end exclusive',()=>{expect(()=>campaignCheckout(c,p,start)).not.toThrow();for(const now of [new Date(start.getTime()-1),end])expect(()=>campaignCheckout(c,p,now)).toThrow()});
it('DST Eastern end is one fixed UTC instant',()=>{const f=new FormData();Object.entries({code:'TEST',percentOff:'15',startsAt:'2026-03-07T12:00',endsAt:'2026-03-08T03:00',productIds:'p'}).forEach(([k,v])=>f.set(k,v));const terms=parseCampaignForm(f);expect(terms.endsAt!.toISOString()).toBe('2026-03-08T07:00:00.000Z');expect(campaignCheckout({...c,...terms},p,new Date('2026-03-08T06:59:00Z')).expiresAt).toBe(Date.parse('2026-03-08T07:30:00Z')/1000)});
it('copy describes sale-close ceiling and honest failure not old early cutoff',()=>{
 const form=readFileSync('components/admin/DiscountCampaignForm.tsx','utf8');expect(form).toContain('30 minutes after the sale closes');expect(form).toContain('24 hours');expect(form).toContain('completing Checkout');
 const page=readFileSync('app/(portal)/member/membership/page.tsx','utf8');expect(page).not.toContain('closing within 31 minutes');expect(page).toContain("'campaign-checkout-expiry'");expect(page).toContain('30 minutes after the sale closes');
});
