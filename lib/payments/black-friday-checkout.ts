import { assertFinancialRelease, assertFinancialSubmission, withFinancialRelease } from '@/lib/payments/financial-release';
import { assertStripeObjectMode } from './stripe-mode';
import { blackFridaySalesEnabled } from './black-friday-release-gate';
import { randomUUID } from 'node:crypto';
import { Prisma, type CommerceOrder, type PrismaClient } from '@prisma/client';
import type Stripe from 'stripe';
import { specialEventOfferMatches, specialEventCashPrice, specialEventCreditAllowed, specialEventIdentity, normalizeFriendPhone, normalizedFriendName } from './black-friday-new-friend';
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
 if(t.creditAccountId) await tx.creditLedgerEntry.upsert({where:{sourceReturnKey:`bf:${t.orderId}:release`},update:{},create:{creditAccountId:t.creditAccountId,type:'RELEASE',quantity:1,sourceReturnKey:`bf:${t.orderId}:release`,reason:'Verified terminal Black Friday checkout; original credit window unchanged'}});
}
export function ticketBookingPolicy(orderId:string,attendee:'BUYER'|'GUEST',occurrence:{id:string;startAt:Date;endAt:Date},amountCents:number){
 // Preserve protections understood by older deployed booking/fee handlers.
 // This binding identifies the whole purchased ticket, not a per-person charge.
 return {blackFridayOrderId:orderId,attendee,accessType:'STANDARD',classTicket:{occurrenceId:occurrence.id,name:'Two-option event ticket',startAt:occurrence.startAt.toISOString(),endAt:occurrence.endAt.toISOString(),amountCents}};
}
async function guestSeatCollision(tx:Tx, occurrenceId:string, name:string|null, phone?:string|null) {
 const [row]=await tx.$queryRaw<{id:string}[]>`SELECT "orderId" AS id FROM "BlackFridayTicket"
  WHERE "occurrenceId"=${occurrenceId} AND state NOT IN ('EXPIRED','REFUNDED','DISPUTE_LOST')
  AND ("guestPhone"=${normalizeFriendPhone(phone)} OR lower(regexp_replace(trim(normalize("guestName",NFKC)), '\\s+', ' ', 'g'))=${normalizedFriendName(name || '')}) LIMIT 1`;
 return Boolean(row);
}

async function guestHasAnotherSeat(tx:Tx,occurrenceId:string,name:string,phone:string,includeHistory:boolean,excludeOrderId:string|null=null){
 const digits=phone.slice(1), domestic=digits.length===11 && digits.startsWith('1') ? digits.slice(1) : digits;
 const [row]=await tx.$queryRaw<{id:string}[]>`SELECT u.id FROM "User" u LEFT JOIN "MemberProfile" p ON p."userId"=u.id
   WHERE (lower(regexp_replace(trim(normalize(COALESCE(u.name,''),NFKC)), '\\s+', ' ', 'g'))=${normalizedFriendName(name)}
    OR regexp_replace(COALESCE(p.phone,''),'[^0-9]','','g') IN (${digits},${domestic}))
   AND (EXISTS (SELECT 1 FROM "Booking" b WHERE b."occurrenceId"=${occurrenceId} AND b."userId"=u.id AND (b.status IN ('CONFIRMED','ATTENDED') OR ${includeHistory}))
    OR EXISTS (SELECT 1 FROM "BlackFridayTicket" t WHERE t."occurrenceId"=${occurrenceId} AND t."userId"=u.id
       AND t."orderId" IS DISTINCT FROM ${excludeOrderId} AND t.state NOT IN ('EXPIRED','REFUNDED','DISPUTE_LOST'))) LIMIT 1`;
 return Boolean(row);
}

