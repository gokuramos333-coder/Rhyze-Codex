import { PrismaClient, Prisma } from '@prisma/client';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { cleanupAuditBacklog, CLEANUP_ID, HISTORICAL_FEE_ID } from '@/lib/maintenance/audit-cleanup';
const url=process.env.CALLBACK_TEST_DATABASE_URL;
if(url && (!['localhost','127.0.0.1'].includes(new URL(url).hostname)||new URL(url).pathname!=='/callback_test')) throw Error('Disposable callback_test DB required');
describe.skipIf(!url)('audited backlog cleanup on PostgreSQL',()=>{
 const db=new PrismaClient({datasourceUrl:url});const id='audit-cleanup-fixture';const bookingId='cmuojug6g0001la09p1c77oxg';
 const owner={id,email:'cleanup@example.test'};
 const run=(dryRun:boolean,snapshot?:string)=>db.$transaction(tx=>cleanupAuditBacklog(tx,{owner,dryRun,snapshot,reason:'Authorized cleanup of obsolete notices and non-trial fee.'}),{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 beforeAll(async()=>{
  await db.user.create({data:owner});
  await db.classCategory.create({data:{id,name:id,slug:id}});
  await db.classTemplate.create({data:{id,categoryId:id,name:id,slug:id,description:'fixture',durationMinutes:50,defaultCapacity:10,dropInPriceCents:2500}});
  await db.classOccurrence.create({data:{id,templateId:id,startAt:new Date('2026-10-01'),endAt:new Date('2026-10-01T01:00Z'),capacity:10}});
  await db.booking.create({data:{id:bookingId,userId:id,occurrenceId:id,policySnapshot:{accessType:'STANDARD',accessProductKind:'LIMITED_MEMBERSHIP'}}});
  await db.paymentRecord.create({data:{id:HISTORICAL_FEE_ID,userId:id,bookingId,kind:'NO_SHOW_FEE',status:'FAILED',amountCents:1000,stripeEventId:'synthetic-cleanup-fee'}});
  for(const [suffix,template,createdAt] of [['july','WELCOME','2026-07-27'],['birthday','BIRTHDAY_WEEK_AHEAD','2026-10-10'],['future','WELCOME','2026-10-12']]) await db.emailMessage.create({data:{id:`${id}-${suffix}`,to:'fixture@example.test',template,payload:{},subject:'fixture',createdAt:new Date(createdAt)}});
 });
 afterAll(async()=>{
  await db.auditLog.deleteMany({where:{actorId:id}});await db.emailMessage.deleteMany({where:{id:{startsWith:id}}});await db.emailTemplateReview.deleteMany({where:{approvedById:id}});
  await db.paymentRecord.deleteMany({where:{id:HISTORICAL_FEE_ID}});await db.booking.deleteMany({where:{id:bookingId}});await db.classOccurrence.deleteMany({where:{id}});await db.classTemplate.deleteMany({where:{id}});await db.classCategory.deleteMany({where:{id}});await db.user.deleteMany({where:{id}});await db.$disconnect();
 });
 it('previews without writes, rejects stale approval, applies once, and preserves money/history',async()=>{
  const payment=await db.paymentRecord.findUniqueOrThrow({where:{id:HISTORICAL_FEE_ID}});
  const preview=await run(true);expect(preview).toMatchObject({emailsCancelled:2});
  expect(await db.auditLog.count({where:{actorId:id}})).toBe(0);
  await expect(run(false,'0'.repeat(64))).rejects.toThrow('Snapshot');
  expect(await db.emailMessage.count({where:{id:{startsWith:id},status:'QUEUED'}})).toBe(3);
  expect(await run(false,'snapshot' in preview ? preview.snapshot : '')).toMatchObject({auditId:CLEANUP_ID,emailsCancelled:2});
  expect(await run(false)).toMatchObject({alreadyApplied:true});
  expect(await db.paymentRecord.findUniqueOrThrow({where:{id:HISTORICAL_FEE_ID}})).toEqual(payment);
  expect(await db.auditLog.findUniqueOrThrow({where:{id:`${CLEANUP_ID}-fee`}})).toMatchObject({action:'attendance-fee.waived'});
  expect(await db.emailMessage.count({where:{id:{startsWith:id},status:'CANCELLED'}})).toBe(2);
  expect(await db.emailMessage.findUniqueOrThrow({where:{id:`${id}-future`}})).toMatchObject({status:'QUEUED'});
 });
});
