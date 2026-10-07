import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { vipCreditAccountCanBook } from '@/lib/domain/credits/vip-access';
import { restoreInitialVipEntitlement } from '@/lib/payments/restore-initial-vip-entitlement';
const url = process.env.VIP_TEST_DATABASE_URL;
if (url && (!['localhost','127.0.0.1'].includes(new URL(url).hostname) || !['/identity_migration','/vip_entitlement_test'].includes(new URL(url).pathname))) throw Error('Disposable local DB required');
describe.skipIf(!url)('verified initial VIP entitlement recovery', () => {
 const db = new PrismaClient({ datasourceUrl: url });
 const prefix = `vip-repair-${randomUUID()}`;
 const now = new Date('2026-10-07T01:00Z');
 afterAll(async () => {
  await db.auditLog.deleteMany({ where: { actorId: { startsWith: prefix } } });
  await db.creditLedgerEntry.deleteMany({ where: { creditAccount: { userId: { startsWith: prefix } } } });
  await db.creditAccount.deleteMany({ where: { userId: { startsWith: prefix } } });
  await db.paymentRecord.deleteMany({ where: { userId: { startsWith: prefix } } });
  await db.membership.deleteMany({ where: { userId: { startsWith: prefix } } });
  await db.purchase.deleteMany({ where: { userId: { startsWith: prefix } } });
  await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.product.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.$disconnect();
 });
 async function fixture() {
  const id = `${prefix}-${randomUUID()}`;
  await db.user.create({ data: { id, email: `${id}@example.test`, stripeCustomerId: `cus_${id}` } });
  await db.product.create({ data: { id, name:'Synthetic VIP', slug:id, description:'test',kind:'VIP',stripePriceId:`price_${id}`,isUnlimited:true,priceCents:22200,billingInterval:'MONTHLY',eligibleCategoryIds:[] } });
  await db.purchase.create({ data: { id,userId:id,productId:id,status:'PAID',amountCents:19900,paidAt:new Date('2026-10-06T22:09:30Z'),policyAcceptance:{source:'ADMIN_CHECKOUT'} } });
  await db.membership.create({ data: { id,userId:id,productId:id,purchaseId:id,status:'ACTIVE',stripeSubscriptionId:`sub_${id}`,currentPeriodStart:new Date('2026-10-06T22:09:30Z') } });
  await db.paymentRecord.create({ data: { userId:id,purchaseId:id,membershipId:id,stripeEventId:`evt_${id}`,kind:'MEMBERSHIP_RENEWAL',status:'SUCCEEDED',amountCents:19900,currency:'usd',stripeInvoiceId:`in_${id}`,stripePaymentIntentId:`pi_${id}`,occurredAt:new Date('2026-10-06T22:09:27Z') } });
  const proof = { invoiceId:`in_${id}`,subscriptionId:`sub_${id}`,customerId:`cus_${id}`,purchaseId:id,paymentIntentId:`pi_${id}`,priceId:`price_${id}`,amountCents:19900,currency:'usd',paidAt:new Date('2026-10-06T22:09:27Z'),periodStart:new Date('2026-10-06T22:09:25Z'),periodEnd:new Date('2026-11-06T22:09:25Z') };
  const run = (dryRun=false) => db.$transaction(tx=>restoreInitialVipEntitlement(tx,{membershipId:id,actorId:id,reason:'Owner requested restoration after accepted payment',proof,now,dryRun}),{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  return {id,proof,run};
 }
 it('previews without writes then restores only paid benefits once without changing payment',async()=>{
  const f=await fixture();const payment=await db.paymentRecord.findFirstOrThrow({where:{userId:f.id}});
  expect(await f.run(true)).toMatchObject({status:'READY'});
  expect(await db.creditAccount.count({where:{userId:f.id}})).toBe(0);
  expect(await db.auditLog.count({where:{actorId:f.id}})).toBe(0);
  expect(await f.run()).toMatchObject({status:'RESTORED'});
  expect(await f.run()).toMatchObject({status:'ALREADY_ACTIVE'});
  expect(await db.paymentRecord.findFirstOrThrow({where:{userId:f.id}})).toEqual(payment);
  const a=await db.creditAccount.findUniqueOrThrow({where:{sourcePurchaseId:f.id}});expect(a.isUnlimited).toBe(true);expect(a.validUntil).toEqual(f.proof.periodEnd);
  const membership = await db.membership.findUniqueOrThrow({where:{id:f.id},include:{product:true,purchase:{include:{creditAccount:true}}}});
  expect(vipCreditAccountCanBook({account:{...a,sourcePurchase:{product:membership.product,membership:{id:membership.id}}},memberships:[membership],now,occurrenceStartsAt:new Date('2026-10-07T21:10Z')})).toBe(true);
  const events=await db.creditAccount.findMany({where:{userId:f.id,sourcePurchaseId:null},include:{entries:true}});expect(events).toHaveLength(1);expect(events[0].entries.reduce((n,e)=>n+e.quantity,0)).toBe(1);
  expect(await db.auditLog.count({where:{actorId:f.id}})).toBe(1);
 });
 it.each(['cancelled','refunded','wrong-customer','wrong-amount','expired','managed','partial-credit','future','wrong-price'])('refuses unsafe %s recovery without writes',async kind=>{
  const f=await fixture();
  if(kind==='cancelled') await db.membership.update({where:{id:f.id},data:{status:'CANCELLED'}});
  if(kind==='refunded') await db.paymentRecord.updateMany({where:{userId:f.id},data:{status:'PARTIALLY_REFUNDED',refundedAmountCents:100}});
  if(kind==='wrong-price') f.proof.priceId='price_other';
  if(kind==='wrong-customer') f.proof.customerId='cus_other';
  if(kind==='wrong-amount') f.proof.amountCents=22200;
  if(kind==='expired') f.proof.periodEnd=new Date('2026-10-06T23:00Z');
  if(kind==='future') f.proof.periodStart=new Date('2026-10-08T00:00Z');
  if(kind==='managed') await db.membership.update({where:{id:f.id},data:{planChangeState:{paidEnd:1}}});
  if(kind==='partial-credit') await db.creditAccount.create({data:{userId:f.id,sourcePurchaseId:f.id,label:'Unexpected state',isUnlimited:false}});
  await expect(f.run()).rejects.toThrow();expect(await db.auditLog.count({where:{actorId:f.id}})).toBe(0);
 });
});
