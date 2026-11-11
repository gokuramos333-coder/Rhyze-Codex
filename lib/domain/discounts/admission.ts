import type { Prisma } from '@prisma/client';
import type Stripe from 'stripe';
import { campaignCheckout, campaignQuoteSnapshot } from './campaign';
export type DiscountCheckoutInput = {
 userId:string; productId:string; code:string; purchaseData:Prisma.PurchaseUncheckedCreateInput;
 build:(purchaseId:string)=>Promise<Stripe.Checkout.SessionCreateParams>;
 create:(params:Stripe.Checkout.SessionCreateParams, options:{idempotencyKey:string})=>Promise<{id:string;url:string|null;status?:string|null}>;
 retrieve:(id:string)=>Promise<{id:string;url:string|null;status?:string|null}>;
};
import { prisma } from '@/lib/db/prisma';
export class DiscountCheckoutExpiryError extends Error {}
type Admission = { userId:string; purchaseId:string; productId:string; code:string; params:Stripe.Checkout.SessionCreateParams|null; createdAt:Date; sessionId:string|null; url:string|null };
export async function runDiscountCheckout(input:DiscountCheckoutInput):Promise<string> {
 const admission = await prisma.$transaction(async tx => {
  // Serialize all in-flight discounts, but scope successful campaign use per sale.
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${input.userId} FOR UPDATE`;
  const [existing] = await tx.$queryRaw<Admission[]>`SELECT * FROM "DiscountCheckoutAdmission" WHERE "userId"=${input.userId}`;
  if (existing) {
   const purchase = await tx.purchase.findUniqueOrThrow({where:{id:existing.purchaseId}});
   if (['PAID','PARTIALLY_REFUNDED','REFUNDED'].includes(purchase.status)) {
    await tx.$executeRaw`DELETE FROM "DiscountCheckoutAdmission" WHERE "userId"=${input.userId} AND "purchaseId"=${existing.purchaseId}`;
   } else {
   if (existing.productId !== input.productId || existing.code !== input.code) throw Error('A discounted checkout is already in progress.');
   return existing;
   }
  }
  const campaignId = input.purchaseData.discountCampaignId;
  let quote: ReturnType<typeof campaignQuoteSnapshot> | undefined;
  if (campaignId) {
   // Conflicts with disable's UPDATE: the winner establishes the admission order.
   await tx.$queryRaw`SELECT "id" FROM "DiscountCampaign" WHERE "id"=${campaignId} FOR SHARE`;
   const campaign = await tx.discountCampaign.findUniqueOrThrow({where:{id:campaignId}});
   const product = await tx.product.findUniqueOrThrow({where:{id:input.productId}});
   campaignCheckout(campaign, product);
   quote = campaignQuoteSnapshot(campaign, product);
   if (input.purchaseData.amountCents !== quote.amountCents || input.purchaseData.discountCents !== quote.discountCents) throw Error('Discount price changed before admission; retry checkout.');
   const used = await tx.$queryRaw<{purchaseId:string}[]>`SELECT "purchaseId" FROM "CampaignRedemption" WHERE "userId"=${input.userId} AND "campaignId"=${campaignId}`;
   if (used.length || await tx.purchase.findFirst({where:{userId:input.userId,discountCents:{gt:0},status:'PENDING'}})) throw Error('Discount already used or checkout already in progress.');
  } else if (await tx.discountRedemption.findFirst({where:{userId:input.userId}}) || await tx.purchase.findFirst({where:{userId:input.userId,discountCents:{gt:0},status:{in:['PAID','PARTIALLY_REFUNDED','PENDING']}}})) throw Error('Discount already used or checkout already in progress.');
  const purchase = await tx.purchase.create({data:{...input.purchaseData,...(quote ? {amountCents:quote.amountCents,discountCents:quote.discountCents,discountQuote:quote} : {})}});
  if (quote) await tx.auditLog.create({data:{actorId:input.userId,action:'DISCOUNT_QUOTED',entityType:'Purchase',entityId:purchase.id,after:quote}});
  const [created] = await tx.$queryRaw<Admission[]>`INSERT INTO "DiscountCheckoutAdmission" ("userId","purchaseId","productId","code","createdAt") VALUES (${input.userId},${purchase.id},${input.productId},${input.code},clock_timestamp() AT TIME ZONE 'UTC') RETURNING *`;
  return created;
 });
 if (admission.sessionId) {
  const session = await input.retrieve(admission.sessionId);
  if (session.status === 'open' && session.url) {
   if (admission.params?.expires_at && Date.now() >= admission.params.expires_at*1000) throw new DiscountCheckoutExpiryError('Original checkout expiry reached.');
   return session.url;
  }
  if (session.status !== 'expired') throw Error('Checkout is settling or needs payment reconciliation.');
  await prisma.$transaction(async tx => {
   await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${input.userId} FOR UPDATE`;
   const purchase = await tx.purchase.findUniqueOrThrow({where:{id:admission.purchaseId}});
   if (!['PENDING','FAILED'].includes(purchase.status)) throw Error('Checkout has settled.');
   await tx.purchase.updateMany({where:{id:purchase.id,status:{in:['PENDING','FAILED']}},data:{status:'FAILED',failedAt:new Date()}});
   await tx.$executeRaw`DELETE FROM "DiscountCheckoutAdmission" WHERE "userId"=${input.userId} AND "purchaseId"=${admission.purchaseId}`;
  });
  return runDiscountCheckout(input);
 }
 // Provider idempotency may be evicted after 24 hours. Unknown outcomes remain
 // reserved after 23h and require reconciliation; never mint a second payment.
 if (Date.now()-admission.createdAt.getTime() > 23*60*60*1000) throw Error('Checkout needs payment reconciliation. Contact the studio.');
 const params = await prisma.$transaction(async tx => {
  const [current] = await tx.$queryRaw<Admission[]>`SELECT * FROM "DiscountCheckoutAdmission" WHERE "userId"=${input.userId} FOR UPDATE`;
  if (current.params) return current.params;
  const purchase = await tx.purchase.findUniqueOrThrow({where:{id:current.purchaseId}});
  const built = await input.build(current.purchaseId);
  if (purchase.discountCampaignId) {
   await tx.$queryRaw`SELECT "id" FROM "DiscountCampaign" WHERE "id"=${purchase.discountCampaignId} FOR SHARE`;
   // Final issuance authorization under the campaign lock, after coupon work.
   // This immutable payload is reused even when an outcome is unknown.
   const campaign=await tx.discountCampaign.findUniqueOrThrow({where:{id:purchase.discountCampaignId}});
   const product=await tx.product.findUniqueOrThrow({where:{id:input.productId}});
   const quote=campaignQuoteSnapshot(campaign,product);
   if (input.purchaseData.amountCents !== quote.amountCents || input.purchaseData.discountCents !== quote.discountCents) throw Error('Discount payload price changed; reconciliation required.');
   if (purchase.discountQuote && JSON.stringify(purchase.discountQuote, Object.keys(quote).sort()) !== JSON.stringify(quote, Object.keys(quote).sort())) throw Error('Discount quote changed; reconciliation required.');
   if (purchase.amountCents!==quote.amountCents || purchase.discountCents!==quote.discountCents) throw Error('Discount price changed; reconciliation required.');
   built.expires_at = campaignCheckout(campaign, product).expiresAt;
  }
  // Persist the exact wire payload BEFORE session creation, including expiry.
  const serialized = JSON.stringify(built);
  await tx.$executeRaw`UPDATE "DiscountCheckoutAdmission" SET "params"=${serialized}::jsonb WHERE "userId"=${input.userId}`;
  return JSON.parse(serialized) as Stripe.Checkout.SessionCreateParams;
 }, { timeout: 20000 });
 let checkout;
 try {
  checkout = await input.create(params, {idempotencyKey:`checkout-${admission.purchaseId}`});
 } catch (error) {
  const providerError = error as {type?:string;param?:string};
  // A validation rejection does NOT prove another in-flight call failed.
  // Keep purchase, reservation, payload and key intact for reconciliation.
  if (providerError?.type === 'StripeInvalidRequestError' && providerError.param === 'expires_at') throw new DiscountCheckoutExpiryError('Provider rejected the original checkout expiry.');
  throw error;
 }
 if (!checkout.url) throw Error('Checkout needs payment reconciliation.');
 await prisma.$transaction(async tx => {
  await tx.purchase.update({where:{id:admission.purchaseId},data:{stripeCheckoutSessionId:checkout.id}});
  await tx.$executeRaw`UPDATE "DiscountCheckoutAdmission" SET "sessionId"=${checkout.id}, "url"=${checkout.url} WHERE "userId"=${input.userId} AND "purchaseId"=${admission.purchaseId}`;
 });
 return checkout.url;
}
