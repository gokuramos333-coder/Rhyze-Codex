import { assertFinancialRelease, assertFinancialSubmission, withFinancialRelease } from '@/lib/payments/financial-release';
import { assertFinancialApprover } from '@/lib/auth/financial-owner-access';
import type { PrismaClient } from '@prisma/client';
import type Stripe from 'stripe';
import { assertStripeObjectMode } from './stripe-mode';
import { readSpecialEventCheckout } from './special-event-reconciliation';
import { applyBlackFridayRefunds, matchesSpecialEventSession, reverseBlackFridayTicket, type Ticket } from './black-friday-checkout';
/** Staff-only, explicit cancellation. An uncertain provider result never frees seats. */
export async function manageBlackFridayTicket(db:PrismaClient,stripe:Stripe,input:{actorId:string;orderId:string;reason:string;operation:'CANCEL'|'RECONCILE';sessionId?:string;expectedRefundCents?:number},now=new Date()){
 if(input.reason.trim().length<5)throw new Error('A staff reason is required');
 const actor=await db.user.findUnique({where:{id:input.actorId}});
 if(!actor||actor.status!=='ACTIVE'||!['OWNER','ADMIN'].includes(actor.role))throw new Error('Staff authorization required');
 if(input.operation==='CANCEL'){await assertFinancialRelease(db);await assertFinancialApprover(db,input.actorId);}
 const t=(await db.$queryRaw<Ticket[]>`SELECT * FROM "BlackFridayTicket" WHERE "orderId"=${input.orderId}`)[0];
 if(!t)throw new Error('Ticket not found');
 if(['REFUNDED','DISPUTE_LOST'].includes(t.state))return;
 const evidence=await readSpecialEventCheckout({orderId:t.orderId},{db,stripe,now},input.sessionId,{
  actorId:actor.id,reason:input.reason.trim(),operation:input.operation
 });
 if(evidence.fullyRefunded){
  return archiveMissedFullRefund(db,stripe,t,evidence.fullyRefunded,input,now);
 }
 if(evidence.outcome==='expired')return;
 if(evidence.session?.status!=='complete'||evidence.session.payment_status!=='paid')throw new Error('Checkout identity or payment status requires review; seats remain held');
 const order=await db.commerceOrder.findUniqueOrThrow({where:{id:t.orderId}});
 if(!order.stripePaymentIntentId)throw new Error('Payment is not settled');
 const load=async()=>{
  const pi=await stripe.paymentIntents.retrieve(order.stripePaymentIntentId!,{expand:['latest_charge']});
  const charge=pi.latest_charge;
  assertStripeObjectMode(pi);
  if(charge && typeof charge!=='string')assertStripeObjectMode(charge);
  if(pi.id!==order.stripePaymentIntentId||pi.metadata.commerceOrderId!==order.id||pi.amount!==order.amountCents||pi.currency!==order.currency||!charge||typeof charge==='string'||charge.payment_intent!==pi.id||charge.amount!==order.amountCents||charge.currency!==order.currency)throw new Error('Provider identity or amount mismatch');
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

/** Recover an already-settled charge and its completed refund in one transaction. */
async function archiveMissedFullRefund(
  db: PrismaClient,
  stripe: Stripe,
  t: Ticket,
  proof: {
    session: Stripe.Checkout.Session;
    charge: Stripe.Charge;
    intentId: string;
  },
  staff: { actorId: string; reason: string },
  now: Date,
) {
  const { session, charge, intentId } = proof;
  const page = await stripe.refunds.list(
    { charge: charge.id, limit: 100 },
    { timeout: 2000, maxNetworkRetries: 0 },
  );
  const succeeded = page.data.filter((r) => r.status === 'succeeded');
  if (
    page.has_more !== false ||
    !charge.id ||
    !Number.isSafeInteger(charge.created) ||
    charge.created <= 0 ||
    new Set(page.data.map((r) => r.id)).size !== page.data.length ||
    page.data.some(
      (r) =>
        !r.id ||
        (typeof r.charge === 'string' ? r.charge : r.charge?.id) !==
          charge.id ||
        (typeof r.payment_intent === 'string'
          ? r.payment_intent
          : r.payment_intent?.id) !== intentId ||
        r.currency !== session.currency ||
        !Number.isSafeInteger(r.amount) ||
        r.amount <= 0 ||
        !['succeeded', 'failed', 'canceled'].includes(r.status || ''),
    ) ||
    succeeded.reduce((total, r) => total + r.amount, 0) !==
      charge.amount_refunded
  )
    throw Error('Complete matching refund receipts required');
  const paidAt = new Date(charge.created * 1000);
  await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT id FROM "ClassOccurrence" WHERE id=${t.occurrenceId} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM "CommerceOrder" WHERE id=${t.orderId} FOR UPDATE`;
      const actor = await tx.user.findUnique({ where: { id: staff.actorId } });
      if (
        !actor ||
        actor.status !== 'ACTIVE' ||
        !['OWNER', 'ADMIN'].includes(actor.role)
      )
        throw Error('Staff authorization required');
      const order = await tx.commerceOrder.findUniqueOrThrow({
        where: { id: t.orderId },
      });
      const [ticket] = await tx.$queryRaw<
        Ticket[]
      >`SELECT * FROM "BlackFridayTicket" WHERE "orderId"=${t.orderId}`;
      if (
        !ticket ||
        !matchesSpecialEventSession(session, order, ticket) ||
        order.stripeCheckoutSessionId !== session.id
      )
        throw Error('Checkout identity changed');
      if (
        ticket.state === 'REFUNDED' &&
        order.status === 'REFUNDED' &&
        order.stripePaymentIntentId === intentId
      )
        return;
      if (
        ticket.state !== 'HELD' ||
        ticket.buyerBookingId ||
        ticket.guestBookingId ||
        order.paidAt ||
        !['PENDING', 'PAYMENT_FAILED'].includes(order.status) ||
        order.refundedAmountCents !== 0
      )
        throw Error('Checkout requires staff review');
      const records = await tx.paymentRecord.findMany({
        where: {
          OR: [
            { commerceOrderId: order.id },
            { stripeCheckoutSessionId: session.id },
            { stripePaymentIntentId: intentId },
          ],
        },
      });
      if (
        records.length > 1 ||
        records.some(
          (record) =>
            record.commerceOrderId !== order.id ||
            record.userId !== ticket.userId ||
            record.kind !== 'EVENT' ||
            record.stripePaymentIntentId !== intentId ||
            record.stripeCheckoutSessionId !== session.id ||
            record.amountCents !== order.amountCents ||
            record.currency !== order.currency ||
            !['SUCCEEDED', 'REFUNDED'].includes(record.status),
        )
      )
        throw Error('Payment ownership requires review');
      const known = await tx.commerceRefund.findMany({
        where: { commerceOrderId: order.id },
      });
      if (
        known.some(
          (r) =>
            !page.data.some(
              (p) =>
                p.id === r.stripeRefundId &&
                p.amount === r.amountCents &&
                (r.status !== 'SUCCEEDED' || p.status === 'succeeded'),
            ),
        )
      )
        throw Error('Refund history requires review');
      await tx.commerceOrder.update({
        where: { id: order.id },
        data: { stripePaymentIntentId: intentId, paidAt },
      });
      if (!records.length)
        await tx.paymentRecord.create({
          data: {
            userId: ticket.userId,
            commerceOrderId: order.id,
            kind: 'EVENT',
            status: 'SUCCEEDED',
            stripeEventId: `black-friday-session:${session.id}`,
            amountCents: order.amountCents,
            currency: order.currency,
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: intentId,
            occurredAt: paidAt,
            customerName: order.customerName,
            customerEmail: order.customerEmail,
          },
        });
      await applyBlackFridayRefunds(tx, order.id, intentId, page.data, now);
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'black-friday.refund-recovered',
          entityType: 'CommerceOrder',
          entityId: order.id,
          after: {
            reason: staff.reason.trim(),
            stripeCheckoutSessionId: session.id,
            chargeId: charge.id,
            paymentIntentId: intentId,
            refundIds: succeeded.map((r) => r.id),
          },
        },
      });
    },
    { isolationLevel: 'Serializable' },
  );
}
