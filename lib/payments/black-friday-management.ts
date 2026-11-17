import { assertFinancialRelease, assertFinancialSubmission, withFinancialRelease } from '@/lib/payments/financial-release';
import { assertFinancialApprover } from '@/lib/auth/financial-owner-access';
import type { PrismaClient } from '@prisma/client';
import type Stripe from 'stripe';
import { applyBlackFridayRefunds, applyBlackFridaySession, reverseBlackFridayTicket, type Ticket } from './black-friday-checkout';
/** Staff-only, explicit cancellation. An uncertain provider result never frees seats. */
export async function manageBlackFridayTicket(db:PrismaClient,stripe:Stripe,input:{actorId:string;orderId:string;reason:string;operation:'CANCEL'|'RECONCILE';sessionId?:string;expectedRefundCents?:number},now=new Date()){
 if(input.reason.trim().length<5)throw new Error('A staff reason is required');
 const actor=await db.user.findUnique({where:{id:input.actorId}});
 if(!actor||actor.status!=='ACTIVE'||!['OWNER','ADMIN'].includes(actor.role))throw new Error('Staff authorization required');
 if(input.operation==='CANCEL'){await assertFinancialRelease(db);await assertFinancialApprover(db,input.actorId);}
 const t=(await db.$queryRaw<Ticket[]>`SELECT * FROM "BlackFridayTicket" WHERE "orderId"=${input.orderId}`)[0];
 if(!t)throw new Error('Ticket not found');
 let order=await db.commerceOrder.findUniqueOrThrow({where:{id:t.orderId}});
 if(['REFUNDED','DISPUTE_LOST'].includes(t.state))return;
 const sessionId=order.stripeCheckoutSessionId||input.sessionId;
 if(!sessionId)throw new Error('Unknown provider session: manual provider reconciliation required; seats remain held');
 let session=await stripe.checkout.sessions.retrieve(sessionId);
 if(session.metadata?.blackFridayTicket!=='1'||session.metadata.commerceOrderId!==order.id||session.metadata.userId!==t.userId||session.metadata.occurrenceId!==t.occurrenceId||session.amount_total!==order.amountCents||session.currency!==order.currency)throw new Error('Recovered checkout identity mismatch');
 if(input.operation==='CANCEL'&&session.status==='open')session=await stripe.checkout.sessions.expire(session.id);
 await db.$transaction(tx=>applyBlackFridaySession(tx,session,now));
 order=await db.commerceOrder.findUniqueOrThrow({where:{id:t.orderId}});
 if(session.status==='expired'&&session.payment_status!=='paid')return;
 if(!order.stripePaymentIntentId)throw new Error('Payment is not settled');
 const load=async()=>{
  const pi=await stripe.paymentIntents.retrieve(order.stripePaymentIntentId!,{expand:['latest_charge']});
  const charge=pi.latest_charge;
  if(pi.metadata.commerceOrderId!==order.id||pi.amount!==order.amountCents||pi.currency!==order.currency||!charge||typeof charge==='string'||charge.payment_intent!==pi.id||charge.amount!==order.amountCents||charge.currency!==order.currency)throw new Error('Provider identity or amount mismatch');
  return {pi,charge};
 };
 let proof=await load();
 let disputeWon=false;
 if(proof.charge.disputed){
  const disputes:Stripe.Dispute[]=[];
  for await(const dispute of stripe.disputes.list({charge:proof.charge.id,limit:100}))disputes.push(dispute);
  if(!disputes.length||disputes.some(d=>(typeof d.payment_intent==='string'?d.payment_intent:d.payment_intent?.id)!==proof.pi.id||d.amount!==order.amountCents||d.currency!==order.currency||!['won','lost'].includes(d.status)))throw new Error('Resolve the dispute with the provider before cancelling or releasing seats');
  disputeWon=disputes.every(d=>d.status==='won');
  if(disputes.some(d=>d.status==='lost')){
   await db.$transaction(tx=>reverseBlackFridayTicket(tx,{orderId:order.id,paymentIntentId:proof.pi.id,refundedAmountCents:order.refundedAmountCents,disputed:true,disputeLost:true},now));return;
  }
 }
 if(input.operation==='CANCEL'&&proof.charge.amount_refunded<order.amountCents){
  const existingRefunds:Stripe.Refund[]=[];
  for await(const refund of stripe.refunds.list({payment_intent:proof.pi.id,limit:100}))existingRefunds.push(refund);
  if(existingRefunds.some(r=>!['succeeded','failed','canceled'].includes(r.status||'')))throw Error('A refund is pending; reconcile it before another approval');
  const refundedBefore=existingRefunds.filter(r=>r.status==='succeeded').reduce((n,r)=>n+r.amount,0);
  if(refundedBefore!==proof.charge.amount_refunded||order.refundedAmountCents!==refundedBefore)throw Error('Refund accounting changed; reconcile and review again');
  if(proof.pi.status!=='succeeded'||!proof.charge.paid||!proof.charge.captured)throw Error('Captured payment required for refund approval');
  const amount=order.amountCents-refundedBefore;
  if(input.expectedRefundCents!==amount)throw Error('Refund amount changed; reload the displayed total before approval');
  const approval=await db.$transaction(async tx=>{
   await assertFinancialRelease(tx);
   await assertFinancialApprover(tx,input.actorId);
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${t.occurrenceId}))`;
   await tx.$executeRaw`SELECT id FROM "ClassOccurrence" WHERE id=${t.occurrenceId} FOR UPDATE`;
   const previous=await tx.$queryRaw<{orderId:string}[]>`SELECT "orderId" FROM "EventRefundApproval" WHERE "orderId"=${order.id}`;
   if(previous.length)return false;
   const fresh=await tx.commerceOrder.findUniqueOrThrow({where:{id:order.id}});
   if(fresh.stripePaymentIntentId!==proof.pi.id||fresh.amountCents!==order.amountCents||fresh.refundedAmountCents!==refundedBefore||fresh.currency!=='usd')throw Error('Payment changed; reload before approval');
   await tx.$executeRaw`INSERT INTO "EventRefundApproval" ("orderId","actorId",reason,"paymentIntentId","chargeId","amountCents",currency,"refundedBeforeCents","providerKey") VALUES (${order.id},${input.actorId},${input.reason.trim()},${proof.pi.id},${proof.charge.id},${amount},'usd',${refundedBefore},${`approved-event-refund:${order.id}`})`;
   await tx.$executeRaw`UPDATE "BlackFridayTicket" SET "refundStartedAt"=${now.toISOString()}::timestamp,state=CASE WHEN state='EXPIRED' THEN state ELSE 'REVIEW' END WHERE "orderId"=${order.id}`;
   await tx.auditLog.create({data:{actorId:input.actorId,action:'event-refund.approved',entityType:'CommerceOrder',entityId:order.id,after:{reason:input.reason,amountCents:amount,currency:'usd',paymentIntentId:proof.pi.id,chargeId:proof.charge.id,refundedBeforeCents:refundedBefore}}});
   return true;
  });
  if(approval){
   // A lost response or process crash keeps the immutable approval. Reconcile; never create another submission.
   await assertFinancialApprover(db,input.actorId);
   const fresh=await load();
   if((fresh.charge.disputed&&!disputeWon)||fresh.charge.amount_refunded!==refundedBefore||fresh.charge.id!==proof.charge.id)throw Error('Provider payment changed after approval; reconcile without retry');
   await withFinancialRelease(db,async (tx,deadline)=>{
   await assertFinancialApprover(tx,input.actorId);
   if(fresh.charge.disputed){
    const current:Stripe.Dispute[]=[];for await(const d of stripe.disputes.list({charge:fresh.charge.id,limit:100}))current.push(d);
    if(!current.length||current.some(d=>d.status!=='won'||(typeof d.payment_intent==='string'?d.payment_intent:d.payment_intent?.id)!==fresh.pi.id||d.amount!==order.amountCents||d.currency!==order.currency))throw Error('Dispute changed; reconcile without retry');
   }
   await assertFinancialSubmission(tx,deadline);
   await stripe.refunds.create({charge:proof.charge.id,amount,metadata:{commerceOrderId:order.id,blackFridayTicket:'1'}},{idempotencyKey:`approved-event-refund:${order.id}`,maxNetworkRetries:0,timeout:20000});
   });
  }
  proof=await load();
 }
 const refunds:Stripe.Refund[]=[];
 for await(const refund of stripe.refunds.list({payment_intent:proof.pi.id,limit:100}))refunds.push(refund);
 if(refunds.length)await db.$transaction(tx=>applyBlackFridayRefunds(tx,order.id,proof.pi.id,refunds,now));
 if(disputeWon){const reconciled=await db.commerceOrder.findUniqueOrThrow({where:{id:order.id}});await db.$transaction(tx=>reverseBlackFridayTicket(tx,{orderId:order.id,paymentIntentId:proof.pi.id,refundedAmountCents:reconciled.refundedAmountCents,disputed:false,disputeWon:true},now));}
 if((await db.commerceOrder.findUniqueOrThrow({where:{id:order.id}})).status!=='REFUNDED'&&input.operation==='CANCEL')throw new Error('Refund pending; both seats remain reserved until verified');
}
