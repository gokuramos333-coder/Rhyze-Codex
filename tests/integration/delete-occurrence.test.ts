import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ id: '', allowed: true }));
vi.mock('@/lib/auth/session', () => ({ requireArea: async (area: string) => { if (!auth.allowed || area !== 'admin') throw Error('denied'); return { id: auth.id }; } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw Error(url); } }));
vi.mock('@/lib/db/prisma', async () => {
 const { PrismaClient } = await import('@prisma/client'); const url=process.env.CALLBACK_TEST_DATABASE_URL;
 if (!url || !['127.0.0.1','localhost'].includes(new URL(url).hostname) || new URL(url).pathname !== '/callback_test') throw Error('Disposable callback_test only');
 return { prisma: new PrismaClient({datasourceUrl:url}) };
});
import { prisma as db } from '@/lib/db/prisma';
import * as actions from '@/app/(studio)/admin/schedule/[occurrenceId]/actions';
const remove = (f: FormData) => (actions as unknown as { deleteOccurrenceAction: (f: FormData)=>Promise<void> }).deleteOccurrenceAction(f);
const prefix='remove-'+randomUUID(); const ids={owner:prefix+'owner',member:prefix+'member',waiting:prefix+'waiting',category:prefix+'category',template:prefix+'template'};
const now=new Date(); const startAt=new Date(now.getTime()+10*86400000); const endAt=new Date(+startAt+3000000);
async function fixture(label: string) { return db.classOccurrence.create({data:{id:prefix+label,templateId:ids.template,startAt,endAt,capacity:25}}); }
function form(row: {id:string;startAt:Date;updatedAt:Date}) { const f=new FormData(); Object.entries({id:row.id,expectedStartAt:row.startAt.toISOString(),expectedUpdatedAt:row.updatedAt.toISOString(),confirmDelete:'yes'}).forEach(([k,v])=>f.set(k,v)); return f; }
describe.skipIf(!process.env.CALLBACK_TEST_DATABASE_URL)('delete exactly one occurrence',()=>{
 beforeAll(async()=>{ auth.id=ids.owner; await db.user.createMany({data:[{id:ids.owner,email:ids.owner+'@example.test',role:'OWNER'},{id:ids.member,email:ids.member+'@example.test'},{id:ids.waiting,email:ids.waiting+'@example.test'}]}); await db.classCategory.create({data:{id:ids.category,name:prefix,slug:prefix}}); await db.classTemplate.create({data:{id:ids.template,categoryId:ids.category,name:'Work & Tone',slug:prefix,description:'Synthetic deletion test',durationMinutes:50,defaultCapacity:25,tags:[],equipment:[]}}); });
 afterAll(async()=>{await db.$disconnect();});
 it('removes only the chosen empty date, preserves its sibling and queues no email',async()=>{
  const target=await fixture('empty');const sibling=await fixture('sibling'); const f=form(target);
  await expect(remove(f)).rejects.toThrow('/admin/classes?deleted=1');
  expect(await db.classOccurrence.findUniqueOrThrow({where:{id:target.id}})).toMatchObject({status:'CANCELLED',archivedAt:expect.any(Date)});
  expect(await db.classOccurrence.findUniqueOrThrow({where:{id:sibling.id}})).toEqual(sibling);
  expect(await db.emailMessage.count({where:{userId:{in:[ids.owner,ids.member,ids.waiting]}}})).toBe(0);
  await expect(remove(f)).rejects.toThrow('/admin/classes?deleted=1');
  expect(await db.auditLog.count({where:{entityId:target.id,action:'class-occurrence.deleted-from-schedule'}})).toBe(1);
 });
 it('cancels bookings and waiting entries, restores the original credit once, and notifies only signups',async()=>{
  const target=await fixture('booked'); const b=await db.booking.create({data:{userId:ids.member,occurrenceId:target.id}});
  const credit=await db.creditAccount.create({data:{userId:ids.member,label:'Original',validFrom:now,entries:{create:[{type:'GRANT',quantity:1},{type:'RESERVE',quantity:-1,bookingId:b.id}]}}});
  await db.waitlistEntry.create({data:{userId:ids.waiting,occurrenceId:target.id}});
  await db.emailMessage.create({data:{userId:ids.member,to:ids.member+'@example.test',subject:'Reminder',template:'CLASS_REMINDER',dedupeKey:`class-reminder:${b.id}:${target.id}`,payload:{bookingId:b.id,occurrenceId:target.id}}});
  const f=form(target);await expect(remove(f)).rejects.toThrow('deleted=1');await expect(remove(f)).rejects.toThrow('deleted=1');
  expect(await db.booking.findUnique({where:{id:b.id}})).toMatchObject({status:'CANCELLED'});
  expect(await db.creditLedgerEntry.findMany({where:{creditAccountId:credit.id,type:'RELEASE'}})).toHaveLength(1);
  expect(await db.waitlistEntry.findFirst({where:{occurrenceId:target.id}})).toMatchObject({status:'EXPIRED'});
  const emails=await db.emailMessage.findMany({where:{dedupeKey:{startsWith:`class-deleted:${target.id}:`}}});
  expect(emails.map(x=>x.userId).sort()).toEqual([ids.member,ids.waiting].sort());
  expect(await db.emailMessage.findUnique({where:{dedupeKey:`class-reminder:${b.id}:${target.id}`}})).toMatchObject({status:'CANCELLED'});
 });
 it('rejects a stale date or missing confirmation without removing anything',async()=>{
  const target=await fixture('stale');const f=form(target);f.set('expectedStartAt',new Date(+startAt+3600000).toISOString());
  await expect(remove(f)).rejects.toThrow('error=delete-stale');f.set('expectedStartAt',startAt.toISOString());f.delete('confirmDelete');
  await expect(remove(f)).rejects.toThrow('error=delete-confirm');
  expect(await db.classOccurrence.findUnique({where:{id:target.id}})).toMatchObject({status:'SCHEDULED',archivedAt:null});
 });
 it('requires admin access before mutation',async()=>{
  const target=await fixture('auth');auth.allowed=false;try{await expect(remove(form(target))).rejects.toThrow('denied');}finally{auth.allowed=true;}
  expect(await db.classOccurrence.findUnique({where:{id:target.id}})).toMatchObject({status:'SCHEDULED'});
 });
 it('rejects an unresolved checkout and preserves it for reconciliation',async()=>{
  const target=await fixture('pending');await db.commerceOrder.create({data:{userId:ids.member,occurrenceId:target.id,kind:'EVENT',status:'PENDING',amountCents:3000}});
  await expect(remove(form(target))).rejects.toThrow('error=delete-payment');expect(await db.classOccurrence.findUnique({where:{id:target.id}})).toMatchObject({status:'SCHEDULED'});
 });
 it('rejects later admissions and rescheduling of a removed occurrence at the database boundary',async()=>{
  const target=await fixture('guard');await expect(remove(form(target))).rejects.toThrow('deleted=1');
  await expect(db.booking.create({data:{userId:ids.member,occurrenceId:target.id}})).rejects.toThrow();
  await expect(db.waitlistEntry.create({data:{userId:ids.waiting,occurrenceId:target.id}})).rejects.toThrow();
  await expect(db.classOccurrence.update({where:{id:target.id},data:{status:'SCHEDULED'}})).rejects.toThrow();
 });
 it('keeps a delayed paid receipt without rebooking a deleted event or sending a booked confirmation',async()=>{
  const target=await fixture('receipt');const order=await db.commerceOrder.create({data:{userId:ids.member,occurrenceId:target.id,kind:'EVENT',status:'PAID',amountCents:3000}});
  const booking=await db.booking.create({data:{userId:ids.member,occurrenceId:target.id,source:'STRIPE_EVENT'}});
  await expect(remove(form(target))).rejects.toThrow('deleted=1');
  const {processStripeEvent}=await import('@/lib/payments/webhook-processor');
  await db.$transaction(tx=>processStripeEvent(tx,{id:prefix+'evt',type:'checkout.session.completed',created:Math.floor(Date.now()/1000),data:{object:{id:prefix+'cs',payment_status:'paid',amount_total:3000,currency:'usd',payment_intent:prefix+'pi',metadata:{commerceOrderId:order.id}}}} as never));
  expect(await db.commerceOrder.findUnique({where:{id:order.id}})).toMatchObject({status:'FULFILLMENT_REVIEW'});
  expect(await db.booking.findUnique({where:{id:booking.id}})).toMatchObject({status:'CANCELLED'});
  expect(await db.paymentRecord.count({where:{commerceOrderId:order.id,status:'SUCCEEDED'}})).toBe(1);
  expect(await db.emailMessage.count({where:{dedupeKey:`commerce-confirmation:${order.id}`}})).toBe(0);
 });

 it('rolls all local effects back if the final audit write fails',async()=>{
  const target=await fixture('rollback');const booking=await db.booking.create({data:{userId:ids.member,occurrenceId:target.id}});
  const original=db.$transaction.bind(db);
  const spy=vi.spyOn(db,'$transaction').mockImplementationOnce(((fn:any,options:any)=>original(async(tx:any)=>fn(new Proxy(tx,{get(t,k){return k==='auditLog'?{create:async()=>{throw Error('Injected audit failure');}}:t[k];}})),options)) as any);
  try{await expect(remove(form(target))).rejects.toThrow('Injected audit failure');}finally{spy.mockRestore();}
  expect(await db.classOccurrence.findUnique({where:{id:target.id}})).toMatchObject({status:'SCHEDULED',archivedAt:null});
  expect(await db.booking.findUnique({where:{id:booking.id}})).toMatchObject({status:'CONFIRMED'});
  expect(await db.emailMessage.count({where:{dedupeKey:{startsWith:`class-deleted:${target.id}:`}}})).toBe(0);
 });
 it.each([1,2,3])('concurrent admission/removal preserves the invariant (%i)',async n=>{
  const target=await fixture('race'+n);
  await Promise.allSettled([remove(form(target)),db.booking.create({data:{occurrenceId:target.id,userId:ids.member}})]);
  const row=await db.classOccurrence.findUniqueOrThrow({where:{id:target.id}});
  if(row.archivedAt) expect(await db.booking.count({where:{occurrenceId:target.id,status:'CONFIRMED'}})).toBe(0);
  else expect(row.status).toBe('SCHEDULED');
 });

 it('includes an admission committed while deletion waits for the occurrence lock',async()=>{
  const target=await fixture('blocked-admission');
  let releaseLock!:()=>void;
  let reportLocked!:(pid:number)=>void;
  const release=new Promise<void>(resolve=>{releaseLock=resolve;});
  const locked=new Promise<number>(resolve=>{reportLocked=resolve;});
  const blocker=db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${target.id}))`;
   const [connection]=await tx.$queryRaw<Array<{pid:number}>>`SELECT pg_backend_pid() AS pid`;
   reportLocked(connection.pid);
   await release;
  },{timeout:10000});
  const blockerPid=await locked;
  const deletion=remove(form(target)).then(()=>null,error=>error as Error);
  try{
   // Observe the actual lock wait; a timed sleep does not prove the deletion
   // transaction established its snapshot before the independent admission.
   await vi.waitFor(async()=>{
    const [waiting]=await db.$queryRaw<Array<{count:number}>>`
     SELECT count(*)::int AS count FROM pg_stat_activity
     WHERE ${blockerPid} = ANY(pg_blocking_pids(pid)) AND wait_event = 'advisory'
    `;
    expect(waiting.count).toBeGreaterThan(0);
   },{timeout:3000,interval:10});
   await db.booking.create({data:{occurrenceId:target.id,userId:ids.member}});
  }finally{
   releaseLock();
   await blocker;
  }
  expect((await deletion)?.message).toBe('/admin/classes?deleted=1');
  expect(await db.classOccurrence.findUnique({where:{id:target.id}})).toMatchObject({archivedAt:expect.any(Date)});
  expect(await db.booking.count({where:{occurrenceId:target.id,status:'CONFIRMED'}})).toBe(0);
  expect(await db.emailMessage.count({where:{dedupeKey:`class-deleted:${target.id}:${ids.member}`}})).toBe(1);
 });

 it('cancels precise and legacy queued confirmations for only the removed date',async()=>{
  const target=await fixture('queued');const sibling=await fixture('queued-sibling');await db.classOccurrence.update({where:{id:sibling.id},data:{startAt:new Date(+startAt+86400000),endAt:new Date(+endAt+86400000)}});
  const booking=await db.booking.create({data:{occurrenceId:target.id,userId:ids.member}});
  for(const [suffix,payload] of [['precise',{bookingId:booking.id,occurrenceId:target.id}],['legacy',{className:'Work & Tone',classDate:startAt.toLocaleDateString('en-US',{timeZone:'America/New_York',weekday:'long',month:'long',day:'numeric'}),classTime:startAt.toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'})}],['sibling',{occurrenceId:sibling.id}]] as const) await db.emailMessage.create({data:{userId:ids.member,to:ids.member+'@example.test',subject:'Booked',template:'BOOKING_CONFIRMATION',dedupeKey:`${target.id}-${suffix}`,payload}});
  await expect(remove(form(target))).rejects.toThrow('deleted=1');
  for(const suffix of ['precise','legacy']) expect(await db.emailMessage.findUnique({where:{dedupeKey:`${target.id}-${suffix}`}})).toMatchObject({status:'CANCELLED'});
  expect(await db.emailMessage.findUnique({where:{dedupeKey:`${target.id}-sibling`}})).toMatchObject({status:'QUEUED'});
 });

 it('rechecks archived dates before a queued confirmation is delivered',async()=>{
  const target=await fixture('delivery');const sibling=await fixture('delivery-other');await db.booking.create({data:{userId:ids.member,occurrenceId:target.id}});await expect(remove(form(target))).rejects.toThrow('deleted=1');
  const {bookingConfirmationIsDeliverable}=await import('@/lib/notifications/booking-confirmation-delivery');
  const message={template:'BOOKING_CONFIRMATION',userId:ids.member,createdAt:new Date(),payload:{occurrenceId:target.id}};
  expect(await bookingConfirmationIsDeliverable(db,message)).toBe(false);
  expect(await bookingConfirmationIsDeliverable(db,{...message,payload:{occurrenceId:sibling.id}})).toBe(true);
  expect(await bookingConfirmationIsDeliverable(db,{...message,payload:{className:'Work & Tone',classDate:startAt.toLocaleDateString('en-US',{timeZone:'America/New_York',weekday:'long',month:'long',day:'numeric'}),classTime:startAt.toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'})}})).toBe(false);
  expect(await bookingConfirmationIsDeliverable(db,{...message,template:'PAYMENT_RECEIPT'})).toBe(true);
 });
 it('does not retroactively cancel a past booking or return its spent credit',async()=>{
  const target=await fixture('past');const past=await db.classOccurrence.update({where:{id:target.id},data:{startAt:new Date(+now-86400000),endAt:new Date(+now-86400000+3000000)}});await db.booking.create({data:{userId:ids.member,occurrenceId:target.id}});
  await expect(remove(form(past))).rejects.toThrow('error=delete-history');
  expect(await db.classOccurrence.findUnique({where:{id:target.id}})).toMatchObject({archivedAt:null});
 });

});
