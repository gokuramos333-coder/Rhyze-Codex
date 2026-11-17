import type { PrismaClient } from '@prisma/client';
import type Stripe from 'stripe';
import { applyBlackFridayRefunds, applyBlackFridaySession, reverseBlackFridayTicket, type Ticket } from './black-friday-checkout';
/** Staff-only, explicit cancellation. An uncertain provider result never frees seats. */
export async function manageBlackFridayTicket(db:PrismaClient,stripe:Stripe,input:{actorId:string;orderId:string;reason:string;operation:'CANCEL'|'RECONCILE';sessionId?:string},now=new Date()){
 if(input.reason.trim().length<5)throw new Error('A staff reason is required');
 const actor=await db.user.findUnique({where:{id:input.actorId}});
 if(!actor||actor.status!=='ACTIVE'||!['OWNER','ADMIN'].includes(actor.role))throw new Error('Staff authorization required');
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
 if(proof.charge.disputed){
  const disputes:Stripe.Dispute[]=[];
  for await(const dispute of stripe.disputes.list({charge:proof.charge.id,limit:100}))disputes.push(dispute);
  if(!disputes.length||disputes.some(d=>(typeof d.payment_intent==='string'?d.payment_intent:d.payment_intent?.id)!==proof.pi.id||d.amount!==order.amountCents||d.currency!==order.currency||!['won','lost'].includes(d.status)))throw new Error('Resolve the dispute with the provider before cancelling or releasing seats');
  if(disputes.some(d=>d.status==='lost')){
   await db.$transaction(tx=>reverseBlackFridayTicket(tx,{orderId:order.id,paymentIntentId:proof.pi.id,refundedAmountCents:order.refundedAmountCents,disputed:true,disputeLost:true},now));return;
  }
 }
 if(input.operation==='CANCEL'&&proof.charge.amount_refunded<order.amountCents){
  const began=await db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT id FROM "ClassOccurrence" WHERE id=${t.occurrenceId} FOR UPDATE`;
   const row=(await tx.$queryRaw<{refundStartedAt:Date|null}[]>`SELECT "refundStartedAt" FROM "BlackFridayTicket" WHERE "orderId"=${order.id}`)[0];
   if(!row.refundStartedAt){await tx.$executeRaw`UPDATE "BlackFridayTicket" SET "refundStartedAt"=${now.toISOString()}::timestamp,state=CASE WHEN state='EXPIRED' THEN state ELSE 'REVIEW' END WHERE "orderId"=${order.id}`;await tx.auditLog.create({data:{actorId:actor.id,action:'black-friday.cancel-requested',entityType:'CommerceOrder',entityId:order.id,after:{reason:input.reason}}});}
   return row.refundStartedAt||now;
  });
  if(now.getTime()-began.getTime()>23*60*60*1000)throw new Error('Refund idempotency window elapsed. Reconcile existing provider result; do not retry a charge/refund');
  await stripe.refunds.create({payment_intent:proof.pi.id,metadata:{commerceOrderId:order.id,blackFridayTicket:'1'}},{idempotencyKey:`black-friday-full-refund:${order.id}`});
  proof=await load();
 }
 const refunds:Stripe.Refund[]=[];
 for await(const refund of stripe.refunds.list({payment_intent:proof.pi.id,limit:100}))refunds.push(refund);
 if(refunds.length)await db.$transaction(tx=>applyBlackFridayRefunds(tx,order.id,proof.pi.id,refunds,now));
 if((await db.commerceOrder.findUniqueOrThrow({where:{id:order.id}})).status!=='REFUNDED'&&input.operation==='CANCEL')throw new Error('Refund pending; both seats remain reserved until verified');
}