async function readLegacyExpiries(db:PrismaClient,stripe:Stripe,userId:string,occurrenceId:string){
 const orders=await db.$queryRaw<{id:string;sessionId:string}[]>`SELECT o.id,o."stripeCheckoutSessionId" AS "sessionId"
  FROM "CommerceOrder" o LEFT JOIN "BlackFridayTicket" t ON t."orderId"=o.id
  WHERE t."orderId" IS NULL AND o."userId"=${userId} AND o."occurrenceId"=${occurrenceId}
  AND o.status IN ('PENDING','PAYMENT_FAILED') AND o."stripeCheckoutSessionId" IS NOT NULL ORDER BY o.id`;
 const evidence=new Map<string,Stripe.Checkout.Session>();
 for(const order of orders){
  let session;
  try { session=await stripe.checkout.sessions.retrieve(order.sessionId,{expand:['payment_intent']},{timeout:2500,maxNetworkRetries:0}); }
  catch { throw Error('An earlier event checkout needs staff review.'); }
  if (!session || session.id!==order.sessionId || !verifiedUnpaidExpiry(session)) continue;
  assertStripeObjectMode(session);
  evidence.set(order.id,session);
 }
 return evidence;
}
async function verifyLegacyOrders(tx:Tx,userId:string,occurrenceId:string,evidence:Map<string,Stripe.Checkout.Session>){
 const orders=await tx.$queryRaw<CommerceOrder[]>`SELECT o.* FROM "CommerceOrder" o LEFT JOIN "BlackFridayTicket" t ON t."orderId"=o.id
  WHERE o."userId"=${userId} AND o."occurrenceId"=${occurrenceId} AND t."orderId" IS NULL ORDER BY o.id FOR UPDATE OF o`;
 for (const o of orders){
  const s=evidence.get(o.id);
  if (!s || s.mode!=='payment' || s.metadata?.purchaseType!=='EVENT' || s.metadata.blackFridayTicket ||
    s.client_reference_id!==o.id || s.metadata.commerceOrderId!==o.id || s.metadata.userId!==userId || s.metadata.occurrenceId!==occurrenceId ||
    s.amount_total!==o.amountCents || s.currency!==o.currency || o.currency!=='usd' || o.stripeCheckoutSessionId!==s.id) throw Error('An earlier event checkout needs staff review.');
  await lockCheckoutEvidence(tx,o.id,s);
  if (!await locallyUnpaid(tx,o.id,s,true)) throw Error('An earlier event checkout needs staff review.');
 }
}
export async function startBlackFridayCheckout(db: PrismaClient, stripe: Stripe, input: {userId:string; occurrenceId:string; slug:string; origin:string; ticketType:'SINGLE'|'PAIR'; friend?:{fullName:string;phone:string}; firstVisitDeclared?:boolean; useEventCredit?:boolean}, now=new Date()) {
 if(!blackFridaySalesEnabled()) throw new Error('Special ticket sales are not open yet.');
 await assertFinancialRelease(db);
 const offer=specialEventIdentity(input.occurrenceId,input.slug);
 if(!offer) throw new Error('This offer is unavailable.');
 const pair=input.ticketType==='PAIR';
 if(pair && (!input.friend || (offer.requiresFirstVisit && input.firstVisitDeclared!==true))) throw new Error('Full friend contact and first-visit declaration are required.');
 if(input.useEventCredit && offer.vipPairCashCents===null) throw new Error('This pair is available for cash only.');
 if(!pair && (input.friend || input.useEventCredit || input.firstVisitDeclared)) throw new Error('Use the existing event-credit link for one attendee.');
 const legacyExpiry=await readLegacyExpiries(db,stripe,input.userId,input.occurrenceId);
 const held=await run(db,async tx=>{
  await assertFinancialRelease(tx);
  // Match member booking and studio cancellation: occurrence admission first, then entitlement.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.occurrenceId}))`;
  await lockMembershipEntitlements(tx,input.userId); await lock(tx,input.occurrenceId);
  const user=await account(tx,input.userId);
  const o=await tx.classOccurrence.findUnique({where:{id:input.occurrenceId},include:{template:true}});
  if(!o || o.status!=='SCHEDULED' || o.startAt<=now || !o.template.isActive || o.template.archivedAt || !specialEventOfferMatches(o) || input.slug!==o.template.slug) throw new Error('This offer is unavailable.');
  if(pair && offer.requiresFirstVisit && (await inspectNewFriendHistory(tx,input.friend!,user.id,now,true)).status!=='ELIGIBLE') throw new Error('This friend cannot be automatically approved. Please contact staff for review.');
  const name=pair?input.friend!.fullName.normalize('NFKC').trim().replace(/\s+/g,' '):null;
  const phone=pair?normalizeFriendPhone(input.friend!.phone):null;
  if(pair && (!phone || !name || name.length>120 || name.length<3 || !name.includes(' ') ||
    phone===normalizeFriendPhone(user.memberProfile?.phone) || normalizedFriendName(name)===normalizedFriendName(user.name || ''))) throw Error('A distinct friend with a full name and phone is required.');
  await verifyLegacyOrders(tx,user.id,o.id,legacyExpiry);
  if (await guestSeatCollision(tx,o.id,user.name,user.memberProfile?.phone)) throw Error('Existing guest seat requires review.');
  if(pair && await guestHasAnotherSeat(tx,o.id,name!,phone!,offer.requiresFirstVisit)) throw Error('Friend booking history requires staff review before payment.');
  const prior=(await tx.$queryRaw<Ticket[]>`SELECT * FROM "BlackFridayTicket" WHERE "userId"=${user.id} AND "occurrenceId"=${o.id} AND state NOT IN ('EXPIRED','REFUNDED','DISPUTE_LOST')`)[0];
  if(prior){
   if(prior.state!=='HELD' || prior.guestName!==name || prior.guestPhone!==phone || Boolean(prior.creditAccountId)!==Boolean(input.useEventCredit)) throw new Error('An existing ticket requires staff review.');
   return {t:prior,order:await tx.commerceOrder.findUniqueOrThrow({where:{id:prior.orderId}})};
  }
  if(await tx.booking.findFirst({where:{occurrenceId:o.id,userId:user.id}})) throw new Error('Existing booking history requires staff review before payment.');
  const id=randomUUID(); let creditAccountId:string|null=null;
  if(input.useEventCredit){
   const window=vipMonthlyBenefitWindowForDate(o.startAt);
   const memberships=await tx.membership.findMany({where:{userId:user.id},include:vipEntitlementInclude});
   const eligible=memberships.some(m=>{const end=vipMembershipPaidThrough(m,now)||giftedVipThrough(m,now);return Boolean(end && o.startAt<end);});
   const accounts=await tx.creditAccount.findMany({where:{userId:user.id,label:window.eventCreditLabel,isUnlimited:false,sourcePurchaseId:null},include:{entries:true}});
   const credit=accounts.find(a=>specialEventCreditAllowed(a) && a.validFrom<=now && a.validFrom<=o.startAt && a.validUntil && a.validUntil>now && a.validUntil>o.startAt && a.entries.reduce((s,e)=>s+e.quantity,0)>0);
   if(!eligible || !credit) throw new Error('A valid monthly VIP event credit covering this event is required. Credits do not roll over.');
   creditAccountId=credit.id;
   await tx.creditLedgerEntry.create({data:{creditAccountId,type:'RESERVE',quantity:-1,sourceReturnKey:`bf:${id}:reserve`,reason:'One VIP event credit ($25 event admission) reserved for a two-person event ticket'}});
  }
  const amountCents=specialEventCashPrice(offer,pair,Boolean(creditAccountId));
  if(amountCents===null)throw Error('This credit option is unavailable.');
  const expiresAt=new Date(now.getTime()+31*60*1000);
  const parameters:Stripe.Checkout.SessionCreateParams={mode:'payment',payment_method_types:['card'],expires_at:Math.floor(expiresAt.getTime()/1000),customer_email:user.email,line_items:[{quantity:1,price_data:{currency:'usd',unit_amount:amountCents,product_data:{name:o.titleOverride||o.template.name,description:pair?(offer.requiresFirstVisit?'Two spots for you and a first-time friend. Each attendee needs a signed waiver.':'Two spots for you and your named friend. Each attendee needs a signed waiver.'):'One attendee'}}}],metadata:{purchaseType:'EVENT',blackFridayTicket:'1',commerceOrderId:id,userId:user.id,occurrenceId:o.id},payment_intent_data:{metadata:{purchaseType:'EVENT',blackFridayTicket:'1',commerceOrderId:id,userId:user.id,occurrenceId:o.id}},client_reference_id:id,success_url:`${input.origin}/checkout/event-return?order=${id}`,cancel_url:`${input.origin}/checkout/event-return?order=${id}`};
  // The insert trigger also fences legacy writers. Only this transaction has verified
  // every preceding legacy checkout against Stripe and the locked local evidence.
  await tx.$queryRaw`SELECT set_config('rhyze.verified_special_order',${id},true)`;
  const order=await tx.commerceOrder.create({data:{id,userId:user.id,occurrenceId:o.id,kind:'EVENT',amountCents,customerName:user.name,customerEmail:user.email,items:{create:{productReference:o.id,name:o.template.name,description:pair?'Two named attendees':'One attendee',quantity:1,unitAmountCents:amountCents}}}});
  await tx.$executeRaw`INSERT INTO "BlackFridayTicket" ("orderId","occurrenceId","userId",state,seats,"buyerName","guestName","guestPhone","declaredAt","creditAccountId","expiresAt",parameters) VALUES (${id},${o.id},${user.id},'HELD',${pair?2:1},${user.name||'Attendee'},${name},${phone},${pair && offer.requiresFirstVisit?now.toISOString():null}::timestamp,${creditAccountId},${expiresAt.toISOString()}::timestamp,${JSON.stringify(parameters)}::jsonb)`;
  await tx.auditLog.create({data:{actorId:user.id,action:'black-friday.reserved',entityType:'CommerceOrder',entityId:id,after:{seats:pair?2:1,firstVisitDeclaration:pair && offer.requiresFirstVisit?'This is my friend’s first visit':null,policy:'owner-approved-declaration-v1'}}});
  return {t:(await ticket(tx,id))!,order};
 });
 if(!held.order.stripeCheckoutSessionId && now>=held.t.expiresAt) throw new Error('Checkout outcome is uncertain. Contact staff; seats remain reserved.');
 const session=held.order.stripeCheckoutSessionId?await stripe.checkout.sessions.retrieve(held.order.stripeCheckoutSessionId,{expand:['payment_intent']},{timeout:2500,maxNetworkRetries:0}):await withFinancialRelease(db,async(tx,deadline)=>{await assertFinancialSubmission(tx,deadline);return stripe.checkout.sessions.create(held.t.parameters,{idempotencyKey:`black-friday:${held.order.id}`,maxNetworkRetries:0,timeout:20000});});
 await run(db,async tx=>{await lock(tx,held.t.occurrenceId);const order=await tx.commerceOrder.findUniqueOrThrow({where:{id:held.order.id}});if(!matchesSpecialEventSession(session,order,held.t)) throw new Error('Checkout identity mismatch');await tx.commerceOrder.update({where:{id:order.id},data:{stripeCheckoutSessionId:session.id}});if(session.status==='expired')await applyBlackFridaySession(tx,session,now);else if(session.status==='open'){
  await lockCheckoutEvidence(tx,order.id,session);
  if(session.payment_status!=='unpaid' || session.payment_intent!==null || !await locallyUnpaid(tx,order.id,session)) throw Error('Checkout payment requires review.');
 }});
 if(session.status!=='open'||!session.url)throw new Error('Checkout is closed. Refresh to start again or contact staff.');
 return {url:session.url,orderId:held.order.id};
}
export function matchesSpecialEventSession(
  session: Stripe.Checkout.Session,
  order: CommerceOrder,
  t: Ticket,
) {
  assertStripeObjectMode(session);
  const meta = session.metadata;
  const intent =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;
  return Boolean(
    session.id &&
    session.mode === 'payment' &&
    order.kind === 'EVENT' &&
    order.id === t.orderId &&
    order.userId === t.userId &&
    order.occurrenceId === t.occurrenceId &&
    (!order.stripeCheckoutSessionId ||
      order.stripeCheckoutSessionId === session.id) &&
    (!order.stripePaymentIntentId || order.stripePaymentIntentId === intent) &&
    session.amount_total === order.amountCents &&
    session.currency === order.currency &&
    order.currency === 'usd' &&
    session.client_reference_id === order.id &&
    meta?.purchaseType === 'EVENT' &&
    meta.blackFridayTicket === '1' &&
    meta.commerceOrderId === order.id &&
    meta.userId === t.userId &&
    meta.occurrenceId === t.occurrenceId,
  );
}

