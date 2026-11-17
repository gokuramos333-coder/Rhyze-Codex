import fs from 'node:fs';
import { manageBlackFridayTicket } from '@/lib/payments/black-friday-management';
import { vipMonthlyBenefitWindowForDate } from '@/lib/domain/credits/vip-monthly-benefits';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { bookingAccessType } from '@/lib/domain/bookings/booking-access';
import { classTicketCanTransfer } from '@/lib/payments/class-ticket';
import { startBlackFridayCheckout, applyBlackFridaySession, claimBlackFridayGuest, reverseBlackFridayTicket, blackFridayRoster } from '@/lib/payments/black-friday-checkout';
const url = process.env.CALLBACK_TEST_DATABASE_URL;
if (!url || new URL(url).hostname !== '127.0.0.1' || !new URL(url).port || !process.env.TRIAL_TEST_DATABASE_DIR || new URL(url).pathname !== '/callback_test') throw new Error('Owned disposable DB required');
const db = new PrismaClient({ datasources: { db: { url } } });
const occurrenceId = 'cmvv9bp4g0001gt09ewtk8n57';
const slug = 'rhyzology-black-friday-neon-choreo-party-mvv992kn';
const now = new Date('2026-11-01T12:00:00Z');
const sessions = new Map<string, any>();
const stripe: any = { checkout: { sessions: { create: vi.fn(async (p: any, options: any) => {
  if (sessions.has(options.idempotencyKey)) return sessions.get(options.idempotencyKey);
  const s = { id: `cs_${randomUUID()}`, url: 'https://checkout.stripe.test/session', metadata: p.metadata, currency: 'usd', amount_total: p.line_items[0].price_data.unit_amount, status: 'open', payment_status: 'unpaid', payment_intent: `pi_${randomUUID()}` };
  sessions.set(options.idempotencyKey, s); return s;
}), retrieve: vi.fn(async (id: string) => [...sessions.values()].find(s => s.id === id)) } } };
async function user(name: string, phone?: string) {
 const id = randomUUID(); await db.user.create({ data: { id, name, email: `${id}@example.test`, status: 'ACTIVE', ...(phone ? { memberProfile: { create: { phone } } } : {}) } });
 await db.waiverAcceptance.create({ data: { userId: id, waiverVersionId: 'bf-waiver', signedDate: now } }); return id;
}
let buyer: string;
let attendanceActor: string | null = null;
beforeAll(async () => {
 const [identity]=await db.$queryRaw<{dir:string;name:string}[]>`SELECT current_setting('data_directory') AS dir,current_database() AS name`;
 if(identity.name!=='callback_test'||fs.realpathSync(identity.dir)!==fs.realpathSync(process.env.TRIAL_TEST_DATABASE_DIR!))throw Error('Wrong disposable database directory');
 vi.stubEnv('RHYZE_BLACK_FRIDAY_SALES_ENABLED','true');
 await db.waiverVersion.create({ data: { id: 'bf-waiver', title: 'Fixture', body: 'Fixture', version: 99991, isActive: true, requiresSign: true, effectiveAt: now } });
 await db.classCategory.create({ data: { id: 'bf-category', name: 'Fixture', slug: 'bf-fixture' } });
 await db.classTemplate.create({ data: { id: 'bf-template', categoryId: 'bf-category', name: 'Fixture', slug, description: 'Fixture', durationMinutes: 75, defaultCapacity: 2, tags: [], equipment: [], isEvent: true, dropInPriceCents: 2500 } });
 await db.classOccurrence.create({ data: { id: occurrenceId, templateId: 'bf-template', startAt: new Date('2026-11-28T00:30:00Z'), endAt: new Date('2026-11-28T01:45:00Z'), capacity: 2, priceCents: 2500 } });
 buyer = await user('Buyer Person');
 await db.user.update({where:{id:buyer},data:{role:'OWNER'}});
});
afterAll(async () => { vi.unstubAllEnvs(); await db.$disconnect(); });
async function emptySeats() {
 await db.booking.updateMany({where:{occurrenceId,source:'MEMBER'},data:{status:'CANCELLED'}});
}
async function single(name:string) {
 const userId=await user(name);
 const input={userId,occurrenceId,slug,origin:'http://localhost',ticketType:'SINGLE' as const};
 const result=await startBlackFridayCheckout(db,stripe,input,now);
 const session=[...sessions.values()].find(s=>s.metadata.commerceOrderId===result.orderId)!;
 return {input,...result,session};
}
async function paid(s:any){s.status='complete';s.payment_status='paid';await db.$transaction(tx=>applyBlackFridaySession(tx,s,now));}
async function refund(s:any){await db.$transaction(tx=>reverseBlackFridayTicket(tx,{orderId:s.metadata.commerceOrderId,paymentIntentId:s.payment_intent,refundedAmountCents:s.amount_total,disputed:false},now));}
async function used(){return (await db.$queryRaw<{used:number}[]>`SELECT used FROM "BlackFridayCapacity" WHERE "occurrenceId"=${occurrenceId}`)[0].used;}

