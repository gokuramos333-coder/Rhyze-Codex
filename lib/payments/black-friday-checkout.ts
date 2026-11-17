import { blackFridaySalesEnabled } from './black-friday-release-gate';
import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type Stripe from 'stripe';
import { blackFridayOffer, specialEventCreditAllowed, specialEventIdentity, normalizeFriendPhone, normalizedFriendName } from './black-friday-new-friend';
import { inspectNewFriendHistory } from './black-friday-new-friend-history';
import { retrySerializableTransaction } from './transaction-retry';
import { lockMembershipEntitlements } from '@/lib/domain/credits/entitlement-lock';

import { vipMonthlyBenefitWindowForDate } from '@/lib/domain/credits/vip-monthly-benefits';
import { giftedVipThrough, vipMembershipPaidThrough, vipEntitlementInclude } from '@/lib/domain/credits/vip-access';

type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaClient;
export const BLACK_FRIDAY_ID = 'cmvv9bp4g0001gt09ewtk8n57';
export type Ticket = { orderId: string; occurrenceId: string; userId: string; state: string; seats: number; buyerName: string; guestName: string|null; guestPhone: string|null; guestUserId: string|null; buyerBookingId: string|null; guestBookingId: string|null; creditAccountId: string|null; expiresAt: Date; parameters: Stripe.Checkout.SessionCreateParams };
const run = <T>(db: PrismaClient, fn: (tx: Tx)=>Promise<T>) => retrySerializableTransaction(()=>db.$transaction(fn,{isolationLevel:'Serializable'}));
async function lock(tx: Tx, occurrenceId: string) { await tx.$executeRaw`SELECT id FROM "ClassOccurrence" WHERE id=${occurrenceId} FOR UPDATE`; }
async function ticket(tx: Db, orderId: string) { return (await tx.$queryRaw<Ticket[]>`SELECT * FROM "BlackFridayTicket" WHERE "orderId"=${orderId}`)[0]; }
async function account(tx: Tx, userId: string) {
 const user = await tx.user.findUnique({where:{id:userId},include:{memberProfile:true}});
 const waiver = await tx.waiverVersion.findFirst({where:{isActive:true,requiresSign:true},orderBy:{effectiveAt:'desc'}});
 if (!user || user.status!=='ACTIVE' || !waiver || !await tx.waiverAcceptance.findUnique({where:{waiverVersionId_userId:{waiverVersionId:waiver.id,userId}}})) throw new Error('An active account and current waiver are required.');
 return user;
}
async function releaseCredit(tx:Tx,t:Ticket) {
 if(t.creditAccountId) await tx.creditLedgerEntry.upsert({where:{sourceReturnKey:`bf:${t.orderId}:release`},update:{},create:{creditAccountId:t.creditAccountId,type:'RELEASE',quantity:1,sourceReturnKey:`bf:${t.orderId}:release`,reason:'Verified terminal Black Friday checkout; original November credit window unchanged'}});
}
function ticketBookingPolicy(orderId:string,attendee:'BUYER'|'GUEST',occurrence:{id:string;startAt:Date;endAt:Date},amountCents:number){
 // Preserve protections understood by older deployed booking/fee handlers.
 // This binding identifies the whole purchased ticket, not a per-person charge.
 return {blackFridayOrderId:orderId,attendee,accessType:'STANDARD',classTicket:{occurrenceId:occurrence.id,name:'Two-option event ticket',startAt:occurrence.startAt.toISOString(),endAt:occurrence.endAt.toISOString(),amountCents}};
}
export async function startBlackFridayCheckout(db: PrismaClient, stripe: Stripe, input: {userId:string; occurrenceId:string; slug:string; origin:string; ticketType:'SINGLE'|'PAIR'; friend?:{fullName:string;phone:string}; firstVisitDeclared?:boolean; useEventCredit?:boolean}, now=new Date()) {
 if(!blackFridaySalesEnabled()) throw new Error('Special ticket sales are not open yet.');
 if(!specialEventIdentity(input.occurrenceId,input.slug)) throw new Error('This offer is unavailable.');
 const pair=input.ticketType==='PAIR';
 if(pair && (!input.friend || input.firstVisitDeclared!==true)) throw new Error('Full friend contact and first-visit declaration are required.');
 if(!pair && (input.friend || input.useEventCredit || input.firstVisitDeclared)) throw new Error('Use the existing event-credit link for one attendee.');
 const held=await run(db,async tx=>{
  // Match member booking and studio cancellation: occurrence admission first, then entitlement.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.occurrenceId}))`;
  await lockMembershipEntitlements(tx,input.userId); await lock(tx,input.occurrenceId);
  const user=await account(tx,input.userId);
  const o=await tx.classOccurrence.findUnique({where:{id:input.occurrenceId},include:{template:true}});
  if(!o || o.status!=='SCHEDULED' || o.startAt<=now || !o.template.isActive || o.template.archivedAt || !blackFridayOffer({occurrenceId:o.id,slug:input.slug,startAt:o.startAt,endAt:o.endAt,priceCents:o.priceCents ?? o.template.dropInPriceCents ?? 0,isEvent:o.template.isEvent}) || input.slug!==o.template.slug) throw new Error('This offer is unavailable.');
  if(pair && (await inspectNewFriendHistory(tx,input.friend!,user.id,now,true)).status!=='ELIGIBLE') throw new Error('This friend cannot be automatically approved. Please contact staff for review.');
  const name=pair?input.friend!.fullName.normalize('NFKC').trim().replace(/\s+/g,' '):null;
  const phone=pair?normalizeFriendPhone(input.friend!.phone):null;
  // An older checkout may still be payable even if the local order says failed.
  // Only the provider can prove it expired; never create a second payment here.
  const earlierOrders=await tx.$queryRaw<{id:string}[]>`SELECT o.id FROM "CommerceOrder" o LEFT JOIN "BlackFridayTicket" t ON t."orderId"=o.id WHERE o."userId"=${user.id} AND o."occurrenceId"=${o.id} AND t."orderId" IS NULL LIMIT 1`;
  if(earlierOrders.length)throw new Error('An earlier event checkout needs staff review before starting another payment.');
  if(pair && (await tx.$queryRaw<{id:string}[]>`SELECT b.id FROM "Booking" b JOIN "User" u ON u.id=b."userId" WHERE b."occurrenceId"=${o.id} AND lower(regexp_replace(trim(normalize(COALESCE(u.name,''), NFKC)), '\\s+', ' ', 'g'))=${normalizedFriendName(name!)} LIMIT 1`).length) throw new Error('Friend booking history requires staff review before payment.');
  const prior=(await tx.$queryRaw<Ticket[]>`SELECT * FROM "BlackFridayTicket" WHERE "userId"=${user.id} AND "occurrenceId"=${o.id} AND state NOT IN ('EXPIRED','REFUNDED','DISPUTE_LOST')`)[0];
  if(prior){
   if(prior.state!=='HELD' || prior.guestName!==name || prior.guestPhone!==phone || Boolean(prior.creditAccountId)!==Boolean(input.useEventCredit)) throw new Error('An existing ticket requires staff review.');
   return {t:prior,order:await tx.commerceOrder.findUniqueOrThrow({where:{id:prior.orderId}})};
  }
  if(await tx.booking.findFirst({where:{occurrenceId:o.id,userId:user.id}})) throw new Error('Existing booking history requires staff review before payment.');
  const id=randomUUID(); let creditAccountId:string|null=null;
  if(input.useEventCredit){
   const window=vipMonthlyBenefitWindowForDate(now);
   const memberships=await tx.membership.findMany({where:{userId:user.id},include:vipEntitlementInclude});
   const eligible=memberships.some(m=>{const end=vipMembershipPaidThrough(m,now)||giftedVipThrough(m,now);return Boolean(end && o.startAt<end);});
   const accounts=await tx.creditAccount.findMany({where:{userId:user.id,label:window.eventCreditLabel,isUnlimited:false,sourcePurchaseId:null},include:{entries:true}});
   const credit=accounts.find(a=>specialEventCreditAllowed(a) && a.validFrom<=now && a.validFrom<=o.startAt && a.validUntil && a.validUntil>now && a.validUntil>o.startAt && a.entries.reduce((s,e)=>s+e.quantity,0)>0);
   if(!eligible || !credit) throw new Error('A valid November VIP event credit covering this event is required. Credits do not roll over.');
   creditAccountId=credit.id;
   await tx.creditLedgerEntry.create({data:{creditAccountId,type:'RESERVE',quantity:-1,sourceReturnKey:`bf:${id}:reserve`,reason:'One VIP event credit ($25 event admission) reserved for a two-person event ticket'}});
  }
  const amountCents=(pair?4000:2500)-(creditAccountId?2500:0);
  const expiresAt=new Date(now.getTime()+31*60*1000);
  const parameters:Stripe.Checkout.SessionCreateParams={mode:'payment',payment_method_types:['card'],expires_at:Math.floor(expiresAt.getTime()/1000),customer_email:user.email,line_items:[{quantity:1,price_data:{currency:'usd',unit_amount:amountCents,product_data:{name:o.titleOverride||o.template.name,description:pair?'Buyer + NEW friend: two spots; friend needs own account and waiver.':'One attendee'}}}],metadata:{purchaseType:'EVENT',blackFridayTicket:'1',commerceOrderId:id,userId:user.id,occurrenceId:o.id},payment_intent_data:{metadata:{purchaseType:'EVENT',blackFridayTicket:'1',commerceOrderId:id,userId:user.id,occurrenceId:o.id}},client_reference_id:id,success_url:`${input.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${input.origin}/book/event/${o.template.slug}?occurrence=${o.id}`};
  const order=await tx.commerceOrder.create({data:{id,userId:user.id,occurrenceId:o.id,kind:'EVENT',amountCents,customerName:user.name,customerEmail:user.email,items:{create:{productReference:o.id,name:o.template.name,description:pair?'Two named attendees':'One attendee',quantity:1,unitAmountCents:amountCents}}}});
  await tx.$executeRaw`INSERT INTO "BlackFridayTicket" ("orderId","occurrenceId","userId",state,seats,"buyerName","guestName","guestPhone","declaredAt","creditAccountId","expiresAt",parameters) VALUES (${id},${o.id},${user.id},'HELD',${pair?2:1},${user.name||'Attendee'},${name},${phone},${pair?now.toISOString():null}::timestamp,${creditAccountId},${expiresAt.toISOString()}::timestamp,${JSON.stringify(parameters)}::jsonb)`;
  await tx.auditLog.create({data:{actorId:user.id,action:'black-friday.reserved',entityType:'CommerceOrder',entityId:id,after:{seats:pair?2:1,firstVisitDeclaration:pair?'This is my friend’s first visit':null,policy:'owner-approved-declaration-v1'}}});
  return {t:(await ticket(tx,id))!,order};
 });
 if(!held.order.stripeCheckoutSessionId && now>=held.t.expiresAt) throw new Error('Checkout outcome is uncertain. Contact staff; seats remain reserved.');
 const session=held.order.stripeCheckoutSessionId?await stripe.checkout.sessions.retrieve(held.order.stripeCheckoutSessionId):await stripe.checkout.sessions.create(held.t.parameters,{idempotencyKey:`black-friday:${held.order.id}`});
 await run(db,async tx=>{await lock(tx,held.t.occurrenceId);const order=await tx.commerceOrder.findUniqueOrThrow({where:{id:held.order.id}});if(order.stripeCheckoutSessionId && order.stripeCheckoutSessionId!==session.id) throw new Error('Checkout identity mismatch');await tx.commerceOrder.update({where:{id:order.id},data:{stripeCheckoutSessionId:session.id}});if(session.status==='expired')await applyBlackFridaySession(tx,session,now);});
 if(session.status!=='open'||!session.url)throw new Error('Checkout is closed. Refresh to start again or contact staff.');
 return {url:session.url,orderId:held.order.id};
}
export async function applyBlackFridaySession(tx:Tx,session:Stripe.Checkout.Session,now=new Date()) {
 const orderId=session.metadata?.commerceOrderId;
 if(!orderId||session.metadata?.blackFridayTicket!=='1')return false;
 const observed=await ticket(tx,orderId); if(!observed)throw new Error('Missing event reservation');
 await lock(tx,observed.occurrenceId); const t=(await ticket(tx,orderId))!;
 const order=await tx.commerceOrder.findUniqueOrThrow({where:{id:orderId}});
 const pi=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id;
 if((order.stripeCheckoutSessionId && order.stripeCheckoutSessionId!==session.id)||session.metadata?.userId!==t.userId||session.metadata?.occurrenceId!==t.occurrenceId||(order.stripePaymentIntentId && order.stripePaymentIntentId!==pi))throw new Error('Ticket payment identity mismatch');
 if(session.status==='expired' && session.payment_status!=='paid'){
  if(t.state==='HELD'){await tx.$executeRaw`UPDATE "BlackFridayTicket" SET state='EXPIRED' WHERE "orderId"=${orderId}`;await releaseCredit(tx,t);await tx.commerceOrder.update({where:{id:orderId},data:{status:'PAYMENT_FAILED',stripeCheckoutSessionId:session.id}});} return true;
 }
 if(session.status!=='complete'||session.payment_status!=='paid')return true;
 if(!pi||session.amount_total!==order.amountCents||session.currency!==order.currency)throw new Error('Ticket payment terms mismatch');
 if(['REFUNDED','DISPUTE_LOST','REVIEW','PAID','REVERSING'].includes(t.state))return true;
 const o=await tx.classOccurrence.findUniqueOrThrow({where:{id:t.occurrenceId}});
 const reversals=await tx.stripeEvent.findMany({where:{type:{in:['charge.refunded','charge.dispute.created']},payload:{path:['data','object','payment_intent'],equals:pi}}});
 let review=t.state!=='HELD'||o.status!=='SCHEDULED'||o.startAt<=now||reversals.length>0||order.refundedAmountCents>0||['REFUNDED','PARTIALLY_REFUNDED','DISPUTED'].includes(order.status);
 try {await account(tx,t.userId);} catch {review=true;}
 if(t.seats===2 && (await inspectNewFriendHistory(tx,{fullName:t.guestName!,phone:t.guestPhone!},t.userId,now,true)).status!=='ELIGIBLE')review=true;
 if(await tx.booking.findFirst({where:{occurrenceId:t.occurrenceId,userId:t.userId}}))review=true;
 // A late paid callback after verified expiry must not reacquire released seats.
 const state=review?(t.state==='EXPIRED'?'EXPIRED':'REVIEW'):'PAID';
 const bookingId=review?null:randomUUID();
 await tx.$executeRaw`UPDATE "BlackFridayTicket" SET state=${state},"buyerBookingId"=${bookingId} WHERE "orderId"=${orderId}`;
 if(bookingId)await tx.booking.create({data:{id:bookingId,userId:t.userId,occurrenceId:t.occurrenceId,source:'STRIPE_EVENT',policySnapshot:ticketBookingPolicy(orderId,'BUYER',o,order.amountCents)}});
 await tx.commerceOrder.update({where:{id:orderId},data:{status:review?'FULFILLMENT_REVIEW':'PAID',paidAt:now,stripeCheckoutSessionId:session.id,stripePaymentIntentId:pi}});
 const existing=await tx.paymentRecord.findFirst({where:{OR:[{stripePaymentIntentId:pi},{stripeCheckoutSessionId:session.id}]}});
 if(existing && existing.commerceOrderId!==orderId)throw new Error('Payment ownership mismatch');
 if(!existing)await tx.paymentRecord.create({data:{userId:t.userId,commerceOrderId:orderId,kind:'EVENT',status:'SUCCEEDED',stripeEventId:`black-friday-session:${session.id}`,amountCents:order.amountCents,currency:order.currency,stripeCheckoutSessionId:session.id,stripePaymentIntentId:pi,occurredAt:now,customerName:order.customerName,customerEmail:order.customerEmail}});
 await tx.auditLog.create({data:{action:review?'black-friday.payment-review':'black-friday.paid',entityType:'CommerceOrder',entityId:orderId}});
 return true;
}
export async function blackFridayRoster(db:Db,occurrenceId:string){
 if(!specialEventIdentity(occurrenceId))return [];
 const tickets=await db.$queryRaw<Ticket[]>`SELECT * FROM "BlackFridayTicket" WHERE "occurrenceId"=${occurrenceId} AND state IN ('HELD','PAID','REVIEW','REVERSING','EXPIRED') ORDER BY "orderId"`;
 return tickets.flatMap(t=>[{orderId:t.orderId,name:t.buyerName,userId:t.userId,bookingId:t.buyerBookingId,manage:true,state:t.state,review:t.state!=='PAID'},...(t.seats===2?[{orderId:t.orderId,name:t.guestName!,userId:t.guestUserId,bookingId:t.guestBookingId,manage:false,state:t.state,review:t.state!=='PAID'}]:[])]);
}
/** Authenticated guest claims only their own account. Contact is not login authentication. */
export async function claimBlackFridayGuest(db:PrismaClient,input:{orderId:string;userId:string;actorId:string},now=new Date()){
 return run(db,async tx=>{
 const actor=await tx.user.findUnique({where:{id:input.actorId}});
 if(!actor||!['OWNER','ADMIN'].includes(actor.role)||actor.status!=='ACTIVE')throw new Error('Staff authorization required for guest identity verification');
 const observed=await ticket(tx,input.orderId);if(!observed)throw Error('Ticket not found');await lock(tx,observed.occurrenceId);const t=await ticket(tx,input.orderId);const user=await account(tx,input.userId);
 if(!t||t.state!=='PAID'||t.seats!==2||t.userId===user.id)throw new Error('Ticket requires staff review');
 if(t.guestUserId){if(t.guestUserId===user.id)return;throw new Error('Already claimed');}
 if(normalizeFriendPhone(user.memberProfile?.phone)!==t.guestPhone||!user.name||normalizedFriendName(user.name)!==normalizedFriendName(t.guestName!))throw new Error('Your account contact must match; contact staff for corrections');
 if((await inspectNewFriendHistory(tx,{fullName:t.guestName!,phone:t.guestPhone!},t.userId,now,true)).status!=='ELIGIBLE')throw new Error('First-visit eligibility needs staff review');
 const order=await tx.commerceOrder.findUniqueOrThrow({where:{id:t.orderId}});
 if(order.status!=='PAID'||order.refundedAmountCents||await tx.commerceRefund.findFirst({where:{commerceOrderId:t.orderId,status:{in:['PENDING','SUCCEEDED']}}}))throw new Error('Payment requires staff review');
 const o=await tx.classOccurrence.findUniqueOrThrow({where:{id:t.occurrenceId}});if(o.status!=='SCHEDULED'||o.startAt<=now)throw new Error('Event unavailable');
 if(await tx.booking.findFirst({where:{occurrenceId:t.occurrenceId,userId:user.id}}))throw new Error('Existing booking needs staff review');
 const bookingId=randomUUID();await tx.$executeRaw`UPDATE "BlackFridayTicket" SET "guestUserId"=${user.id},"guestBookingId"=${bookingId} WHERE "orderId"=${t.orderId}`;
 await tx.booking.create({data:{id:bookingId,occurrenceId:t.occurrenceId,userId:user.id,source:'STRIPE_EVENT',policySnapshot:ticketBookingPolicy(t.orderId,'GUEST',o,order.amountCents)}});
 await tx.auditLog.create({data:{actorId:input.actorId,action:'black-friday.guest-claimed',entityType:'CommerceOrder',entityId:t.orderId,after:{userId:user.id}}});
 });
}
/** Retain refund identities and statuses; aggregates alone do not prove settlement. */
export async function applyBlackFridayRefunds(tx:Tx,orderId:string,paymentIntentId:string,refunds:Stripe.Refund[],now=new Date()){
 const observed=await ticket(tx,orderId);if(!observed)throw Error('Ticket not found');await lock(tx,observed.occurrenceId);const order=await tx.commerceOrder.findUniqueOrThrow({where:{id:orderId}});
 if(order.stripePaymentIntentId!==paymentIntentId)throw new Error('Refund payment ownership mismatch');
 for(const r of refunds){
  const pi=typeof r.payment_intent==='string'?r.payment_intent:r.payment_intent?.id;
  if(pi!==paymentIntentId||r.currency!==order.currency||!r.id||r.amount<=0||r.amount>order.amountCents)throw new Error('Refund terms mismatch');
  const prior=await tx.commerceRefund.findUnique({where:{stripeRefundId:r.id}});
  if(prior&&(prior.commerceOrderId!==orderId||prior.amountCents!==r.amount))throw new Error('Refund identity mismatch');
  if(prior?.status==='SUCCEEDED')continue;
  const status=r.status==='succeeded'?'SUCCEEDED':['failed','canceled'].includes(r.status||'')?'FAILED':'PENDING';
  await tx.commerceRefund.upsert({where:{stripeRefundId:r.id},create:{commerceOrderId:orderId,amountCents:r.amount,stripeRefundId:r.id,status,providerStatus:r.status,verifiedAt:now,reason:'Black Friday provider reconciliation'},update:{status,providerStatus:r.status,verifiedAt:now}});
 }
 const settled=await tx.commerceRefund.aggregate({where:{commerceOrderId:orderId,status:'SUCCEEDED'},_sum:{amountCents:true}});
 return reverseBlackFridayTicket(tx,{orderId,paymentIntentId,refundedAmountCents:settled._sum.amountCents||0,disputed:false},now);
}
/** Verified provider evidence only. Partial refund/dispute retain seats for staff review. */
export async function reverseBlackFridayTicket(tx:Tx,input:{orderId:string;paymentIntentId:string;refundedAmountCents:number;disputed:boolean;disputeLost?:boolean},now=new Date()){
 const observed=await ticket(tx,input.orderId);if(!observed)throw Error('Ticket not found');await lock(tx,observed.occurrenceId);const t=await ticket(tx,input.orderId);if(!t)return false;
 const order=await tx.commerceOrder.findUniqueOrThrow({where:{id:t.orderId}});
 if(!order.stripePaymentIntentId||order.stripePaymentIntentId!==input.paymentIntentId)throw new Error('Reversal identity mismatch');
 if(['REFUNDED','DISPUTE_LOST'].includes(t.state))return true;
 const full=Boolean(input.disputeLost)||(input.refundedAmountCents>=order.amountCents && !input.disputed);
 if(full){
  if(t.state!=='EXPIRED'){
  await tx.$executeRaw`UPDATE "BlackFridayTicket" SET state='REVERSING' WHERE "orderId"=${t.orderId}`;
  const ids=[t.buyerBookingId,t.guestBookingId].filter((id):id is string=>Boolean(id));
  await tx.attendanceRecord.deleteMany({where:{bookingId:{in:ids}}});
  await tx.booking.updateMany({where:{id:{in:ids}},data:{status:'CANCELLED',cancelledAt:now}});
  }
  await tx.$executeRaw`UPDATE "BlackFridayTicket" SET state=${input.disputeLost?'DISPUTE_LOST':'REFUNDED'} WHERE "orderId"=${t.orderId}`;await releaseCredit(tx,t);
 }else if(t.state!=='EXPIRED')await tx.$executeRaw`UPDATE "BlackFridayTicket" SET state='REVIEW' WHERE "orderId"=${t.orderId}`;
 await tx.commerceOrder.update({where:{id:t.orderId},data:{status:input.disputed?'DISPUTED':full?'REFUNDED':'PARTIALLY_REFUNDED',refundedAmountCents:Math.max(order.refundedAmountCents,input.refundedAmountCents)}});
 await tx.paymentRecord.updateMany({where:{commerceOrderId:t.orderId,stripePaymentIntentId:input.paymentIntentId},data:{status:input.disputed?'DISPUTED':full?'REFUNDED':'PARTIALLY_REFUNDED',refundedAmountCents:Math.max(order.refundedAmountCents,input.refundedAmountCents)}});
 await tx.auditLog.create({data:{action:full?'black-friday.released':'black-friday.reversal-review',entityType:'CommerceOrder',entityId:t.orderId}});return true;
}
