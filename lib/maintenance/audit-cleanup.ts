import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { EMAIL_TEMPLATE_REVISION } from '@/lib/notifications/email-templates';

export const CLEANUP_ID = 'audit-cleanup-20261011';
export const HISTORICAL_FEE_ID = 'cmuos96ak0007lf09kmpe12dw';
const BIRTHDAYS = ['BIRTHDAY_MONTHLY_DIGEST', 'BIRTHDAY_WEEK_AHEAD'];
const JULY_TEMPLATES = ['ADMIN_MESSAGE', 'BOOKING_CANCELLATION', 'BOOKING_CONFIRMATION', 'CLASS_REMINDER', 'INSTRUCTOR_DOCUMENTS_MISSING', 'MEMBER_REPLY', 'WELCOME'];
type LegacyEmail = { status:string; providerId:string|null; sentAt:Date|null; direction:string; createdAt:Date; template:string };
export function eligibleLegacyEmail(message: LegacyEmail) {
  if (message.status !== 'QUEUED' || message.direction !== 'OUTBOUND' || message.providerId || message.sentAt) return false;
  return (JULY_TEMPLATES.includes(message.template) && message.createdAt >= new Date('2026-07-01') && message.createdAt < new Date('2026-08-01')) ||
    (BIRTHDAYS.includes(message.template) && message.createdAt < new Date('2026-10-11T04:00:00Z'));
}
type HistoricalFee = { id:string; bookingId:string|null; kind:string; status:string; amountCents:number; currency:string; stripePaymentIntentId:string|null; stripeInvoiceId:string|null; stripeCheckoutSessionId:string|null; booking:{ policySnapshot:unknown }|null };
export function eligibleHistoricalFee(fee: HistoricalFee) {
  const snapshot = fee.booking?.policySnapshot as Record<string, unknown> | null;
  return fee.id === HISTORICAL_FEE_ID && fee.bookingId === 'cmuojug6g0001la09p1c77oxg' && fee.kind === 'NO_SHOW_FEE' && fee.status === 'FAILED' && fee.amountCents === 1000 && fee.currency === 'usd' && !fee.stripePaymentIntentId && !fee.stripeInvoiceId && !fee.stripeCheckoutSessionId && snapshot?.accessType === 'STANDARD' && snapshot?.accessProductKind === 'LIMITED_MEMBERSHIP';
}

/** Narrow owner cleanup. No provider calls, money/status rewrites, or email sends. */
export async function cleanupAuditBacklog(tx: Prisma.TransactionClient, input: { owner:{id:string;email:string}; dryRun:boolean; snapshot?:string; reason:string }) {
  const previous = await tx.auditLog.findUnique({where:{id:CLEANUP_ID}});
  if (previous) return { alreadyApplied:true, auditId:previous.id, result:previous.after };
  const candidates = await tx.emailMessage.findMany({where:{status:'QUEUED', direction:'OUTBOUND', providerId:null, sentAt:null, OR:[
    {template:{in:JULY_TEMPLATES}, createdAt:{gte:new Date('2026-07-01'),lt:new Date('2026-08-01')}},
    {template:{in:BIRTHDAYS},createdAt:{lt:new Date('2026-10-11T04:00:00Z')}},
  ]},select:{id:true,status:true,direction:true,providerId:true,sentAt:true,createdAt:true,template:true,updatedAt:true},orderBy:{id:'asc'}});
  if (!candidates.every(eligibleLegacyEmail)) throw new Error('Email scope changed.');
  const fee = await tx.paymentRecord.findUnique({where:{id:HISTORICAL_FEE_ID},include:{booking:{select:{policySnapshot:true}}}});
  if (!fee || !eligibleHistoricalFee(fee)) throw new Error('Historical fee requires fresh review; cleanup aborted.');
  const collectedFee = await tx.paymentRecord.findFirst({where:{bookingId:fee.bookingId,kind:fee.kind,status:{not:'FAILED'}},select:{id:true}});
  if (collectedFee) throw new Error('Provider-backed fee history requires separate review.');
  const reviews = await tx.emailTemplateReview.findMany({where:{template:{in:BIRTHDAYS}},orderBy:{template:'asc'}});
  // Existing custom copy requires its own review; only the inspected stock copy is approved here.
  if (reviews.some(r => r.copyOverride !== null)) throw new Error('Birthday copy changed; cleanup aborted.');
  const snapshot = createHash('sha256').update(JSON.stringify({candidates, fee:{id:fee.id,updatedAt:fee.updatedAt},reviews,revision:EMAIL_TEMPLATE_REVISION})).digest('hex');
  const result = { emailsCancelled:candidates.length, birthdayBacklog:candidates.filter(m=>BIRTHDAYS.includes(m.template)).length, julyBacklog:candidates.filter(m=>JULY_TEMPLATES.includes(m.template)).length, feeDisposition:'WAIVED_NOT_COLLECTIBLE', failedAttemptPreserved:true, birthdayTemplatesApproved:BIRTHDAYS };
  if (input.dryRun) return {dryRun:true, snapshot, ...result};
  if (input.snapshot !== snapshot) throw new Error('Snapshot changed; inspect a fresh preview.');
  for (const message of candidates) {
    const changed = await tx.emailMessage.updateMany({where:{id:message.id,status:'QUEUED',providerId:null,sentAt:null,updatedAt:message.updatedAt},data:{status:'CANCELLED',lastError:`${CLEANUP_ID}: obsolete unsent notice; owner-authorized cancellation, not sent.`}});
    if (changed.count !== 1) throw new Error('Email changed during cleanup; transaction rolled back.');
    await tx.auditLog.create({data:{actorId:input.owner.id,action:'email.obsolete.cancel',entityType:'EmailMessage',entityId:message.id,before:{status:'QUEUED'},after:{status:'CANCELLED',reason:input.reason,cleanupId:CLEANUP_ID}}});
  }
  await tx.auditLog.create({data:{id:`${CLEANUP_ID}-fee`,actorId:input.owner.id,action:'attendance-fee.waived',entityType:'PaymentRecord',entityId:fee.id,before:{status:fee.status,amountCents:fee.amountCents},after:{disposition:'WAIVED_NOT_COLLECTIBLE',amountCents:1000,currency:'usd',reason:input.reason,bookingId:fee.bookingId,providerChargeCreated:false}}});
  for (const template of BIRTHDAYS) {
    const data = {revision:EMAIL_TEMPLATE_REVISION,approvedById:input.owner.id,approvedByEmail:input.owner.email,approvedAt:new Date()};
    await tx.emailTemplateReview.upsert({where:{template},create:{template,...data},update:data});
    await tx.auditLog.create({data:{actorId:input.owner.id,action:'email-template.approved',entityType:'EmailTemplateReview',entityId:template,after:{revision:EMAIL_TEMPLATE_REVISION,reason:input.reason,cleanupId:CLEANUP_ID}}});
  }
  await tx.auditLog.create({data:{id:CLEANUP_ID,actorId:input.owner.id,action:'maintenance.audit-cleanup',entityType:'Maintenance',entityId:CLEANUP_ID,after:{...result,reason:input.reason}}});
  return {dryRun:false, auditId:CLEANUP_ID,...result};
}
