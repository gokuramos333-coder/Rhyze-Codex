import type { EventCaptureProof } from './event-capture-evidence';
import { specialEventIdentity } from './black-friday-new-friend';
import type { Prisma } from '@prisma/client';
import type Stripe from 'stripe';
import { applyBlackFridayRefunds, applyBlackFridaySession, reverseBlackFridayTicket } from './black-friday-checkout';
/** Called inside the retained Stripe receipt transaction, before legacy event fulfillment. */
export async function processBlackFridayEvent(tx:Prisma.TransactionClient,event:Stripe.Event, proof?:EventCaptureProof){
 if(event.type.startsWith('checkout.session.')){
  const session=event.data.object as Stripe.Checkout.Session;
  if(session.metadata?.blackFridayTicket!=='1')return false;
  await applyBlackFridaySession(tx,session,undefined,undefined,undefined,proof);return true;
 }
 if(!['charge.refunded','charge.dispute.created','charge.dispute.closed'].includes(event.type))return false;
 const object=event.data.object as Stripe.Charge|Stripe.Dispute;
 const pi=typeof object.payment_intent==='string'?object.payment_intent:object.payment_intent?.id;
 if(!pi)return false;
 const order=await tx.commerceOrder.findUnique({where:{stripePaymentIntentId:pi}});
 if(!order||!specialEventIdentity(order.occurrenceId ?? undefined))return false;
 if(!(await tx.$queryRaw<{orderId:string}[]>`SELECT "orderId" FROM "BlackFridayTicket" WHERE "orderId"=${order.id}`).length)return false;
 if(event.type==='charge.refunded'){
  const charge=object as Stripe.Charge;
  if(charge.amount!==order.amountCents||charge.currency!==order.currency)throw new Error('Refund charge terms mismatch');
  await applyBlackFridayRefunds(tx,order.id,pi,charge.refunds?.data||[]);return true;
 }
 // Won disputes remain review until staff explicitly cancels/refunds; lost is terminal.
 return reverseBlackFridayTicket(tx,{orderId:order.id,paymentIntentId:pi,refundedAmountCents:'amount_refunded' in object?object.amount_refunded:order.refundedAmountCents,disputed:true,disputeLost:event.type==='charge.dispute.closed'&&'status' in object&&object.status==='lost'&&object.amount===order.amountCents&&object.currency===order.currency});
}
