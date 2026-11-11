import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as campaigns from '@/lib/domain/discounts/campaign';
const f=vi.hoisted(()=>({owner:vi.fn().mockResolvedValue({id:'synthetic'}),transaction:vi.fn()}));
vi.mock('@/lib/auth/session',()=>({requireApprovedOwner:f.owner}));
vi.mock('@/lib/db/prisma',()=>({prisma:{$transaction:f.transaction}}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import { createDiscountCampaignAction, setDiscountCampaignEnabledAction } from '@/app/(studio)/admin/discounts/actions';
it('invalid creation is recoverable inline rather than an unhandled server error',async()=>{
 await expect(createDiscountCampaignAction(new FormData())).resolves.toMatchObject({error:expect.any(String)});
});
it('invalid toggle is recoverable inline',async()=>{
 await expect(setDiscountCampaignEnabledAction(new FormData())).resolves.toMatchObject({error:expect.any(String)});
});
it('actual Sales links Discounts and back targets actual Sales',()=>{
 expect(readFileSync('app/(studio)/admin/payments/page.tsx','utf8')).toContain('href="/admin/discounts"');
 expect(readFileSync('app/(studio)/admin/discounts/page.tsx','utf8')).toContain('href="/admin/payments"');
});
it.each([
 [false,'2029-01-01','2031-01-01','Disabled'],
 [true,'2031-01-01','2032-01-01','Scheduled'],
 [true,'2029-01-01','2031-01-01','Active'],
 [true,'2029-01-01','2030-01-01T00:15:00Z','Active'],
 [true,'2029-01-01','2030-01-01','Expired'],
] as const)('labels %s %s %s as %s',(enabled,start,end,label)=>{
 expect((campaigns as unknown as {campaignStatus:(c:object,n:Date)=>string}).campaignStatus({enabled,startsAt:new Date(start),endsAt:new Date(end)},new Date('2030-01-01'))).toBe(label);
});

it('enables a campaign in its final minute without an early cutoff',async()=>{
 const update=vi.fn();f.transaction.mockImplementation(async(fn:any)=>fn({discountCampaign:{findUniqueOrThrow:async()=>({enabled:false,endsAt:new Date(Date.now()+60000)}),update},auditLog:{create:vi.fn()}}));
 const form=new FormData();form.set('id','synthetic');form.set('enabled','true');
 await expect(setDiscountCampaignEnabledAction(form)).rejects.toThrow();expect(update).toHaveBeenCalled();
});
