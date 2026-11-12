import {expect,it,vi} from 'vitest';
import {campaignCheckout,campaignQuoteSnapshot,campaignStatus,ensureCampaignCoupon,parseCampaignForm} from '@/lib/domain/discounts/campaign';
const now=new Date('2030-01-01T17:00:00Z');
const c={id:'duration',code:'DURATION',percentOff:20,enabled:true,startsAt:now,endsAt:null,productIds:['p'],duration:'forever',durationMonths:null};
const p={id:'p',kind:'VIP',billingInterval:'MONTHLY',priceCents:22200};
function form(){const f=new FormData();Object.entries({code:'DURATION',percentOff:'20',startsAt:'2030-01-01T12:00',noEnd:'true',duration:'forever',productIds:'p'}).forEach(([k,v])=>f.set(k,v));return f;}
it('keeps no-end redemption separate from recurring benefit and caps checkout lifetime',()=>{
 expect(parseCampaignForm(form())).toMatchObject({endsAt:null,duration:'forever',durationMonths:null});
 expect(campaignStatus(c,now)).toBe('Active');expect(campaignCheckout(c,p,now)).toEqual({discountCents:4440,expiresAt:now.getTime()/1000+86400});
 expect(campaignQuoteSnapshot(c,p)).toMatchObject({duration:'forever',amountCents:17760});
 expect(()=>campaignCheckout({...c,enabled:false},p,now)).toThrow();
});
it('requires a valid benefit duration and whole month count',()=>{
 for(const value of ['','0','-1','1.5','1e2','601']){const f=form();f.set('duration','repeating');f.set('durationMonths',value);expect(()=>parseCampaignForm(f)).toThrow();}
 const f=form();f.set('duration','repeating');f.set('durationMonths','3');expect(parseCampaignForm(f)).toMatchObject({duration:'repeating',durationMonths:3});
 f.set('duration','forever');expect(()=>parseCampaignForm(f)).toThrow();f.delete('durationMonths');f.set('duration','bad');expect(()=>parseCampaignForm(f)).toThrow();
});
it('refuses recurring terms for packs and preserves legacy once snapshots',()=>{
 expect(()=>campaignCheckout(c,{...p,kind:'CLASS_PACK',billingInterval:'ONE_TIME'},now)).toThrow(/monthly/);
 const snapshot=campaignQuoteSnapshot({...c,duration:'once'},p);expect(snapshot.duration).toBe('once');expect(snapshot).not.toHaveProperty('durationMonths');
});
it.each(['repeating','forever'])('creates/reuses immutable %s coupons and rejects term drift',async duration=>{
 const create=vi.fn().mockResolvedValue({id:'coupon'}),retrieve=vi.fn().mockRejectedValue({code:'resource_missing'});
 const terms={...c,duration,durationMonths:duration==='repeating'?3:null};
 await ensureCampaignCoupon({coupons:{create,retrieve}} as never,terms);
 const payload=create.mock.calls[0][0];expect(payload.duration).toBe(duration);expect(payload.duration_in_months).toBe(duration==='repeating'?3:undefined);expect(payload.name.length).toBeLessThanOrEqual(40);
 retrieve.mockResolvedValue({...payload,valid:true});await ensureCampaignCoupon({coupons:{create,retrieve}} as never,terms);expect(create).toHaveBeenCalledTimes(1);
 retrieve.mockResolvedValue({...payload,valid:true,duration_in_months:4});await expect(ensureCampaignCoupon({coupons:{create,retrieve}} as never,terms)).rejects.toThrow(/mismatch/);
});