export function verifiedUnpaidExpiry(session: Stripe.Checkout.Session) {
  if (session.status !== 'expired' || session.payment_status !== 'unpaid')
    return false;
  const intent = session.payment_intent;
  if (intent === null) return true;
  return Boolean(
    intent &&
    typeof intent !== 'string' &&
    intent.id &&
    intent.status === 'canceled' &&
    intent.livemode === session.livemode &&
    intent.amount === session.amount_total &&
    intent.currency === session.currency &&
    intent.amount_received === 0 &&
    intent.amount_capturable === 0 &&
    intent.latest_charge === null &&
    [
      'commerceOrderId',
      'userId',
      'occurrenceId',
      'purchaseType',
      'blackFridayTicket',
    ].every((key) => intent.metadata?.[key] === session.metadata?.[key]),
  );
}

export async function lockCheckoutEvidence(
  tx: Tx,
  orderId: string,
  session: Stripe.Checkout.Session,
) {
  const intent =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);
  await tx.$executeRaw`SELECT bf_lock_checkout_evidence(${orderId},${intent},${session.id})`;
}

/** One current database snapshot for payment links, provider expiry and local release. */
export async function locallyUnpaid(
  db: Db,
  orderId: string,
  session: Stripe.Checkout.Session,
  legacy = false,
) {
  const pi =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);
  const rows = await db.$queryRaw<{ orderId: string }[]>`
   SELECT o.id FROM "CommerceOrder" o LEFT JOIN "BlackFridayTicket" t ON o.id=t."orderId"
   WHERE o.id=${orderId} AND ((${legacy} AND t."orderId" IS NULL) OR (NOT ${legacy} AND t.state='HELD' AND t."userId"=o."userId" AND t."occurrenceId"=o."occurrenceId")) AND o.status IN ('PENDING','PAYMENT_FAILED')
     AND o.kind='EVENT' AND o."amountCents"=${session.amount_total} AND o.currency=${session.currency}
     AND o."userId"=${session.metadata?.userId}
     AND o."occurrenceId"=${session.metadata?.occurrenceId}
     AND o."paidAt" IS NULL AND o."refundedAmountCents"=0 AND o."stripeCheckoutSessionId"=${session.id}
     AND (o."stripePaymentIntentId" IS NULL OR o."stripePaymentIntentId"=${pi})
     AND NOT EXISTS (SELECT 1 FROM "PaymentRecord" p WHERE p.status<>'FAILED' AND
       (p."commerceOrderId"=o.id OR p."stripeCheckoutSessionId"=${session.id} OR p."stripePaymentIntentId"=${pi}))
     AND NOT EXISTS (SELECT 1 FROM "CommerceRefund" r WHERE r."commerceOrderId"=o.id AND r.status IN ('PENDING','SUCCEEDED'))`;
  return rows.length === 1;
}

