import { beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({owner:vi.fn(),mode:vi.fn(),invoice:vi.fn(),sub:vi.fn(),pi:vi.fn(),account:vi.fn(),restore:vi.fn(),tx:vi.fn()}));
vi.mock('@/lib/auth/session',()=>({requireApprovedOwner:m.owner}));
vi.mock('@/lib/payments/stripe',()=>({stripeAccountMode:m.mode,getStripe:()=>({accounts:{retrieve:m.account},invoices:{retrieve:m.invoice},subscriptions:{retrieve:m.sub},paymentIntents:{retrieve:m.pi}})}));
vi.mock('@/lib/db/prisma',()=>({prisma:{$transaction:m.tx}}));
vi.mock('@/lib/payments/restore-initial-vip-entitlement',()=>({restoreInitialVipEntitlement:m.restore}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import { POST } from '@/app/api/admin/memberships/restore-paid-vip/route';
const body={membershipId:'membership1',invoiceId:'in_123',reason:'Restore missing paid VIP benefits',dryRun:true};
const request=(data:unknown=body,origin='http://localhost:3000')=>new Request('http://localhost:3000/api/admin/memberships/restore-paid-vip',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)});
describe('owner-only paid VIP recovery',()=>{
 beforeEach(()=>{vi.clearAllMocks();m.owner.mockResolvedValue({id:'owner1'});m.mode.mockReturnValue('live');m.account.mockResolvedValue({id:'acct_1Tu0UqRIYui0I7dP'});m.invoice.mockResolvedValue({id:'in_123',livemode:true,status:'paid',billing_reason:'subscription_create',amount_paid:19900,amount_due:19900,amount_remaining:0,currency:'usd',customer:'cus_1',status_transitions:{paid_at:1791324567},parent:{subscription_details:{subscription:'sub_1',metadata:{purchaseId:'purchase1'}}},lines:{has_more:false,data:[{parent:{subscription_item_details:{subscription:'sub_1',proration:false}},pricing:{price_details:{price:'price_1'}},period:{start:1791324565,end:1794002965}}]},payments:{has_more:false,data:[{status:'paid',payment:{type:'payment_intent',payment_intent:'pi_1'}}]}});m.sub.mockResolvedValue({id:'sub_1',livemode:true,status:'active',customer:'cus_1',latest_invoice:'in_123',metadata:{purchaseId:'purchase1'}});m.pi.mockResolvedValue({id:'pi_1',livemode:true,status:'succeeded',customer:'cus_1',amount_received:19900,currency:'usd',latest_charge:{id:'ch_1',livemode:true,paid:true,captured:true,disputed:false,amount:19900,amount_captured:19900,amount_refunded:0,refunded:false,payment_intent:'pi_1'}});m.restore.mockResolvedValue({status:'READY'});m.tx.mockImplementation(fn=>fn({}));});
 it('rejects cross-origin before provider reads',async()=>{expect((await POST(request(body,'https://evil.test'))).status).toBe(403);expect(m.invoice).not.toHaveBeenCalled();});
 it('requires approved owner',async()=>{m.owner.mockRejectedValue(Error('denied'));await expect(POST(request())).rejects.toThrow('denied');expect(m.invoice).not.toHaveBeenCalled();});
 it('requires explicit dry run and rejects client payment proof',async()=>{expect((await POST(request({...body,dryRun:undefined}))).status).toBe(400);expect((await POST(request({...body,amountCents:19900}))).status).toBe(400);});
 it('uses fresh server-side invoice proof without creating payment or charge',async()=>{expect((await POST(request())).status).toBe(200);expect(m.restore).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({actorId:'owner1',dryRun:true,proof:expect.objectContaining({amountCents:19900,invoiceId:'in_123',purchaseId:'purchase1',periodEnd:new Date('2026-11-06T22:09:25Z')})}));});
 it.each(['test','account','unpaid','refunded','wrong-sub','ambiguous-lines','wrong-pi','disputed'])('blocks %s evidence before database changes',async kind=>{
  if(kind==='test')m.mode.mockReturnValue('test');
  if(kind==='account')m.account.mockResolvedValue({id:'acct_other'});
  const invoice=await m.invoice();const pi=await m.pi();
  if(kind==='unpaid')invoice.status='open';if(kind==='refunded')pi.latest_charge.amount_refunded=100;
  if(kind==='wrong-sub')m.sub.mockResolvedValue({id:'sub_other'});
  if(kind==='ambiguous-lines')invoice.lines.has_more=true;
  if(kind==='wrong-pi')pi.id='pi_other';if(kind==='disputed')pi.latest_charge.disputed=true;
  expect((await POST(request())).status).toBeGreaterThanOrEqual(400);expect(m.restore).not.toHaveBeenCalled();
 });
});