vi.mock('@/lib/auth/session',()=>({requireApprovedOwner:async()=>db.user.findUniqueOrThrow({where:{id:buyer}}),requireArea:async()=>db.user.findUniqueOrThrow({where:{id:attendanceActor ?? buyer}}),requireActiveUser:async()=>db.user.findUniqueOrThrow({where:{id:attendanceActor ?? buyer}})}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('next/navigation',()=>({redirect:(s:string)=>{throw Error('REDIRECT:'+s);}}));
vi.mock('@/lib/payments/attendance-fee',()=>({chargeAttendanceFee:vi.fn(async()=>({status:'FAILED'})),refundAttendanceFee:vi.fn()}));
vi.mock('@/auth',()=>({auth:async()=>({user:{id:buyer}})}));
vi.mock('@/lib/db/prisma',()=>({prisma:db}));
vi.mock('@/lib/payments/stripe',()=>({getStripe:()=>stripe,stripeIsConfigured:()=>true}));
it.each(['PENDING', 'PAID', 'PAYMENT_FAILED'] as const)('does not start a second payment while an older %s single-ticket order needs review', async status => {
 const userId = await user(`Legacy ${status}`);
 const legacy = await db.commerceOrder.create({data:{userId,occurrenceId,kind:'EVENT',status,amountCents:2500,stripeCheckoutSessionId:`cs_legacy_${randomUUID()}`}});
 const calls = stripe.checkout.sessions.create.mock.calls.length;
 await expect(startBlackFridayCheckout(db,stripe,{userId,occurrenceId,slug,origin:'http://localhost',ticketType:'PAIR',friend:{fullName:`Fresh ${status}`,phone:'2015550185'},firstVisitDeclared:true},now)).rejects.toThrow('earlier event checkout');
 expect(await db.commerceOrder.count({where:{userId,occurrenceId}})).toBe(1);
 expect(await db.$queryRaw`SELECT "orderId" FROM "BlackFridayTicket" WHERE "userId"=${userId}`).toHaveLength(0);
 expect(stripe.checkout.sessions.create.mock.calls).toHaveLength(calls);
 await db.commerceOrder.delete({where:{id:legacy.id}});
});
it('charges server $40 once, holds exactly two, projects a named pending guest, claims only with own waiver, and reverses without replay resurrection', async () => {
 const input = { userId: buyer, occurrenceId, slug, origin: 'http://localhost', ticketType: 'PAIR' as const, friend: { fullName: 'Fresh Friend', phone: '2015550190' }, firstVisitDeclared: true };
 const [a,b] = await Promise.all([startBlackFridayCheckout(db,stripe,input,now),startBlackFridayCheckout(db,stripe,input,now)]);
 expect(a.orderId).toBe(b.orderId);
 expect(await db.commerceOrder.findUnique({ where: { id:a.orderId } })).toMatchObject({ amountCents:4000 });
 const outsider = await user('Single Outsider');
 await expect(db.booking.create({ data: { occurrenceId, userId: outsider } })).rejects.toThrow();
 expect((await db.$queryRaw<{pendingTicketSeats:number}[]>`SELECT "pendingTicketSeats" FROM "ClassOccurrence" WHERE id=${occurrenceId}`)[0].pendingTicketSeats).toBe(2);
 const session = [...sessions.values()][0]; session.status='complete'; session.payment_status='paid';
 await db.$transaction(tx => applyBlackFridaySession(tx,session,now));
 await db.$transaction(tx => applyBlackFridaySession(tx,session,now));
 const roster = await blackFridayRoster(db,occurrenceId);
 expect(roster).toHaveLength(2); expect(roster.map(r=>r.name)).toEqual(['Buyer Person','Fresh Friend']);
 expect(roster[1].userId).toBeNull();
 expect((await db.$queryRaw<{pendingTicketSeats:number}[]>`SELECT "pendingTicketSeats" FROM "ClassOccurrence" WHERE id=${occurrenceId}`)[0].pendingTicketSeats).toBe(1);
 const guest = await user('Fresh Friend','2015550190');
 await expect(claimBlackFridayGuest(db,{ orderId:a.orderId,userId:outsider,actorId:buyer },now)).rejects.toThrow();
 await expect(claimBlackFridayGuest(db,{orderId:a.orderId,userId:guest,actorId:outsider},now)).rejects.toThrow('authorization');
 await db.waiverAcceptance.delete({where:{waiverVersionId_userId:{waiverVersionId:'bf-waiver',userId:guest}}});
 await expect(claimBlackFridayGuest(db,{orderId:a.orderId,userId:guest,actorId:buyer},now)).rejects.toThrow('waiver');
 await db.waiverAcceptance.create({data:{userId:guest,waiverVersionId:'bf-waiver',signedDate:now}});
 await claimBlackFridayGuest(db,{ orderId:a.orderId,userId:guest,actorId:buyer },now);
 expect(await db.booking.count({where:{occurrenceId,status:'CONFIRMED'}})).toBe(2);
 const pairBookings=await db.booking.findMany({where:{occurrenceId,status:'CONFIRMED'}});
 for(const booking of pairBookings){
  expect(classTicketCanTransfer(booking.policySnapshot)).toBe(false);
  expect(bookingAccessType({policySnapshot:booking.policySnapshot,bookingSource:booking.source,reservedProductKind:null,activeProductKinds:['INTRO_TRIAL']})).toBe('STANDARD');
 }
 await db.$transaction(tx=>reverseBlackFridayTicket(tx,{orderId:a.orderId,paymentIntentId:session.payment_intent,refundedAmountCents:1000,disputed:false},now));
 expect((await blackFridayRoster(db,occurrenceId)).every(r=>r.review)).toBe(true);
 await expect(db.booking.create({data:{occurrenceId,userId:outsider}})).rejects.toThrow();
 await db.$transaction(tx=>reverseBlackFridayTicket(tx,{orderId:a.orderId,paymentIntentId:session.payment_intent,refundedAmountCents:4000,disputed:false},now));
 await db.$transaction(tx=>applyBlackFridaySession(tx,session,now));
 expect(await db.booking.count({where:{occurrenceId,status:'CONFIRMED'}})).toBe(0);
 expect(await blackFridayRoster(db,occurrenceId)).toHaveLength(0);
 const calls=stripe.checkout.sessions.create.mock.calls.length;
 await expect(startBlackFridayCheckout(db,stripe,input,now)).rejects.toThrow('history');
 expect(stripe.checkout.sessions.create.mock.calls).toHaveLength(calls);
 await db.booking.create({data:{occurrenceId,userId:outsider}});
});
it('requires declaration, rejects noncanonical events and prevents overselling in raw single upserts',async()=>{
 const input={userId:buyer,occurrenceId,slug,origin:'http://localhost',ticketType:'PAIR' as const,friend:{fullName:'Another Friend',phone:'2015550191'}};
 await expect(startBlackFridayCheckout(db,stripe,input,now)).rejects.toThrow();
 await expect(startBlackFridayCheckout(db,stripe,{...input,firstVisitDeclared:true,occurrenceId:'wrong'},now)).rejects.toThrow();
 const users=await Promise.all([user('Seat One'),user('Seat Two')]);
 const outcomes=await Promise.allSettled(users.map(userId=>db.booking.create({data:{occurrenceId,userId}})));
 expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1);
});
it('shows HELD and expired late-paid liabilities to staff without reacquiring capacity',async()=>{
 await emptySeats(); const a=await single('Held Buyer');
 expect((await blackFridayRoster(db,occurrenceId)).map(x=>x.orderId)).toContain(a.orderId);
 a.session.status='expired'; await db.$transaction(tx=>applyBlackFridaySession(tx,a.session,now));
 expect(await used()).toBe(0);
 await paid(a.session); expect(await used()).toBe(0);
 expect((await blackFridayRoster(db,occurrenceId)).map(x=>x.orderId)).toContain(a.orderId);
 await refund(a.session); expect(await used()).toBe(0);
});
it('retried expired checkout releases once and can start a new order',async()=>{
 await emptySeats(); const a=await single('Expiry Buyer');a.session.status='expired';
 await expect(startBlackFridayCheckout(db,stripe,a.input,new Date(now.getTime()+32*60000))).rejects.toThrow('closed');
 expect(await used()).toBe(0);
 const fresh=await startBlackFridayCheckout(db,stripe,a.input,new Date(now.getTime()+33*60000));
 expect(fresh.orderId).not.toBe(a.orderId);
 const s=[...sessions.values()].find(s=>s.metadata.commerceOrderId===fresh.orderId);s.status='expired';await db.$transaction(tx=>applyBlackFridaySession(tx,s,now));
});
it('blocks legacy paid replay creating a second admission for a held buyer',async()=>{
 await emptySeats(); const a=await single('Legacy Buyer');
 await expect(db.booking.create({data:{userId:a.input.userId,occurrenceId,source:'STRIPE_EVENT'}})).rejects.toThrow();
 a.session.status='expired';await db.$transaction(tx=>applyBlackFridaySession(tx,a.session,now));
});
it('blocks raw cancellation and capacity reduction while reservations exist',async()=>{
 await emptySeats();const a=await single('Guard Buyer');
 await expect(db.classOccurrence.update({where:{id:occurrenceId},data:{status:'CANCELLED'}})).rejects.toThrow();
 await expect(db.classOccurrence.update({where:{id:occurrenceId},data:{capacity:0}})).rejects.toThrow();
 await paid(a.session);
 const booking=await db.booking.findFirstOrThrow({where:{occurrenceId,userId:a.input.userId}});
 await expect(db.booking.update({where:{id:booking.id},data:{status:'CANCELLED'}})).rejects.toThrow();
 await refund(a.session);
});
it('does not charge a pair whose guest has incompatible canonical booking history',async()=>{
 await emptySeats();const g=await user('Cancelled Guest','2015550180');
 await db.booking.create({data:{userId:g,occurrenceId,status:'CANCELLED'}});
 const u=await user('New Payer');const calls=stripe.checkout.sessions.create.mock.calls.length;
 await expect(startBlackFridayCheckout(db,stripe,{userId:u,occurrenceId,slug,origin:'http://localhost',ticketType:'PAIR',friend:{fullName:'Cancelled Guest',phone:'2015550180'},firstVisitDeclared:true},now)).rejects.toThrow('history');
 expect(stripe.checkout.sessions.create.mock.calls).toHaveLength(calls);
});
it('settles a lost dispute terminally without claiming a cash refund',async()=>{
 await emptySeats();const a=await single('Dispute Buyer');await paid(a.session);
 const {processBlackFridayEvent}=await import('@/lib/payments/black-friday-webhook');
 await db.$transaction(tx=>processBlackFridayEvent(tx,{type:'charge.dispute.closed',data:{object:{id:'dp_fixture',payment_intent:a.session.payment_intent,status:'lost',amount:2500,currency:'usd'}}} as any));
 expect(await used()).toBe(0);
 expect((await db.commerceOrder.findUniqueOrThrow({where:{id:a.orderId}})).status).toBe('DISPUTED');
 await paid(a.session);expect(await used()).toBe(0);
});
it('reserves one valid November VIP credit plus $15 once and restores original expiry after refund',async()=>{
 await emptySeats(); const u=await user('Paid VIP');const w=vipMonthlyBenefitWindowForDate(now);const id=randomUUID();
 await db.product.create({data:{id,slug:id,name:'VIP',description:'Fixture',kind:'VIP',priceCents:20000,isUnlimited:true,eligibleCategoryIds:[]}});
 await db.purchase.create({data:{id,userId:u,productId:id,status:'PAID',amountCents:20000,paidAt:now}});
 await db.membership.create({data:{userId:u,productId:id,purchaseId:id,status:'ACTIVE',currentPeriodStart:w.validFrom,currentPeriodEnd:w.validUntil}});
 await db.creditAccount.create({data:{userId:u,sourcePurchaseId:id,label:'VIP paid',isUnlimited:true,validFrom:w.validFrom,validUntil:w.validUntil}});
 const account=await db.creditAccount.create({data:{userId:u,label:w.eventCreditLabel,isUnlimited:false,validFrom:w.validFrom,validUntil:w.validUntil,entries:{create:{type:'GRANT',quantity:1}}}});
 const input={userId:u,occurrenceId,slug,origin:'http://localhost',ticketType:'PAIR' as const,friend:{fullName:'VIP Fresh Guest',phone:'2015550177'},firstVisitDeclared:true,useEventCredit:true};
 const [a,c]=await Promise.all([startBlackFridayCheckout(db,stripe,input,now),startBlackFridayCheckout(db,stripe,input,now)]);expect(a.orderId).toBe(c.orderId);
 const s=[...sessions.values()].find(s=>s.metadata.commerceOrderId===a.orderId);expect(s.amount_total).toBe(1500);
 const reserve=await db.creditLedgerEntry.findFirstOrThrow({where:{creditAccountId:account.id,type:'RESERVE'}});
 await expect(db.creditLedgerEntry.delete({where:{id:reserve.id}})).rejects.toThrow();
 await expect(db.creditLedgerEntry.create({data:{creditAccountId:account.id,type:'RESERVE',quantity:-1}})).rejects.toThrow();
 await paid(s);await refund(s);await refund(s);await paid(s);
 const final=await db.creditAccount.findUniqueOrThrow({where:{id:account.id},include:{entries:true}});
 expect(final.validUntil).toEqual(w.validUntil);expect(final.entries.reduce((n,e)=>n+e.quantity,0)).toBe(1);expect(final.entries.filter(e=>e.type==='RELEASE')).toHaveLength(1);
});
it('retains seats for pending refunds and archives provider success before releasing',async()=>{
 await emptySeats();const a=await single('Refund Buyer');await paid(a.session);
 const {processBlackFridayEvent}=await import('@/lib/payments/black-friday-webhook');
 const r={id:'re_fixture',payment_intent:a.session.payment_intent,status:'pending',amount:2500,currency:'usd'};
 const event=()=>({type:'charge.refunded',data:{object:{id:'ch_fixture',payment_intent:a.session.payment_intent,amount:2500,currency:'usd',amount_refunded:2500,refunds:{data:[r],has_more:false}}}} as any);
 await db.$transaction(tx=>processBlackFridayEvent(tx,event()));expect(await used()).toBe(1);
 expect(await db.commerceRefund.findUnique({where:{stripeRefundId:r.id}})).toMatchObject({status:'PENDING'});
 r.status='succeeded';await db.$transaction(tx=>processBlackFridayEvent(tx,event()));expect(await used()).toBe(0);
 expect(await db.commerceRefund.findUnique({where:{stripeRefundId:r.id}})).toMatchObject({status:'SUCCEEDED',amountCents:2500});
 r.status='pending';await db.$transaction(tx=>processBlackFridayEvent(tx,event()));expect(await used()).toBe(0);
});
it('reconciles staff cancellation only from succeeded provider refunds',async()=>{
 await emptySeats();const a=await single('Staff Refund Buyer');await paid(a.session);
 const charge={id:'ch_staff',payment_intent:a.session.payment_intent,amount:2500,currency:'usd',amount_refunded:0,disputed:true};
 const refunds:any[]=[];
 const provider:any={checkout:stripe.checkout,disputes:{list:()=>({async *[Symbol.asyncIterator](){yield {id:'dp_won',status:'won',payment_intent:a.session.payment_intent,amount:2500,currency:'usd'};}})},paymentIntents:{retrieve:async()=>({id:a.session.payment_intent,metadata:{commerceOrderId:a.orderId},amount:2500,currency:'usd',latest_charge:charge})},refunds:{create:vi.fn(async()=>{charge.amount_refunded=2500;const r={id:'re_staff',payment_intent:a.session.payment_intent,amount:2500,currency:'usd',status:'pending'};refunds.push(r);return r;}),list:()=>({async *[Symbol.asyncIterator](){yield* refunds;}})}};
 await expect(manageBlackFridayTicket(db,provider,{actorId:buyer,orderId:a.orderId,operation:'CANCEL',reason:'Fixture cancellation'},now)).rejects.toThrow('pending');
 expect(await used()).toBe(1);refunds[0].status='succeeded';
 await manageBlackFridayTicket(db,provider,{actorId:buyer,orderId:a.orderId,operation:'RECONCILE',reason:'Verify refund'},now);
 expect(await used()).toBe(0);expect(provider.refunds.create).toHaveBeenCalledTimes(1);
});
it('blocks cancellation versus raw admission in either winner order',async()=>{
 await emptySeats();const u=await user('Cancellation Race');
 const results=await Promise.allSettled([db.classOccurrence.update({where:{id:occurrenceId},data:{status:'CANCELLED'}}),db.booking.create({data:{userId:u,occurrenceId}})]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 const o=await db.classOccurrence.findUniqueOrThrow({where:{id:occurrenceId}});
 if(o.status==='CANCELLED')expect(await used()).toBe(0);
 await emptySeats();await db.classOccurrence.update({where:{id:occurrenceId},data:{status:'SCHEDULED'}});
});
it('allows staff to reconcile a recovered provider session after an uncertain create response',async()=>{
 await emptySeats();const a=await single('Unknown Session');
 await db.commerceOrder.update({where:{id:a.orderId},data:{stripeCheckoutSessionId:null}});
 a.session.status='expired';
 await manageBlackFridayTicket(db,stripe,{actorId:buyer,orderId:a.orderId,operation:'RECONCILE',reason:'Provider session found',sessionId:a.session.id} as any,now);
 expect(await used()).toBe(0);expect((await db.commerceOrder.findUniqueOrThrow({where:{id:a.orderId}})).stripeCheckoutSessionId).toBe(a.session.id);
});
it('rejects a recovered session belonging to another order before provider expiry',async()=>{
 await emptySeats();const a=await single('Wrong Session');await db.commerceOrder.update({where:{id:a.orderId},data:{stripeCheckoutSessionId:null}});
 const expire=vi.fn(async()=>a.session);const provider:any={checkout:{sessions:{retrieve:async()=>({...a.session,metadata:{...a.session.metadata,commerceOrderId:'other'}}),expire}}};
 await expect(manageBlackFridayTicket(db,provider,{actorId:buyer,orderId:a.orderId,operation:'CANCEL',reason:'Fixture mismatch',sessionId:a.session.id},now)).rejects.toThrow('identity');
 expect(expire).not.toHaveBeenCalled();a.session.status='expired';await db.$transaction(tx=>applyBlackFridaySession(tx,a.session,now));
});
it('counts real ON CONFLICT upserts once and serializes cancelled-row reactivation',async()=>{
 await emptySeats(); const u=await user('Upsert Person');
 const where={occurrenceId_userId:{occurrenceId,userId:u}};
 await db.booking.upsert({where,create:{occurrenceId,userId:u},update:{status:'CONFIRMED'}});
 await db.booking.upsert({where,create:{occurrenceId,userId:u},update:{status:'CONFIRMED'}});expect(await used()).toBe(1);
 const users=await Promise.all([user('Update One'),user('Update Two')]);
 const bookings=await Promise.all(users.map(userId=>db.booking.create({data:{occurrenceId,userId,status:'CANCELLED'}})));
 const results=await Promise.allSettled(bookings.map(row=>db.booking.update({where:{id:row.id},data:{status:'CONFIRMED'}})));
 expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect(await used()).toBe(2);await emptySeats();
});
it('leaves pre-existing canonical single orders without ticket ownership to legacy handling',async()=>{
 const order=await db.commerceOrder.create({data:{userId:buyer,occurrenceId,kind:'EVENT',amountCents:2500,status:'PAID',stripePaymentIntentId:'pi_legacy_canonical'}});
 const {processBlackFridayEvent}=await import('@/lib/payments/black-friday-webhook');
 const handled=await db.$transaction(tx=>processBlackFridayEvent(tx,{type:'charge.refunded',data:{object:{id:'ch_legacy',payment_intent:'pi_legacy_canonical',amount:2500,currency:'usd',amount_refunded:2500,refunds:{data:[],has_more:false}}}} as any));
 expect(handled).toBe(false);expect(await db.commerceRefund.count({where:{commerceOrderId:order.id}})).toBe(0);
});
it.each(['RepeatableRead','Serializable'] as const)('rejects a stale %s snapshot competing with a ticket for the last seat',async isolationLevel=>{
 await emptySeats();await db.classOccurrence.update({where:{id:occurrenceId},data:{capacity:1}});
 const u=await user('Stale Admission');let ready!:()=>void;const began=new Promise<void>(r=>{ready=r;});let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
 const attempt=db.$transaction(async tx=>{await tx.booking.count({where:{occurrenceId}});ready();await gate;return tx.booking.create({data:{userId:u,occurrenceId}});},{isolationLevel});
 const outcome=Promise.allSettled([attempt]);await began;const a=await single('Snapshot Winner');release();
 expect((await outcome)[0].status).toBe('rejected');expect(await used()).toBe(1);
 a.session.status='expired';await db.$transaction(tx=>applyBlackFridaySession(tx,a.session,now));await db.classOccurrence.update({where:{id:occurrenceId},data:{capacity:2}});
});
it.each(['RepeatableRead','Serializable'] as const)('rejects stale %s legacy credit spends after another writer commits',async isolationLevel=>{
 const u=await user('Stale Credit');const w=vipMonthlyBenefitWindowForDate(now);
 const a=await db.creditAccount.create({data:{userId:u,label:w.eventCreditLabel,validFrom:w.validFrom,validUntil:w.validUntil,entries:{create:{type:'GRANT',quantity:1}}}});
 let ready!:()=>void;const began=new Promise<void>(r=>{ready=r;});let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
 const attempt=db.$transaction(async tx=>{await tx.creditLedgerEntry.findMany({where:{creditAccountId:a.id}});ready();await gate;return tx.creditLedgerEntry.create({data:{creditAccountId:a.id,type:'RESERVE',quantity:-1}});},{isolationLevel});
 const outcome=Promise.allSettled([attempt]);await began;await db.creditLedgerEntry.create({data:{creditAccountId:a.id,type:'RESERVE',quantity:-1}});release();
 expect((await outcome)[0].status).toBe('rejected');expect((await db.creditLedgerEntry.aggregate({where:{creditAccountId:a.id},_sum:{quantity:true}}))._sum.quantity).toBe(0);
});
it('prevents legacy November credit writers overdrawing and mutating a reservation',async()=>{
 const u=await user('Credit Guard'); const window=vipMonthlyBenefitWindowForDate(now);
 const a=await db.creditAccount.create({data:{userId:u,label:window.eventCreditLabel,validFrom:window.validFrom,validUntil:window.validUntil,isUnlimited:false}});
 await db.creditLedgerEntry.create({data:{creditAccountId:a.id,type:'GRANT',quantity:1}});
 const results=await Promise.allSettled([1,2].map(()=>db.creditLedgerEntry.create({data:{creditAccountId:a.id,type:'RESERVE',quantity:-1}})));
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 const entries=await db.creditLedgerEntry.findMany({where:{creditAccountId:a.id}});expect(entries.reduce((n,e)=>n+e.quantity,0)).toBe(0);
});


async function mark(bookingId:string,status:string) {
 const {markAttendanceAction}=await import('@/app/(portal)/instructor/classes/[occurrenceId]/roster/actions');
 const f=new FormData();f.set('occurrenceId',occurrenceId);f.set('bookingId',bookingId);f.set('status',status);
 try{await markAttendanceAction(f);}catch(e){if(!String(e).includes('REDIRECT:'))throw e;}
}
async function cancelOccurrence(){
 const {cancelOccurrenceAction}=await import('@/app/(studio)/admin/schedule/[occurrenceId]/actions');
 const f=new FormData();f.set('id',occurrenceId);
 try{await cancelOccurrenceAction(f);}catch(e){if(!String(e).includes('REDIRECT:'))throw e;}
}
it('FINAL-01 actual roster rejects CHECKED_IN for disputed REVIEW, including raw attendance writes',async()=>{
 await emptySeats();const a=await single('Review action');await paid(a.session);
 const b=await db.booking.findFirstOrThrow({where:{userId:a.input.userId,occurrenceId}});
 try{
 await db.$transaction(tx=>reverseBlackFridayTicket(tx,{orderId:a.orderId,paymentIntentId:a.session.payment_intent,refundedAmountCents:0,disputed:true},now));
 await expect(mark(b.id,'CHECKED_IN')).rejects.toThrow();
 expect(await db.attendanceRecord.findUnique({where:{bookingId:b.id}})).toBeNull();
 await expect(db.attendanceRecord.create({data:{bookingId:b.id,occurrenceId,userId:b.userId,status:'CHECKED_IN',markedById:buyer}})).rejects.toThrow();
 expect(await used()).toBe(1);
 }finally{await refund(a.session);}
});
it.each([['NO_SHOW','OWNER'],['LATE_CANCELLED','OWNER'],['NO_SHOW','INSTRUCTOR'],['LATE_CANCELLED','INSTRUCTOR']] as const)('FINAL-02 actual roster records paid %s as %s without releasing or refunding reserved seats',async (status,role)=>{
 await emptySeats();const a=await single('Paid absence');await paid(a.session);
 if(role==='INSTRUCTOR'){attendanceActor=await user('Assigned Instructor');await db.user.update({where:{id:attendanceActor},data:{role}});await db.classOccurrence.update({where:{id:occurrenceId},data:{instructorId:attendanceActor}});}
 const b=await db.booking.findFirstOrThrow({where:{userId:a.input.userId,occurrenceId}});
 try{
 await mark(b.id,status);
 expect(await db.booking.findUnique({where:{id:b.id}})).toMatchObject({status});
 expect(await db.attendanceRecord.findUnique({where:{bookingId:b.id}})).toMatchObject({status});
 expect(await used()).toBe(1);
 expect(await db.classOccurrence.findUnique({where:{id:occurrenceId}})).toMatchObject({pendingTicketSeats:1});
 expect(await db.commerceOrder.findUnique({where:{id:a.orderId}})).toMatchObject({status:'PAID',refundedAmountCents:0});
 await expect(cancelOccurrence()).rejects.toThrow();
 await mark(b.id,status); // clear toggle restores confirmed without a second seat
 expect(await db.booking.findUnique({where:{id:b.id}})).toMatchObject({status:'CONFIRMED'});
 expect(await used()).toBe(1);
 }finally{attendanceActor=null;await db.classOccurrence.update({where:{id:occurrenceId},data:{instructorId:null}});await refund(a.session);}
});
it('FINAL-03 actual cancellation releases original finite credits, attendance and reminders exactly once',async()=>{
 await emptySeats();const u=await user('Ordinary credit');const b=await db.booking.create({data:{userId:u,occurrenceId}});
 const expiry=new Date('2026-11-30T23:00:00Z');
 const credit=await db.creditAccount.create({data:{userId:u,label:'Event credit — original',validFrom:now,validUntil:expiry,entries:{create:[{type:'GRANT',quantity:1},{type:'RESERVE',quantity:-1,bookingId:b.id}]}}});
 await db.attendanceRecord.create({data:{bookingId:b.id,occurrenceId,userId:u,status:'CHECKED_IN',markedById:buyer}});
 await db.emailMessage.create({data:{userId:u,to:'fixture@example.test',subject:'Reminder',template:'CLASS_REMINDER',status:'QUEUED',dedupeKey:`class-reminder:${b.id}:${occurrenceId}`,payload:{}}});
 const history=await db.$queryRaw<any[]>`SELECT "orderId",state FROM "BlackFridayTicket" ORDER BY "orderId"`;
 try{
 await Promise.all([cancelOccurrence(),cancelOccurrence()]);
 expect(await db.classOccurrence.findUnique({where:{id:occurrenceId}})).toMatchObject({status:'CANCELLED'});
 expect(await db.booking.findUnique({where:{id:b.id}})).toMatchObject({status:'CANCELLED'});
 expect(await db.creditLedgerEntry.findMany({where:{creditAccountId:credit.id,type:'RELEASE'}})).toHaveLength(1);
 expect(await db.creditAccount.findUnique({where:{id:credit.id}})).toMatchObject({validUntil:expiry});
 expect(await db.attendanceRecord.findUnique({where:{bookingId:b.id}})).toBeNull();
 expect(await db.emailMessage.findUnique({where:{dedupeKey:`class-reminder:${b.id}:${occurrenceId}`}})).toMatchObject({status:'CANCELLED'});
 expect(await db.emailMessage.count({where:{dedupeKey:`class-cancelled-email:${occurrenceId}:${u}`}})).toBe(1);
 expect(await used()).toBe(0);
 expect(await db.$queryRaw<any[]>`SELECT "orderId",state FROM "BlackFridayTicket" ORDER BY "orderId"`).toEqual(history);
 }finally{await emptySeats();await db.classOccurrence.update({where:{id:occurrenceId},data:{status:'SCHEDULED'}});}
});

// Pause the real first action after its advisory fence, not a mocked database result.
async function gatedAction(action:()=>Promise<unknown>,boundary='pg_advisory_xact_lock'){
 let ready!:()=>void;const began=new Promise<void>(r=>{ready=r;});let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
 const original=db.$transaction.bind(db);
 const spy=vi.spyOn(db,'$transaction').mockImplementationOnce(((fn:any,options:any)=>original(async(tx:any)=>fn(new Proxy(tx,{get(target,key){
  if(key==='$executeRaw'||key==='$queryRaw')return async(...args:any[])=>{const result=await target[key](...args);if(String(args[0]).includes(boundary)){ready();await gate;}return result;};
  return target[key];
 }})),options)) as any);
 const result=action();await began;spy.mockRestore();return {result,release};
}
async function waitForLock(){
 for(let i=0;i<200;i++){
  const rows=await db.$queryRaw<any[]>`SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()`;
  if(rows.length)return;
  await new Promise(r=>setTimeout(r,10));
 }
 throw Error('Expected competing real PostgreSQL writer to wait');
}
it.each(['booking','cancellation'])('FINAL-03 actual booking/cancellation race: %s wins the fence',async winner=>{
 await emptySeats();const u=await user('Action race');const expiry=new Date('2026-12-01');
 const credit=await db.creditAccount.create({data:{userId:u,label:'Event credit — original',validFrom:new Date('2026-01-01'),validUntil:expiry,entries:{create:{type:'GRANT',quantity:1}}}});
 const {addMemberToClassAction}=await import('@/app/(studio)/admin/schedule/[occurrenceId]/roster/actions');
 const book=async()=>{const f=new FormData();f.set('occurrenceId',occurrenceId);f.set('memberQuery',u+'@example.test');try{await addMemberToClassAction(f);}catch(e){if(!String(e).includes('REDIRECT:'))throw e;}};
 const first=await gatedAction(winner==='booking'?book:cancelOccurrence);
 const second=winner==='booking'?cancelOccurrence():book();
 const settled=Promise.allSettled([first.result,second]);
 try{await waitForLock();}finally{first.release();}
 expect((await settled).every(r=>r.status==='fulfilled')).toBe(true);
 const b=await db.booking.findFirst({where:{userId:u,occurrenceId}});
 expect(b?.status??null).toBe(winner==='booking'?'CANCELLED':null);
 expect(await db.creditLedgerEntry.count({where:{creditAccountId:credit.id,type:'RELEASE'}})).toBe(winner==='booking'?1:0);
 expect((await db.creditLedgerEntry.aggregate({where:{creditAccountId:credit.id},_sum:{quantity:true}}))._sum.quantity).toBe(1);
 expect(await db.creditAccount.findUnique({where:{id:credit.id}})).toMatchObject({validUntil:expiry});
 expect(await used()).toBe(0);
 expect(await db.classOccurrence.findUnique({where:{id:occurrenceId}})).toMatchObject({status:'CANCELLED'});
 await db.classOccurrence.update({where:{id:occurrenceId},data:{status:'SCHEDULED'}});
});
it('FINAL-01 reversal wins while actual CHECKED_IN waits on the parent fence',async()=>{
 await emptySeats();const a=await single('Dispute race');await paid(a.session);
 const b=await db.booking.findFirstOrThrow({where:{userId:a.input.userId,occurrenceId}});
 let ready!:()=>void;const began=new Promise<void>(r=>{ready=r;});let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
 const reversal=db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT id FROM "ClassOccurrence" WHERE id=${occurrenceId} FOR UPDATE`;ready();await gate;
  await reverseBlackFridayTicket(tx,{orderId:a.orderId,paymentIntentId:a.session.payment_intent,refundedAmountCents:0,disputed:true},now);
 });
 await began;const checked=Promise.allSettled([mark(b.id,'CHECKED_IN')]);
 try{await waitForLock();}finally{release();}
 await reversal;expect((await checked)[0].status).toBe('rejected');
 expect(await db.attendanceRecord.findUnique({where:{bookingId:b.id}})).toBeNull();expect(await used()).toBe(1);
 await refund(a.session);
});
it.each(['RepeatableRead','Serializable'] as const)('FINAL-01 stale %s attendance cannot admit after a reversal',async isolationLevel=>{
 await emptySeats();const a=await single('Stale check-in');await paid(a.session);
 const b=await db.booking.findFirstOrThrow({where:{userId:a.input.userId,occurrenceId}});
 let ready!:()=>void;const began=new Promise<void>(r=>{ready=r;});let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
 const attempt=db.$transaction(async tx=>{await tx.booking.findUnique({where:{id:b.id}});ready();await gate;
 return tx.attendanceRecord.create({data:{bookingId:b.id,occurrenceId,userId:b.userId,status:'CHECKED_IN',markedById:buyer}});
 },{isolationLevel});
 const result=Promise.allSettled([attempt]);await began;
 await db.$transaction(tx=>reverseBlackFridayTicket(tx,{orderId:a.orderId,paymentIntentId:a.session.payment_intent,refundedAmountCents:0,disputed:true},now));release();
 expect((await result)[0].status).toBe('rejected');expect(await db.attendanceRecord.findUnique({where:{bookingId:b.id}})).toBeNull();
 await refund(a.session);
});

it('FINAL-01 check-in winning the fence is historical; later REVIEW forbids fresh check-in',async()=>{
 await emptySeats();const a=await single('Check-in first');await paid(a.session);
 const b=await db.booking.findFirstOrThrow({where:{userId:a.input.userId,occurrenceId}});
 const first=await gatedAction(()=>mark(b.id,'CHECKED_IN'),'FOR UPDATE');
 const reversal=db.$transaction(tx=>reverseBlackFridayTicket(tx,{orderId:a.orderId,paymentIntentId:a.session.payment_intent,refundedAmountCents:0,disputed:true},now));
 const settled=Promise.allSettled([first.result,reversal]);
 try{await waitForLock();}finally{first.release();}
 expect((await settled).every(r=>r.status==='fulfilled')).toBe(true);
 // An attendance that committed while PAID remains historical evidence, not a new admission.
 expect(await db.attendanceRecord.findUnique({where:{bookingId:b.id}})).toMatchObject({status:'CHECKED_IN'});
 await mark(b.id,'CHECKED_IN'); // clearing is permitted, never admission
 await expect(mark(b.id,'CHECKED_IN')).rejects.toThrow();
 expect(await used()).toBe(1);await refund(a.session);
});
it('FINAL-03 cancellation failure rolls back original credit, reminder, attendance and outbox together',async()=>{
 await emptySeats();const u=await user('Atomic cancellation');const b=await db.booking.create({data:{userId:u,occurrenceId}});
 const credit=await db.creditAccount.create({data:{userId:u,label:'Event credit — original',validFrom:new Date('2026-01-01'),entries:{create:[{type:'GRANT',quantity:1},{type:'RESERVE',quantity:-1,bookingId:b.id}]}}});
 await db.attendanceRecord.create({data:{bookingId:b.id,occurrenceId,userId:u,status:'CHECKED_IN',markedById:buyer}});
 await db.emailMessage.create({data:{userId:u,to:'fixture@example.test',subject:'Reminder',template:'CLASS_REMINDER',status:'PROCESSING',dedupeKey:`class-reminder:${b.id}:${occurrenceId}`,payload:{}}});
 // Failure at the final audit write, after all preceding real SQL mutations.
 const original=db.$transaction.bind(db);
 const spy=vi.spyOn(db,'$transaction').mockImplementationOnce(((fn:any,options:any)=>original(async(tx:any)=>fn(new Proxy(tx,{get(target,key){return key==='auditLog'?{create:async()=>{throw Error('Injected final audit failure');}}:target[key];}})),options)) as any);
 try{await expect(cancelOccurrence()).rejects.toThrow('Injected final audit failure');}finally{spy.mockRestore();}
 expect(await db.classOccurrence.findUnique({where:{id:occurrenceId}})).toMatchObject({status:'SCHEDULED'});
 expect(await db.booking.findUnique({where:{id:b.id}})).toMatchObject({status:'CONFIRMED'});
 expect(await db.creditLedgerEntry.count({where:{creditAccountId:credit.id,type:'RELEASE'}})).toBe(0);
 expect(await db.attendanceRecord.findUnique({where:{bookingId:b.id}})).toMatchObject({status:'CHECKED_IN'});
 expect(await db.emailMessage.findUnique({where:{dedupeKey:`class-reminder:${b.id}:${occurrenceId}`}})).toMatchObject({status:'PROCESSING'});
 expect(await db.emailMessage.count({where:{dedupeKey:`class-cancelled-email:${occurrenceId}:${u}`}})).toBe(0);
 expect(await db.inAppNotification.count({where:{dedupeKey:`class-cancelled:${occurrenceId}:${u}`}})).toBe(0);
 await cancelOccurrence();expect(await used()).toBe(0);
 await db.classOccurrence.update({where:{id:occurrenceId},data:{status:'SCHEDULED'}});
});
it('routes the enabled pair request to a $40 two-seat checkout and projects both paid names',async()=>{
 await emptySeats();
 const originalBuyer=buyer;buyer=await user('Route Buyer');
 try{
  const {POST}=await import('@/app/api/checkout/event/route');
  const response=await POST(new Request('http://localhost/api/checkout/event',{method:'POST',body:JSON.stringify({slug,occurrenceId,ticketType:'PAIR',friend:{fullName:'Route New Friend',phone:'2015550177'},firstVisitDeclared:true})}));
  expect(response.status).toBe(200);
  const result=await response.json();
  const order=await db.commerceOrder.findUniqueOrThrow({where:{id:result.orderId}});
  expect(order.amountCents).toBe(4000);
  expect(await used()).toBe(2);
  const session=[...sessions.values()].find(s=>s.metadata.commerceOrderId===order.id)!;
  expect(session.amount_total).toBe(4000);
  await paid(session);
  expect((await blackFridayRoster(db,occurrenceId)).filter(x=>x.orderId===order.id).map(x=>x.name)).toEqual(['Route Buyer','Route New Friend']);
  await refund(session);
 }finally{buyer=originalBuyer;}
});

it('Fishers reserves and fulfills two seats independently of the Black Friday occurrence',async()=>{
 const fish='cmw026ajl0001jn09jsqpqzij';const fishSlug='get-fit-with-the-fishers-mw000b75';
 await db.classTemplate.create({data:{id:'fish-template',categoryId:'bf-category',name:'Fishers',slug:fishSlug,description:'Fixture',durationMinutes:60,defaultCapacity:2,isEvent:true,dropInPriceCents:2500,tags:[],equipment:[]}});
 await db.classOccurrence.create({data:{id:fish,templateId:'fish-template',startAt:new Date('2026-11-22T16:00:00Z'),endAt:new Date('2026-11-22T17:00:00Z'),capacity:2,priceCents:2500}});
 const u=await user('Fish Buyer');const input={userId:u,occurrenceId:fish,slug:fishSlug,origin:'http://localhost',ticketType:'PAIR' as const,friend:{fullName:'Fish Newfriend',phone:'2015550112'},firstVisitDeclared:true};
 const before=await used();const a=await startBlackFridayCheckout(db,stripe,input,now);
 expect((await db.commerceOrder.findUniqueOrThrow({where:{id:a.orderId}})).amountCents).toBe(4000);
 expect((await db.classOccurrence.findUniqueOrThrow({where:{id:fish}})).pendingTicketSeats).toBe(2);
 expect(await used()).toBe(before);
 const s=[...sessions.values()].find(s=>s.metadata.commerceOrderId===a.orderId);await paid(s);await paid(s);
 expect(await blackFridayRoster(db,fish)).toHaveLength(2);
 expect((await blackFridayRoster(db,fish)).map(x=>x.name)).toEqual(['Fish Buyer','Fish Newfriend']);
 expect((await db.classOccurrence.findUniqueOrThrow({where:{id:fish}})).pendingTicketSeats).toBe(1);
 const other=await user('Fish Other');await expect(db.booking.create({data:{occurrenceId:fish,userId:other}})).rejects.toThrow();
 await refund(s);expect((await db.classOccurrence.findUniqueOrThrow({where:{id:fish}})).pendingTicketSeats).toBe(0);
 expect(await used()).toBe(before);
});

async function vipFixture(name:string, kind='VIP', balance=1) {
 const u=await user(name);const w=vipMonthlyBenefitWindowForDate(now);const id=randomUUID();
 await db.product.create({data:{id,slug:id,name:kind,description:'Fixture',kind:kind as any,priceCents:20000,isUnlimited:true,eligibleCategoryIds:[]}});
 await db.purchase.create({data:{id,userId:u,productId:id,status:'PAID',amountCents:20000,paidAt:now}});
 const m=await db.membership.create({data:{userId:u,productId:id,purchaseId:id,status:'ACTIVE',currentPeriodStart:w.validFrom,currentPeriodEnd:w.validUntil}});
 await db.creditAccount.create({data:{userId:u,sourcePurchaseId:id,label:'Paid unlimited access',isUnlimited:true,validFrom:w.validFrom,validUntil:w.validUntil}});
 const credit=await db.creditAccount.create({data:{userId:u,label:w.eventCreditLabel,isUnlimited:false,validFrom:w.validFrom,validUntil:w.validUntil,entries:{create:{type:'GRANT',quantity:balance}}}});
 return {u,m,credit,w};
}
it('Fishers VIP pair reserves one benefit and $15 exactly once; independent event row remains unlocked',async()=>{
 const fish='cmw026ajl0001jn09jsqpqzij';const f=await vipFixture('Fish VIP Pair');
 let release!:()=>void;let locked!:()=>void;const lockReady=new Promise<void>(r=>locked=r);const gate=new Promise<void>(r=>release=r);
 const other=db.$transaction(async tx=>{await tx.$executeRaw`SELECT id FROM "ClassOccurrence" WHERE id=${occurrenceId} FOR UPDATE`;locked();await gate;},{timeout:15000});
 await lockReady;
 try {
  const input={userId:f.u,occurrenceId:fish,slug:'get-fit-with-the-fishers-mw000b75',origin:'http://localhost',ticketType:'PAIR' as const,friend:{fullName:'Fish VIP Newfriend',phone:'2015550113'},firstVisitDeclared:true,useEventCredit:true};
  const [a,b]=await Promise.all([startBlackFridayCheckout(db,stripe,input,now),startBlackFridayCheckout(db,stripe,input,now)]);
  expect(a.orderId).toBe(b.orderId);
  const session=[...sessions.values()].find(x=>x.metadata.commerceOrderId===a.orderId);
  expect(session.amount_total).toBe(1500);
  expect(await db.creditLedgerEntry.count({where:{creditAccountId:f.credit.id,type:'RESERVE'}})).toBe(1);
  await paid(session);await paid(session);
  expect(await blackFridayRoster(db,fish)).toHaveLength(2);
  await refund(session);await refund(session);
  expect((await db.creditLedgerEntry.aggregate({where:{creditAccountId:f.credit.id},_sum:{quantity:true}}))._sum.quantity).toBe(1);
 } finally {release();await other;}
});
it.each(['not-vip','empty','expired','cancelled'] as const)('rejects %s split credit before provider payment or seat reservation',async mode=>{
 const f=await vipFixture(`Denied ${mode}`,mode==='not-vip'?'LIMITED_MEMBERSHIP':'VIP',mode==='empty'?0:1);
 if(mode==='expired')await db.creditAccount.update({where:{id:f.credit.id},data:{validUntil:now}});
 if(mode==='cancelled')await db.membership.update({where:{id:f.m.id},data:{status:'CANCELLED'}});
 const calls=stripe.checkout.sessions.create.mock.calls.length;
 await expect(startBlackFridayCheckout(db,stripe,{userId:f.u,occurrenceId,slug,origin:'http://localhost',ticketType:'PAIR',friend:{fullName:`Denied Guest ${mode}`,phone:'2015550114'},firstVisitDeclared:true,useEventCredit:true},now)).rejects.toThrow('VIP event credit');
 expect(stripe.checkout.sessions.create.mock.calls.length).toBe(calls);
 expect(await db.commerceOrder.count({where:{userId:f.u}})).toBe(0);
 expect(await db.creditLedgerEntry.count({where:{creditAccountId:f.credit.id,type:'RESERVE'}})).toBe(0);
});
it('actual member booking accepts one VIP event credit and rejects ordinary membership access for these paid events',async()=>{
 const fish='cmw026ajl0001jn09jsqpqzij';const {bookOccurrenceAction}=await import('@/app/(portal)/member/bookings/actions');
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(now);
 try {
  const ordinary=await vipFixture('Ordinary membership','LIMITED_MEMBERSHIP');attendanceActor=ordinary.u;
  const form=new FormData();form.set('occurrenceId',fish);
  await expect(bookOccurrenceAction(form)).rejects.toThrow('result=access');
  expect(await db.booking.count({where:{userId:ordinary.u,occurrenceId:fish}})).toBe(0);
  const vip=await vipFixture('Single VIP benefit');attendanceActor=vip.u;
  await expect(bookOccurrenceAction(form)).rejects.toThrow('result=confirmed');
  expect(await db.booking.count({where:{userId:vip.u,occurrenceId:fish,status:'CONFIRMED'}})).toBe(1);
  expect(await db.creditLedgerEntry.count({where:{creditAccountId:vip.credit.id,type:'RESERVE',quantity:-1}})).toBe(1);
 } finally {attendanceActor=null;vi.useRealTimers();}
});

it('pair checkout waits for occurrence admission before taking the member entitlement lock',async()=>{
 await emptySeats();const u=await user('Admission lock buyer');
 const probeUrl=new URL(url!);probeUrl.searchParams.set('application_name','event-pair-lock-probe');
 const probe=new PrismaClient({datasources:{db:{url:probeUrl.toString()}}});
 let checkout:ReturnType<typeof startBlackFridayCheckout>|undefined;
 try {
  await db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${occurrenceId}))`;
   checkout=startBlackFridayCheckout(probe,stripe,{userId:u,occurrenceId,slug,origin:'http://localhost',ticketType:'PAIR',friend:{fullName:'Lock Fresh Guest',phone:'2015550116'},firstVisitDeclared:true},now);
   const until=Date.now()+2000;let waiting=false;
   while(Date.now()<until){
    const rows=await db.$queryRaw<{waiting:boolean}[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory' AND pid<>pg_backend_pid()) AS waiting`;
    if(rows[0].waiting){waiting=true;break;}await new Promise(r=>setTimeout(r,10));
   }
   expect(waiting).toBe(true);
   await tx.$executeRaw`SET LOCAL lock_timeout='500ms'`;
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'membership-entitlement:'+u},0))`;
   await tx.$executeRaw`SELECT id FROM "ClassOccurrence" WHERE id=${occurrenceId} FOR UPDATE`;
  },{timeout:5000});
  const result=await checkout!;const session=[...sessions.values()].find(s=>s.metadata.commerceOrderId===result.orderId);session.status='expired';await db.$transaction(tx=>applyBlackFridaySession(tx,session,now));
 } finally {await checkout?.catch(()=>{});await probe.$disconnect();}
});