export function chargeRequiresReview(charge: Stripe.Charge) {
 return charge.disputed !== false || charge.refunded === true || charge.amount_refunded !== 0;
}

export async function applyBlackFridaySession(tx:Tx,session:Stripe.Checkout.Session,now=new Date(),actorId?:string,reason?:string) {
 const orderId=session.metadata?.commerceOrderId;
 if(!orderId||session.metadata?.blackFridayTicket!=='1')return false;
 const observed=await ticket(tx,orderId); if(!observed)throw new Error('Missing event reservation');
 await lock(tx,observed.occurrenceId); const t=(await ticket(tx,orderId))!;
 const order=await tx.commerceOrder.findUniqueOrThrow({where:{id:orderId}});
 const pi=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id;
 if(!matchesSpecialEventSession(session,order,t))throw new Error('Ticket payment identity or terms mismatch');
 // A signed callback can arrive before session creation was recorded. The batch
 // recovers a unique provider session before either terminal transition.
 if(!order.stripeCheckoutSessionId)return true;
 if(session.status==='expired'){
  // Lock the order as well as occurrence admission so a linked collected record
  // or payment state cannot be written between the final check and cancellation.
  await tx.$executeRaw`SELECT id FROM "CommerceOrder" WHERE id=${orderId} FOR UPDATE`;
  await lockCheckoutEvidence(tx,orderId,session);
  if(t.state!=='HELD' || !verifiedUnpaidExpiry(session) || !await locallyUnpaid(tx,orderId,session))return true;
  await tx.$executeRaw`UPDATE "BlackFridayTicket" SET state='EXPIRED' WHERE "orderId"=${orderId}`;
  await releaseCredit(tx,t);
  await tx.commerceOrder.update({where:{id:orderId},data:{status:'PAYMENT_FAILED',failedAt:now,stripePaymentIntentId:pi}});
  const [instruction]=await tx.$queryRaw<{actorId:string;reason:string;instructionId:string|null;accepted:boolean}[]>`
    SELECT "actorId",after->>'reason' AS reason,
      CASE WHEN action='black-friday.expiry-requested' THEN id ELSE after->>'instructionId' END AS "instructionId",
      action='black-friday.provider-expiry-accepted' AS accepted
    FROM "AuditLog" WHERE "entityType"='CommerceOrder' AND "entityId"=${orderId}
      AND action IN ('black-friday.expiry-requested','black-friday.provider-expiry-accepted')
      AND after->>'stripeCheckoutSessionId'=${session.id} AND "actorId" IS NOT NULL
    ORDER BY (action='black-friday.provider-expiry-accepted') DESC, "createdAt" DESC,id DESC LIMIT 1`;
  const terminalReason=instruction?.reason ?? reason;
  await tx.auditLog.create({data:{actorId:instruction?.actorId ?? actorId,action:'black-friday.expired',entityType:'CommerceOrder',entityId:orderId,
    after:{stripeCheckoutSessionId:session.id,paymentIntentId:pi ?? null,...(terminalReason?{reason:terminalReason}:{}),
      ...(instruction?{staffInstructionId:instruction.instructionId,providerAcceptanceObserved:instruction.accepted}:{})}}});
  return true;
 }
 if(session.status!=='complete'||session.payment_status!=='paid')return true;
 const expandedIntent=typeof session.payment_intent==='object'?session.payment_intent:null;
 const representedCharge=expandedIntent?.latest_charge;
 if(representedCharge && typeof representedCharge!=='string' && chargeRequiresReview(representedCharge))return true;
 if(!pi||session.amount_total!==order.amountCents||session.currency!==order.currency)throw new Error('Ticket payment terms mismatch');
 if(['REFUNDED','DISPUTE_LOST','REVIEW','PAID','REVERSING'].includes(t.state) || (t.state==='EXPIRED' && order.paidAt))return true;
 const o=await tx.classOccurrence.findUniqueOrThrow({where:{id:t.occurrenceId},include:{template:true}});
 const reversals=await tx.stripeEvent.findMany({where:{type:{in:['charge.refunded','charge.dispute.created']},payload:{path:['data','object','payment_intent'],equals:pi}}});
 const offer=specialEventIdentity(t.occurrenceId);
 let review=!offer || specialEventCashPrice(offer,t.seats===2,Boolean(t.creditAccountId))!==order.amountCents || !specialEventOfferMatches(o)||t.state!=='HELD'||o.status!=='SCHEDULED'||o.startAt<=now||reversals.length>0||order.refundedAmountCents>0||['REFUNDED','PARTIALLY_REFUNDED','DISPUTED'].includes(order.status);
 try {await account(tx,t.userId);} catch {review=true;}
 if(t.seats===2 && offer?.requiresFirstVisit && (await inspectNewFriendHistory(tx,{fullName:t.guestName!,phone:t.guestPhone!},t.userId,now,true)).status!=='ELIGIBLE')review=true;
 if(t.seats===2 && await guestHasAnotherSeat(tx,t.occurrenceId,t.guestName!,t.guestPhone!,false,t.orderId))review=true;
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
 const tickets=await db.$queryRaw<(Ticket & {cashRemainingCents:number})[]>`SELECT t.*,CASE WHEN o."paidAt" IS NOT NULL THEN GREATEST(0,o."amountCents"-o."refundedAmountCents") ELSE 0 END AS "cashRemainingCents" FROM "BlackFridayTicket" t JOIN "CommerceOrder" o ON o.id=t."orderId" WHERE t."occurrenceId"=${occurrenceId} AND t.state IN ('HELD','PAID','REVIEW','REVERSING','EXPIRED') ORDER BY t."orderId"`;
 return tickets.flatMap(t=>[{orderId:t.orderId,cashRemainingCents:t.cashRemainingCents,hasEventCredit:Boolean(t.creditAccountId),name:t.buyerName,userId:t.userId,bookingId:t.buyerBookingId,manage:true,state:t.state,review:t.state!=='PAID'},...(t.seats===2?[{orderId:t.orderId,cashRemainingCents:t.cashRemainingCents,hasEventCredit:Boolean(t.creditAccountId),name:t.guestName!,userId:t.guestUserId,bookingId:t.guestBookingId,manage:false,state:t.state,review:t.state!=='PAID'}]:[])]);
}
// Compatibility for the existing staff action, which verifies its confirmation checkbox.
export async function claimBlackFridayGuest(db:PrismaClient,input:{orderId:string;userId:string;actorId:string},now=new Date()){
 const {linkGuestAccount}=await import('./special-event-guests');
 return linkGuestAccount({orderId:input.orderId,selectedUserId:input.userId,identityConfirmed:true},{id:input.actorId},db,now);
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
export async function reverseBlackFridayTicket(tx:Tx,input:{orderId:string;paymentIntentId:string;refundedAmountCents:number;disputed:boolean;disputeLost?:boolean;disputeWon?:boolean},now=new Date()){
 const observed=await ticket(tx,input.orderId);if(!observed)throw Error('Ticket not found');await lock(tx,observed.occurrenceId);const t=await ticket(tx,input.orderId);if(!t)return false;
 const order=await tx.commerceOrder.findUniqueOrThrow({where:{id:t.orderId}});
 if(!order.stripePaymentIntentId||order.stripePaymentIntentId!==input.paymentIntentId)throw new Error('Reversal identity mismatch');
 if(['REFUNDED','DISPUTE_LOST'].includes(t.state))return true;
 const disputed=input.disputed || (order.status==='DISPUTED' && !input.disputeLost && !input.disputeWon);
 const full=Boolean(input.disputeLost)||(input.refundedAmountCents>=order.amountCents && !disputed);
 if(full){
  if(t.state!=='EXPIRED'){
  await tx.$executeRaw`UPDATE "BlackFridayTicket" SET state='REVERSING' WHERE "orderId"=${t.orderId}`;
  const ids=[t.buyerBookingId,t.guestBookingId].filter((id):id is string=>Boolean(id));
  await tx.attendanceRecord.deleteMany({where:{bookingId:{in:ids}}});
  await tx.booking.updateMany({where:{id:{in:ids}},data:{status:'CANCELLED',cancelledAt:now}});
  }
  await tx.$executeRaw`UPDATE "BlackFridayTicket" SET state=${input.disputeLost?'DISPUTE_LOST':'REFUNDED'} WHERE "orderId"=${t.orderId}`;await releaseCredit(tx,t);
 }else if(t.state!=='EXPIRED')await tx.$executeRaw`UPDATE "BlackFridayTicket" SET state='REVIEW' WHERE "orderId"=${t.orderId}`;
 await tx.commerceOrder.update({where:{id:t.orderId},data:{status:disputed||input.disputeLost?'DISPUTED':full?'REFUNDED':'PARTIALLY_REFUNDED',refundedAmountCents:Math.max(order.refundedAmountCents,input.refundedAmountCents)}});
 await tx.paymentRecord.updateMany({where:{commerceOrderId:t.orderId,stripePaymentIntentId:input.paymentIntentId},data:{status:disputed||input.disputeLost?'DISPUTED':full?'REFUNDED':'PARTIALLY_REFUNDED',refundedAmountCents:Math.max(order.refundedAmountCents,input.refundedAmountCents)}});
 await tx.auditLog.create({data:{action:full?'black-friday.released':'black-friday.reversal-review',entityType:'CommerceOrder',entityId:t.orderId}});return true;
}
