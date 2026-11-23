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
  const s = { id: `cs_${randomUUID()}`, url: 'https://checkout.stripe.test/session', mode: p.mode, client_reference_id: p.client_reference_id, metadata: p.metadata, currency: 'usd', amount_total: p.line_items[0].price_data.unit_amount, status: 'open', payment_status: 'unpaid', payment_intent: null };
  sessions.set(options.idempotencyKey, s); return s;
}), list: async () => ({data:[...sessions.values()],has_more:false}), retrieve: vi.fn(async (id: string) => [...sessions.values()].find(s => s.id === id)) } } };
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
 await db.classTemplate.create({ data: { id: 'cmvv992ko0001l809nmth9b44', categoryId: 'bf-category', name: 'Fixture', slug, description: 'Fixture', durationMinutes: 75, defaultCapacity: 2, tags: [], equipment: [], isEvent: true, dropInPriceCents: 2500 } });
 await db.classOccurrence.create({ data: { id: occurrenceId, templateId: 'cmvv992ko0001l809nmth9b44', startAt: new Date('2026-11-28T00:30:00Z'), endAt: new Date('2026-11-28T01:45:00Z'), capacity: 2, priceCents: 2500 } });
 buyer = await user('Buyer Person');
 await db.user.update({where:{id:buyer},data:{role:'OWNER',email:'vanessa@rhyzefit.com'}});
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
async function paid(s:any){s.payment_intent ??= `pi_${randomUUID()}`;s.status='complete';s.payment_status='paid';await db.$transaction(tx=>applyBlackFridaySession(tx,s,now));}
async function refund(s:any,disputeWon=false){await db.$transaction(tx=>reverseBlackFridayTicket(tx,{orderId:s.metadata.commerceOrderId,paymentIntentId:s.payment_intent,refundedAmountCents:s.amount_total,disputed:false,disputeWon},now));}
async function used(){return (await db.$queryRaw<{used:number}[]>`SELECT used FROM "BlackFridayCapacity" WHERE "occurrenceId"=${occurrenceId}`)[0].used;}

vi.mock('@/lib/auth/session',()=>({requireApprovedOwner:async()=>db.user.findUniqueOrThrow({where:{id:buyer}}),requireArea:async()=>db.user.findUniqueOrThrow({where:{id:attendanceActor ?? buyer}}),requireActiveUser:async()=>db.user.findUniqueOrThrow({where:{id:attendanceActor ?? buyer}})}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('next/navigation',()=>({redirect:(s:string)=>{throw Error('REDIRECT:'+s);}}));
vi.mock('@/lib/payments/attendance-fee',()=>({chargeAttendanceFee:vi.fn(async()=>({status:'FAILED'})),refundAttendanceFee:vi.fn()}));
vi.mock('@/auth',()=>({auth:async()=>({user:{id:buyer}})}));
vi.mock('@/lib/db/prisma',()=>({get prisma(){return db;}}));
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
 const session = [...sessions.values()][0]; session.payment_intent = `pi_${randomUUID()}`; session.status='complete'; session.payment_status='paid';
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
 await claimBlackFridayGuest(db,{orderId:a.orderId,userId:guest,actorId:buyer},now);
 expect(await db.waiverAcceptance.count({where:{userId:guest}})).toBe(0);
 const guestBooking=await db.booking.findUniqueOrThrow({where:{occurrenceId_userId:{occurrenceId,userId:guest}}});
 await expect(db.attendanceRecord.create({data:{bookingId:guestBooking.id,userId:guest,occurrenceId,status:'CHECKED_IN',checkedInAt:now,markedById:buyer}})).rejects.toThrow('waiver');
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
 const {u:freshBuyer,credit:freshAccount}=await vipFixture('Expired VIP purchaser');
 const fresh=await startBlackFridayCheckout(db,stripe,{...input,userId:freshBuyer},now);
 const expired=[...sessions.values()].find(s=>s.metadata.commerceOrderId===fresh.orderId);
 expired.status='expired';
 const {reconcileSpecialEventCheckout}=await import('@/lib/payments/special-event-reconciliation');
 for(let i=0;i<2;i++)expect(await reconcileSpecialEventCheckout({orderId:fresh.orderId},{db,stripe,now})).toBe('expired');
 expect(await used()).toBe(0);
 expect(await db.creditLedgerEntry.count({where:{creditAccountId:freshAccount.id,type:'RELEASE'}})).toBe(1);
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
 const charge={id:'ch_staff',payment_intent:a.session.payment_intent,amount:2500,currency:'usd',amount_refunded:0,disputed:false,paid:true,captured:true};
 const refunds:any[]=[];
 const provider:any={checkout:stripe.checkout,disputes:{list:()=>({async *[Symbol.asyncIterator](){yield {id:'dp_won',status:'won',payment_intent:a.session.payment_intent,amount:2500,currency:'usd'};}})},paymentIntents:{retrieve:async()=>({id:a.session.payment_intent,status:'succeeded',metadata:{commerceOrderId:a.orderId},amount:2500,currency:'usd',latest_charge:charge})},refunds:{create:vi.fn(async()=>{charge.amount_refunded=2500;const r={id:'re_staff',payment_intent:a.session.payment_intent,amount:2500,currency:'usd',status:'pending'};refunds.push(r);return r;}),list:()=>({async *[Symbol.asyncIterator](){yield* refunds;}})}};
 const captured=await db.paymentRecord.findFirstOrThrow({where:{commerceOrderId:a.orderId}});
 await db.paymentRecord.update({where:{id:captured.id},data:{status:'FAILED'}});
 await expect(manageBlackFridayTicket(db,provider,{actorId:buyer,orderId:a.orderId,operation:'CANCEL',expectedRefundCents:2500,reason:'Missing ledger proof'},now)).rejects.toThrow('captured payment record');
 expect(await db.$queryRaw`SELECT "orderId" FROM "EventRefundApproval" WHERE "orderId"=${a.orderId}`).toHaveLength(0);
 await db.paymentRecord.update({where:{id:captured.id},data:{status:'SUCCEEDED'}});
 await expect(manageBlackFridayTicket(db,provider,{actorId:buyer,orderId:a.orderId,operation:'CANCEL',expectedRefundCents:2500,reason:'Fixture cancellation'},now)).rejects.toThrow('pending');
 expect(await used()).toBe(1);
 expect(await db.$queryRaw`SELECT "amountCents","actorId" FROM "EventRefundApproval" WHERE "orderId"=${a.orderId}`).toEqual([{amountCents:2500,actorId:buyer}]);
 await expect(manageBlackFridayTicket(db,provider,{actorId:buyer,orderId:a.orderId,operation:'CANCEL',expectedRefundCents:2500,reason:'Duplicate approval'},now)).rejects.toThrow('pending');
 expect(provider.refunds.create).toHaveBeenCalledTimes(1);
 refunds[0].status='succeeded';
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
 await expect(manageBlackFridayTicket(db,provider,{actorId:buyer,orderId:a.orderId,operation:'CANCEL',expectedRefundCents:2500,reason:'Fixture mismatch',sessionId:a.session.id},now)).rejects.toThrow('identity');
 expect(expire).not.toHaveBeenCalled();a.session.status='expired';await manageBlackFridayTicket(db,stripe,{actorId:buyer,orderId:a.orderId,operation:'RECONCILE',reason:'Verified correct session'},now);
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
 }finally{await refund(a.session,true);}
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
 await refund(a.session,true);
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
 await refund(a.session,true);
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
 expect(await used()).toBe(1);await refund(a.session,true);
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
 await db.classTemplate.create({data:{id:'cmw000b760001la097ii57bjb',categoryId:'bf-category',name:'Fishers',slug:fishSlug,description:'Fixture',durationMinutes:60,defaultCapacity:2,isEvent:true,dropInPriceCents:2500,tags:[],equipment:[]}});
 await db.classOccurrence.create({data:{id:fish,templateId:'cmw000b760001la097ii57bjb',startAt:new Date('2026-11-22T16:00:00Z'),endAt:new Date('2026-11-22T17:00:00Z'),capacity:2,priceCents:2500}});
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

it.each([1000,2500])('does not erase an open dispute when a later %s-cent refund arrives',async amount=>{
 await emptySeats();const a=await single('Disputed refund ordering');await paid(a.session);
 await db.$transaction(tx=>reverseBlackFridayTicket(tx,{orderId:a.orderId,paymentIntentId:a.session.payment_intent,refundedAmountCents:0,disputed:true},now));
 const {applyBlackFridayRefunds}=await import('@/lib/payments/black-friday-checkout');
 await db.$transaction(tx=>applyBlackFridayRefunds(tx,a.orderId,a.session.payment_intent,[{id:`re_ordered_${amount}`,payment_intent:a.session.payment_intent,amount,currency:'usd',status:'succeeded'}] as any,now));
 expect(await db.commerceOrder.findUniqueOrThrow({where:{id:a.orderId}})).toMatchObject({status:'DISPUTED',refundedAmountCents:amount});
 expect(await used()).toBe(1);
 await db.$transaction(tx=>reverseBlackFridayTicket(tx,{orderId:a.orderId,paymentIntentId:a.session.payment_intent,refundedAmountCents:amount,disputed:true,disputeLost:true},now));
 expect(await used()).toBe(0);
});
it('rejects other owners before an event refund reaches Stripe',async()=>{
 const outsider=await user('Other Owner');await db.user.update({where:{id:outsider},data:{role:'OWNER'}});
 const provider:any={checkout:{sessions:{retrieve:vi.fn()}}};
 await expect(manageBlackFridayTicket(db,provider,{actorId:outsider,orderId:'unknown',operation:'CANCEL',expectedRefundCents:2500,reason:'Denied owner request'},now)).rejects.toThrow('Vanessa or Melissa');
 expect(provider.checkout.sessions.retrieve).not.toHaveBeenCalled();
});

it('keeps a hold for an expired callback with an unresolved intent and audits confirmed unpaid expiry once', async () => {
 await emptySeats();
 const {session,orderId}=await single('Terminal evidence');
 const expired={...session,status:'expired',payment_intent:'pi_unresolved'};
 await db.$transaction(tx=>applyBlackFridaySession(tx,expired,now));
 expect(await used()).toBe(1);
 for(const change of [{mode:'setup'},{amount_total:1},{currency:'cad'},{id:'cs_wrong'},{client_reference_id:'wrong'},{metadata:{...session.metadata,userId:'other'}}]){
  await expect(db.$transaction(tx=>applyBlackFridaySession(tx,{...expired,payment_intent:null,...change},now))).rejects.toThrow();
  expect(await used()).toBe(1);
 }
 for(let i=0;i<2;i++)await db.$transaction(tx=>applyBlackFridaySession(tx,{...expired,payment_intent:null},now));
 expect(await used()).toBe(0);
 expect(await db.auditLog.count({where:{action:'black-friday.expired',entityId:orderId}})).toBe(1);
});
it('keeps open buyer returns and other buyers’ explicit cancellations from closing checkout', async () => {
 const {reconcileSpecialEventCheckout}=await import('@/lib/payments/special-event-reconciliation');
 await emptySeats();
 const {session,orderId,input}=await single('Return purchaser');
 const expire=vi.fn(async()=>{session.status='expired';return session;});
 const provider={...stripe,checkout:{sessions:{...stripe.checkout.sessions,expire}}};
 const deps={db,stripe:provider,now};
 expect(await reconcileSpecialEventCheckout({orderId,actorUserId:input.userId},deps)).toBe('pending');
 expect(await reconcileSpecialEventCheckout({orderId,actorUserId:buyer,explicitBuyerCancel:true},deps)).toBe('review');
 expect(await reconcileSpecialEventCheckout({orderId,explicitBuyerCancel:true},deps)).toBe('review');
 expect(expire).not.toHaveBeenCalled();
 expect(await reconcileSpecialEventCheckout({orderId,actorUserId:input.userId,explicitBuyerCancel:true},deps)).toBe('expired');
 expect(await used()).toBe(0);
});
it('keeps captured or processing intents held and releases only a verified canceled unpaid intent',async()=>{
 const {reconcileSpecialEventCheckout}=await import('@/lib/payments/special-event-reconciliation');
 await emptySeats();const {session,orderId}=await single('Intent purchaser');
 session.status='expired';
 const pi={id:'pi_test',metadata:session.metadata,amount:2500,currency:'usd',amount_received:0,amount_capturable:0,latest_charge:null,status:'processing'};
 session.payment_intent=pi;
 expect(await reconcileSpecialEventCheckout({orderId},{db,stripe,now})).toBe('review');
 Object.assign(pi,{status:'succeeded',amount_received:2500});
 expect(await reconcileSpecialEventCheckout({orderId},{db,stripe,now})).toBe('review');
 expect(await used()).toBe(1);
 Object.assign(pi,{status:'canceled',amount_received:0});
 expect(await reconcileSpecialEventCheckout({orderId},{db,stripe,now})).toBe('expired');
 expect(await used()).toBe(0);
 Object.assign(pi,{status:'succeeded',amount_received:2500});
 expect(await reconcileSpecialEventCheckout({orderId},{db,stripe,now})).toBe('review');
});
it('backs off unavailable old sessions so subsequent batches reach a newer unpaid expiry',async()=>{
 const {reconcileDueSpecialEventCheckouts}=await import('@/lib/payments/special-event-reconciliation');
 await emptySeats();const old=await single('Unavailable checkout');const next=await single('Available checkout');
 await db.$executeRaw`UPDATE "BlackFridayTicket" SET "expiresAt"=${now.toISOString()}::timestamp WHERE "orderId"=${old.orderId}`;
 next.session.status='expired';
 const provider={checkout:{sessions:{retrieve:async(id:string)=>{if(id===old.session.id)throw Error('unavailable');return next.session;}}}} as any;
 const due=new Date(now.getTime()+32*60000);
 await reconcileDueSpecialEventCheckouts({limit:1,now:due},{db,stripe:provider});
 expect(await used()).toBe(2);
 await reconcileDueSpecialEventCheckouts({limit:1,now:due},{db,stripe:provider});
 expect(await used()).toBe(1);
 expect(await db.commerceOrder.findUniqueOrThrow({where:{id:next.orderId}})).toMatchObject({status:'PAYMENT_FAILED'});
 old.session.status='expired';await db.$transaction(tx=>applyBlackFridaySession(tx,old.session,now));
});

it('keeps the hold when the provider expire response disagrees with fresh retrieval',async()=>{
 const {reconcileSpecialEventCheckout}=await import('@/lib/payments/special-event-reconciliation');
 await emptySeats();const {session,orderId,input}=await single('Racing return');
 const provider={...stripe,checkout:{sessions:{...stripe.checkout.sessions,expire:async()=>({...session,status:'expired'})}}};
 expect(await reconcileSpecialEventCheckout({orderId,actorUserId:input.userId,explicitBuyerCancel:true},{db,stripe:provider,now})).toBe('pending');
 expect(await used()).toBe(1);
 const [ticket]=await db.$queryRaw<{parameters:{success_url:string;cancel_url:string}}[]>`SELECT parameters FROM "BlackFridayTicket" WHERE "orderId"=${orderId}`;
 expect(ticket.parameters.success_url).toBe('http://localhost/checkout/event-return?order='+orderId);
 expect(ticket.parameters.cancel_url).toBe(ticket.parameters.success_url);
 session.status='expired';
 await db.$transaction(tx=>applyBlackFridaySession(tx,session,now));
});

it('requires clean captured provider evidence before background fulfillment of a paid session',async()=>{
 const {reconcileSpecialEventCheckout}=await import('@/lib/payments/special-event-reconciliation');
 await emptySeats();const {session,orderId}=await single('Captured evidence');
 const charge={amount:2500,id:'ch_clean',payment_intent:'pi_clean',currency:'usd',livemode:false,amount_captured:2500,amount_refunded:100,paid:true,captured:true,disputed:false};
 const intent={id:'pi_clean',amount:2500,currency:'usd',livemode:false,metadata:session.metadata,amount_received:2500,status:'succeeded',latest_charge:charge};
 Object.assign(session,{status:'complete',payment_status:'paid',livemode:false,payment_intent:intent});
 expect(await reconcileSpecialEventCheckout({orderId},{db,stripe,now})).toBe('review');
 expect(await db.booking.count({where:{userId:session.metadata.userId,occurrenceId}})).toBe(0);
 await db.$transaction(tx=>applyBlackFridaySession(tx,session,now));
 expect(await db.booking.count({where:{userId:session.metadata.userId,occurrenceId}})).toBe(0);
 Object.assign(charge,{amount_refunded:0});
 expect(await reconcileSpecialEventCheckout({orderId},{db,stripe,now})).toBe('paid');
 expect(await db.booking.count({where:{userId:session.metadata.userId,occurrenceId}})).toBe(1);
 await db.$transaction(tx=>reverseBlackFridayTicket(tx,{orderId,paymentIntentId:intent.id,refundedAmountCents:2500,disputed:false},now));
});

it('staff recovers a missed paid callback only after proving the complete provider refund without attendance',async()=>{
 const {reconcileSpecialEventCheckout}=await import('@/lib/payments/special-event-reconciliation');
 await emptySeats();const {u,credit}=await vipFixture('Missed refund buyer');
 const {orderId}=await startBlackFridayCheckout(db,stripe,{userId:u,occurrenceId,slug,origin:'http://localhost',ticketType:'PAIR',firstVisitDeclared:true,friend:{fullName:'Refund Fresh Friend',phone:'2015550169'},useEventCredit:true},now);
 const session=[...sessions.values()].find(s=>s.metadata.commerceOrderId===orderId);
 const intentId='pi_missed_refund',chargeId='ch_missed_refund';
 const charge={id:chargeId,created:Math.floor(now.getTime()/1000),payment_intent:intentId,livemode:false,paid:true,captured:true,disputed:false,currency:'usd',amount:1500,amount_captured:1500,amount_refunded:300};
 const intent={id:intentId,metadata:session.metadata,livemode:false,status:'succeeded',amount:1500,amount_received:1500,currency:'usd',latest_charge:charge};
 Object.assign(session,{status:'complete',payment_status:'paid',livemode:false,payment_intent:intent});
 const receipt={id:'re_missed',charge:chargeId,payment_intent:intentId,currency:'usd',status:'succeeded',amount:1500};
 const list=vi.fn(async()=>({data:[receipt],has_more:false}));
 const provider={...stripe,refunds:{list,create:vi.fn(()=>{throw Error('unexpected refund');})}};
 const staff={actorId:buyer,orderId,operation:'RECONCILE' as const,reason:'Recovered full refund'};
 expect(await reconcileSpecialEventCheckout({orderId},{db,stripe:provider,now})).toBe('review');
 await expect(manageBlackFridayTicket(db,provider,staff,now)).rejects.toThrow();
 Object.assign(charge,{amount_refunded:1500,refunded:true,disputed:true});
 await expect(manageBlackFridayTicket(db,provider,staff,now)).rejects.toThrow();
 Object.assign(charge,{disputed:false});
 expect(await reconcileSpecialEventCheckout({orderId},{db,stripe:provider,now})).toBe('review');
 await expect(manageBlackFridayTicket(db,provider,{...staff,actorId:u},now)).rejects.toThrow('authorization');
 for(const unsafe of [{...receipt,charge:'ch_other'},{...receipt,status:'pending'},{...receipt,amount:1499}]){
  list.mockResolvedValueOnce({data:[unsafe],has_more:false});
  await expect(manageBlackFridayTicket(db,provider,staff,now)).rejects.toThrow();
  expect(await used()).toBe(2);
 }
 await manageBlackFridayTicket(db,provider,staff,now);
 await manageBlackFridayTicket(db,provider,staff,now);
 expect(await used()).toBe(0);
 expect(await db.commerceOrder.findUniqueOrThrow({where:{id:orderId}})).toMatchObject({status:'REFUNDED',stripePaymentIntentId:intentId,refundedAmountCents:1500});
 expect(await db.commerceRefund.findUniqueOrThrow({where:{stripeRefundId:receipt.id}})).toMatchObject({commerceOrderId:orderId,status:'SUCCEEDED',amountCents:1500});
 expect(await db.paymentRecord.findFirstOrThrow({where:{commerceOrderId:orderId}})).toMatchObject({status:'REFUNDED',stripePaymentIntentId:intentId});
 expect(await db.booking.count({where:{occurrenceId,userId:u}})).toBe(0);
 expect(await db.auditLog.count({where:{entityId:orderId,action:'black-friday.paid'}})).toBe(0);
 expect(await db.creditLedgerEntry.count({where:{creditAccountId:credit.id,type:'RELEASE'}})).toBe(1);
 expect(provider.refunds.create).not.toHaveBeenCalled();
});
it('withholds payment links and expiry for local payment conflicts and audits verified staff cancellation once',async()=>{
 const {readSpecialEventCheckout}=await import('@/lib/payments/special-event-reconciliation');
 await emptySeats();const {session,orderId,input}=await single('Local payment conflict');
 const expire=vi.fn(async()=>{session.status='expired';return session;});
 const provider={...stripe,checkout:{sessions:{...stripe.checkout.sessions,expire}}};
 const staff={actorId:buyer,orderId,operation:'CANCEL' as const,reason:'Shopper requested release'};
 const args={orderId,actorUserId:input.userId};const deps={db,stripe:provider,now};
 async function rejectsConflict(){
  expect(await readSpecialEventCheckout(args,deps)).toEqual({outcome:'review'});
  expect(await readSpecialEventCheckout({...args,explicitBuyerCancel:true},deps)).toEqual({outcome:'review'});
  await expect(manageBlackFridayTicket(db,provider,staff,now)).rejects.toThrow();
  expect(expire).not.toHaveBeenCalled();
 }
 await db.commerceOrder.update({where:{id:orderId},data:{paidAt:now}});await rejectsConflict();
 await db.commerceOrder.update({where:{id:orderId},data:{paidAt:null,status:'REFUNDED'}});await rejectsConflict();
 await db.commerceOrder.update({where:{id:orderId},data:{status:'PENDING'}});
 const record=await db.paymentRecord.create({data:{kind:'EVENT',status:'SUCCEEDED',amountCents:2500,currency:'usd',occurredAt:now,stripeCheckoutSessionId:session.id,stripeEventId:'evt_conflict'}});
 await rejectsConflict();await db.paymentRecord.delete({where:{id:record.id}});
 await manageBlackFridayTicket(db,provider,staff,now);await manageBlackFridayTicket(db,provider,{...staff,reason:'Second request'},now);
 const audits=await db.auditLog.findMany({where:{entityId:orderId,action:'black-friday.expired'}});
 expect(audits).toHaveLength(1);expect(audits[0]).toMatchObject({actorId:buyer,after:{reason:staff.reason}});
 expect(await used()).toBe(0);
});

it('finishes a protected six-checkout batch under the 25-second caller deadline with an occurrence lock and two contact writes',async()=>{
 const {POST}=await import('@/app/api/jobs/stripe-sync/route');
 const scheduled=(await import('@/netlify/functions/stripe-sync')).default;
 const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
 await emptySeats();await db.classOccurrence.update({where:{id:occurrenceId},data:{capacity:6}});
 const checkouts:Awaited<ReturnType<typeof single>>[]=[];
 for(let n=0;n<6;n++)checkouts.push(await single('Timed checkout '+n));
 const ids=checkouts.map(c=>c.orderId);
 await db.commerceOrder.updateMany({where:{id:{in:ids}},data:{stripeCheckoutSessionId:null}});
 for(const c of checkouts)c.session.status='expired';
 for(const c of checkouts.slice(0,2)){
  await db.user.update({where:{id:c.input.userId},data:{stripeCustomerId:'cus_'+c.input.userId}});
  await db.accountContactSync.create({data:{userId:c.input.userId,nextAttemptAt:now}});
 }
 const updates=vi.fn(async()=>{await delay(1300);});
 Object.assign(stripe,{accounts:{retrieve:async()=>({id:'acct_fixture'})},charges:{list:async()=>({data:[],has_more:false})},customers:{update:updates}});
 const savedList=stripe.checkout.sessions.list;
 const savedRetrieve=stripe.checkout.sessions.retrieve;
 let retrieving!:()=>void;const retrievingNow=new Promise<void>(resolve=>retrieving=resolve);
 let locked!:()=>void;const isLocked=new Promise<void>(resolve=>locked=resolve);
 let unlock!:()=>void;const gate=new Promise<void>(resolve=>unlock=resolve);
 const lock=db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT id FROM "ClassOccurrence" WHERE id=${occurrenceId} FOR UPDATE`;
   locked();await gate;
 },{timeout:22000});
 await isLocked;
 let pages=0;
 stripe.checkout.sessions.list=async(p:{starting_after?:string})=>{
  pages++;await delay(1600);
  if(p.starting_after==='cs_page2')return {data:checkouts.map(c=>c.session),has_more:false};
  return {data:[{id:p.starting_after?'cs_page2':'cs_page1',metadata:{},client_reference_id:null}],has_more:true};
 };
 stripe.checkout.sessions.retrieve=async(id:string)=>{retrieving();await delay(1600);return savedRetrieve(id);};
 vi.stubEnv('JOB_SECRET','private-synthetic-job');vi.stubEnv('URL','http://localhost');
 let signal:AbortSignal|null=null;
 vi.stubGlobal('fetch',async(url:string,options:RequestInit)=>{signal=options.signal??null;return POST(new Request(url,options));});
 const started=performance.now();
 // The externally held occurrence lock remains in place after the provider
 // reads finish, forcing all six terminal writes to compete on the same row.
 void retrievingNow.then(async()=>{await delay(2600);unlock();});
 try {
  const res=await scheduled();const body=await res.json();
  const elapsed=Math.round(performance.now()-started);
  console.log('Isolated protected stripe-sync elapsed milliseconds',elapsed);
  expect(elapsed).toBeLessThan(25000);
  expect((signal as AbortSignal|null)?.aborted).toBe(false);
  expect(pages).toBe(18);
  expect(body.stripe).toMatchObject({attempted:true,eventCheckouts:{expired:6,review:0},contactSync:{succeeded:2,failed:0}});
  expect(updates).toHaveBeenCalledTimes(2);
  expect(await used()).toBe(0);
 }finally{
  unlock();await lock;
  stripe.checkout.sessions.retrieve=savedRetrieve;stripe.checkout.sessions.list=savedList;
  delete stripe.accounts;delete stripe.charges;delete stripe.customers;
  vi.unstubAllGlobals();
 }
},30000);

it('retains staff cancellation attribution when the first provider read already proves expiry',async()=>{
 await emptySeats();const {session,orderId}=await single('Staff audit purchaser');
 session.status='expired';
 await manageBlackFridayTicket(db,stripe,{actorId:buyer,orderId,operation:'RECONCILE',reason:'Assisted customer by phone'},now);
 expect(await db.auditLog.findFirstOrThrow({where:{entityId:orderId,action:'black-friday.expired'}})).toMatchObject({actorId:buyer,after:{reason:'Assisted customer by phone'}});
});
it('requires hosted live-mode proof again after buyer expiry before releasing a hold',async()=>{
 const {reconcileSpecialEventCheckout}=await import('@/lib/payments/special-event-reconciliation');
 await emptySeats();const {session,orderId,input}=await single('Hosted return mode');
 const retrieve=vi.fn().mockResolvedValueOnce({...session,livemode:true}).mockResolvedValueOnce({...session,status:'expired',livemode:false});
 const provider={...stripe,checkout:{sessions:{...stripe.checkout.sessions,retrieve,expire:vi.fn(async()=>({...session,status:'expired',livemode:true}))}}};
 vi.stubEnv('NETLIFY','true');
 try{
   expect(await reconcileSpecialEventCheckout({orderId,actorUserId:input.userId,explicitBuyerCancel:true},{db,stripe:provider,now})).toBe('review');
   expect(provider.checkout.sessions.expire).toHaveBeenCalledTimes(1);
   expect(await used()).toBe(1);
 }finally{vi.stubEnv('NETLIFY','false');}
 session.status='expired';await db.$transaction(tx=>applyBlackFridaySession(tx,session,now));
});

it('preserves the approving staff identity when the expiry webhook wins the terminal transition',async()=>{
 await emptySeats();const {session,orderId}=await single('Webhook race buyer');
 const retrieve=async()=>{
  if(session.status==='expired')await db.$transaction(tx=>applyBlackFridaySession(tx,session,now));
  return session;
 };
 const provider={...stripe,checkout:{sessions:{...stripe.checkout.sessions,retrieve,expire:async()=>{session.status='expired';return session;}}}};
 await manageBlackFridayTicket(db,provider,{actorId:buyer,orderId,operation:'CANCEL',reason:'Canceled by front desk'},now);
 const audits=await db.auditLog.findMany({where:{action:'black-friday.expired',entityId:orderId}});
 expect(audits).toHaveLength(1);
 expect(audits[0]).toMatchObject({actorId:buyer,after:{reason:'Canceled by front desk'}});
});

async function withSyncCharge<T>(charge:any,session:any,receipts:any[],work:()=>Promise<T>){
 const saved=stripe.checkout.sessions.list;
 stripe.checkout.sessions.list=async(params:any)=>({data:params.payment_intent===charge.payment_intent?[session]:[],has_more:false});
 Object.assign(stripe,{accounts:{retrieve:async()=>({id:'acct_round_two'})},charges:{list:async()=>({data:[charge],has_more:false})},refunds:{list:async()=>({data:receipts,has_more:false}),create:()=>{throw Error('Unexpected refund submission');}}});
 try{return await work();}finally{stripe.checkout.sessions.list=saved;delete stripe.accounts;delete stripe.charges;delete stripe.refunds;}
}

it('recovers one original sync-first refunded payment, then reconciles both replays without creating a booking',async()=>{
 await emptySeats();const {orderId,session,input}=await single('First writer is sync');
 const pi='pi_sync_first_refund',ch='ch_sync_first_refund';
 const charge={id:ch,payment_intent:pi,livemode:false,status:'succeeded',paid:true,captured:true,refunded:true,disputed:false,currency:'usd',amount:2500,amount_captured:2500,amount_refunded:2500,created:Math.floor(now.getTime()/1000),metadata:{userId:input.userId}};
 const intent={id:pi,status:'succeeded',livemode:false,amount:2500,amount_received:2500,currency:'usd',metadata:session.metadata,latest_charge:charge};
 const refund={id:'re_sync_first',status:'succeeded',payment_intent:pi,charge:ch,currency:'usd',amount:2500,created:charge.created+30};
 Object.assign(session,{status:'complete',payment_status:'paid',livemode:false,payment_intent:intent});
 const {syncRecentStripePaymentRecords}=await import('@/lib/payments/stripe-payment-sync');
 await withSyncCharge(charge,session,[refund],async()=>{
  await syncRecentStripePaymentRecords(db);
  const original=await db.paymentRecord.findUniqueOrThrow({where:{stripePaymentIntentId:pi}});
  expect(original).toMatchObject({kind:'PRODUCT_PURCHASE',commerceOrderId:null,stripeCheckoutSessionId:session.id,stripeEventId:'stripe-sync-charge-'+ch,status:'REFUNDED',userId:input.userId});
  const staff={actorId:buyer,orderId,operation:'RECONCILE' as const,reason:'Reconcile original charge receipt'};
  await db.paymentRecord.update({where:{id:original.id},data:{stripeEventId:'unrelated-'+ch}});
  await expect(manageBlackFridayTicket(db,stripe,staff,now)).rejects.toThrow();
  await db.paymentRecord.update({where:{id:original.id},data:{stripeEventId:original.stripeEventId}});
  const sourceId='rhyze-payment-reconciled-acct_round_two-'+ch;
  const source=await db.stripeEvent.findUniqueOrThrow({where:{id:sourceId}});
  await db.stripeEvent.update({where:{id:sourceId},data:{payload:{other:'receipt'}}});
  await expect(manageBlackFridayTicket(db,stripe,staff,now)).rejects.toThrow('receipt');
  await db.stripeEvent.update({where:{id:sourceId},data:{payload:source.payload as any}});
  await manageBlackFridayTicket(db,stripe,staff,now);
  expect(await db.stripeEvent.findUniqueOrThrow({where:{id:sourceId}})).toEqual(source);
  await syncRecentStripePaymentRecords(db);await manageBlackFridayTicket(db,stripe,staff,now);
  expect(await db.paymentRecord.findMany({where:{stripePaymentIntentId:pi}})).toMatchObject([{id:original.id,stripeEventId:original.stripeEventId,commerceOrderId:orderId,kind:'EVENT',status:'REFUNDED',refundedAmountCents:2500}]);
  expect(await db.stripeEvent.count({where:{id:'rhyze-payment-reconciled-acct_round_two-'+ch}})).toBe(1);
  expect(await db.booking.count({where:{userId:input.userId,occurrenceId}})).toBe(0);
  expect(await db.commerceRefund.count({where:{commerceOrderId:orderId}})).toBe(1);
  expect(await used()).toBe(0);
 });
});

it.each([['insert','expire'],['update','release']] as const)('waits for a nullable-order sync %s before the final %s decision',async(writer,operation)=>{
 await emptySeats();const {orderId,session,input}=await single('Ledger lock '+writer);
 const pi='pi_lock_'+writer,ch='ch_lock_'+writer;
 const charge={id:ch,payment_intent:pi,metadata:{userId:input.userId},livemode:false,status:'succeeded',paid:true,captured:true,amount:2500,amount_captured:2500,amount_refunded:0,currency:'usd',created:Math.floor(now.getTime()/1000)};
 const paidSource={...session,status:'complete',payment_status:'paid',payment_intent:pi};
 if(writer==='update')await db.paymentRecord.create({data:{kind:'EVENT',status:'FAILED',userId:input.userId,amountCents:2500,stripeEventId:'stripe-sync-charge-'+ch,stripeCheckoutSessionId:session.id,stripePaymentIntentId:pi,occurredAt:now}});
 let hold!:()=>void;const gate=new Promise<void>(r=>hold=r);
 let started!:()=>void;const wrote=new Promise<void>(r=>started=r);
 const synchronized=db.$extends({query:{paymentRecord:{$allOperations:async({operation:op,args,query})=>{
  const result=await query(args);if(op===(writer==='insert'?'create':'update')){started();await gate;}return result;
 }}}});
 const {syncRecentStripePaymentRecords}=await import('@/lib/payments/stripe-payment-sync');
 const {reconcileSpecialEventCheckout}=await import('@/lib/payments/special-event-reconciliation');
 await withSyncCharge(charge,paidSource,[],async()=>{
  const writing=syncRecentStripePaymentRecords(synchronized as unknown as PrismaClient,{financialOnly:true});
  try{
   await Promise.race([wrote,writing.then(()=>{throw Error('Expected pending writer');})]);
   if(operation==='release')session.status='expired';
   const expire=vi.fn(async()=>{session.status='expired';return session;});
   const provider={...stripe,checkout:{sessions:{...stripe.checkout.sessions,expire}}};
   const checking=reconcileSpecialEventCheckout({orderId,actorUserId:input.userId,explicitBuyerCancel:operation==='expire'},{db,stripe:provider,now});
   const early=await Promise.race([checking.then(()=>true),new Promise<false>(r=>setTimeout(()=>r(false),70))]);
   hold();await writing;const outcome=await checking;
   expect(early).toBe(false);expect(outcome).toBe('review');expect(expire).not.toHaveBeenCalled();
   expect(await used()).toBe(1);
  }finally{hold();await writing;}
 });
 // Fixture-only cleanup leaves subsequent cases independent.
 await db.paymentRecord.delete({where:{stripePaymentIntentId:pi}});
 session.status='expired';await db.$transaction(tx=>applyBlackFridaySession(tx,session,now));
});

it.each(['lost-response','commit-ambiguity'])('retains the staff instruction after provider expiry and %s',async failure=>{
 await emptySeats();const {orderId,session}=await single('Lost expiry receipt');
 const provider={...stripe,checkout:{sessions:{...stripe.checkout.sessions,expire:async()=>{
   const instruction=await db.auditLog.findFirstOrThrow({where:{entityId:orderId,action:'black-friday.expiry-requested'}});
   expect(instruction).toMatchObject({actorId:buyer,after:{stripeCheckoutSessionId:session.id}});
   session.status='expired';if(failure==='lost-response')throw Error('lost response');return session;}}}};
 const reason='Shopper called to abandon checkout';
 const ambiguous=db.$extends({query:{auditLog:{create:async({args,query})=>{
  const row=await query(args);if(failure==='commit-ambiguity' && args.data.action==='black-friday.provider-expiry-accepted')throw Error('Rollback after provider call');
  return row;
 }}}});
 await expect(manageBlackFridayTicket(ambiguous as unknown as PrismaClient,provider,{actorId:buyer,orderId,operation:'CANCEL',reason},now)).rejects.toThrow();
 expect(await used()).toBe(1);
 expect(await db.auditLog.count({where:{entityId:orderId,action:'black-friday.provider-expiry-accepted'}})).toBe(0);
 await db.$transaction(tx=>applyBlackFridaySession(tx,session,now));
 const settled=await db.auditLog.findFirstOrThrow({where:{entityId:orderId,action:'black-friday.expired'}});
 expect(settled).toMatchObject({actorId:buyer,after:{reason,providerAcceptanceObserved:false,staffInstructionId:expect.any(String)}});
 expect(await db.auditLog.findFirstOrThrow({where:{entityId:orderId,action:'black-friday.expiry-requested'}})).toMatchObject({actorId:buyer,after:{reason,stripeCheckoutSessionId:session.id}});
 expect(await used()).toBe(0);
});

it('refuses release from a serializable snapshot that predates the session-only collected writer',async()=>{
 await emptySeats();const {session,orderId,input}=await single('Stale checkout ledger');
 const pi='pi_stale_checkout',ch='ch_stale_checkout';
 const charge={id:ch,payment_intent:pi,metadata:{userId:input.userId},livemode:false,status:'succeeded',paid:true,captured:true,amount:2500,amount_captured:2500,amount_refunded:0,currency:'usd',created:Math.floor(now.getTime()/1000)};
 let started!:()=>void;const observed=new Promise<void>(r=>started=r);
 let resume!:()=>void;const gate=new Promise<void>(r=>resume=r);
 const old=db.$transaction(async tx=>{
  await tx.commerceOrder.findUniqueOrThrow({where:{id:orderId}});started();await gate;
  return applyBlackFridaySession(tx,{...session,status:'expired'},now);
 },{isolationLevel:'Serializable'});
 const result=Promise.allSettled([old]);await observed;
 const {syncRecentStripePaymentRecords}=await import('@/lib/payments/stripe-payment-sync');
 try{
  await withSyncCharge(charge,{...session,status:'complete',payment_status:'paid',payment_intent:pi},[],()=>syncRecentStripePaymentRecords(db,{financialOnly:true}));
 }finally{resume();}
 const [stale]=await result;
 expect(stale.status).toBe('rejected');
 if(stale.status==='rejected')expect(String(stale.reason)).toMatch(/40001|serialize|write conflict/i);
 expect(await used()).toBe(1);
 await db.paymentRecord.delete({where:{stripePaymentIntentId:pi}});
 await db.$transaction(tx=>applyBlackFridaySession(tx,{...session,status:'expired'},now));
});

it('keeps an incoming sync payment writer outside an in-flight provider expiry and rechecks the ledger before release',async()=>{
 await emptySeats();const {session,orderId,input}=await single('Provider expiry already running');
 const pi='pi_provider_expiring',ch='ch_provider_expiring';
 const charge={id:ch,payment_intent:pi,metadata:{userId:input.userId},livemode:false,status:'succeeded',paid:true,captured:true,amount:2500,amount_captured:2500,amount_refunded:0,currency:'usd',created:Math.floor(now.getTime()/1000)};
 const paidSource={...session,status:'complete',payment_status:'paid',payment_intent:pi};
 const {syncRecentStripePaymentRecords}=await import('@/lib/payments/stripe-payment-sync');
 const {reconcileSpecialEventCheckout}=await import('@/lib/payments/special-event-reconciliation');
 let entering!:()=>void;const inProvider=new Promise<void>(r=>entering=r);
 let resume!:()=>void;const gate=new Promise<void>(r=>resume=r);
 let atWrite!:()=>void;const attemptedWrite=new Promise<void>(r=>atWrite=r);
 const writer=db.$extends({query:{paymentRecord:{create:async({query,args})=>{atWrite();return query(args);}}}});
 await withSyncCharge(charge,paidSource,[],async()=>{
  let writing:Promise<unknown>=Promise.resolve();
  const provider={...stripe,checkout:{sessions:{...stripe.checkout.sessions,
    expire:async()=>{entering();await gate;session.status='expired';return session;},
    retrieve:async()=>{if(session.status==='expired')await writing;return session;},
  }}};
  const checking=reconcileSpecialEventCheckout({orderId,actorUserId:input.userId,explicitBuyerCancel:true},{db,stripe:provider,now});
  try{
   await Promise.race([inProvider,checking.then(()=>{throw Error('Provider expiry was not invoked');})]);
   writing=syncRecentStripePaymentRecords(writer as unknown as PrismaClient,{financialOnly:true});
   await Promise.race([attemptedWrite,writing.then(()=>{throw Error('Expected ledger writer');})]);
   const early=await Promise.race([writing.then(()=>true),new Promise<false>(r=>setTimeout(()=>r(false),70))]);
   resume();
   expect(await checking).toBe('review');expect(early).toBe(false);
   expect(await used()).toBe(1);
  }finally{resume();await writing;await checking;}
 });
 await db.paymentRecord.delete({where:{stripePaymentIntentId:pi}});
 await db.$transaction(tx=>applyBlackFridaySession(tx,session,now));
});

const decemberEvents = [
 { id:'schedule-import-d7e5b1377dccf88d1d90068c557d',templateId:'cmrykl6lq000uw921mf9kdgr7',slug:'seat-seduction-vanessa',start:'2026-12-12T00:30Z',end:'2026-12-12T01:45Z',single:3000,pair:5000 },
 { id:'schedule-import-e54e7b12d550433a85e6e7f495ec',templateId:'cmrykl6ln000iw921odk89ebz',slug:'hypnotic-heels-nicole',start:'2026-12-18T00:15Z',end:'2026-12-18T01:30Z',single:3000,pair:5000 },
 { id:'schedule-import-12cc3b9897966042d0954cb495b0',templateId:'cmw000b760001la097ii57bjb',slug:'get-fit-with-the-fishers-mw000b75',start:'2026-12-27T16:00Z',end:'2026-12-27T17:00Z',single:2500,pair:4000 },
];
async function decemberDate(e: typeof decemberEvents[number]) {
 await db.classTemplate.upsert({where:{slug:e.slug},update:{},create:{id:e.templateId,categoryId:'bf-category',name:e.slug,slug:e.slug,description:'Fixture',durationMinutes:75,defaultCapacity:2,isEvent:true,dropInPriceCents:e.single,tags:[],equipment:[]}});
 return db.classOccurrence.upsert({where:{id:e.id},update:{},create:{id:e.id,templateId:e.templateId,startAt:new Date(e.start),endAt:new Date(e.end),capacity:2,priceCents:e.single}});
}
it.each(decemberEvents)('December $slug charges exact single and pair amounts with its guest policy',async e=>{
 await decemberDate(e);
 const u=await user('December Buyer '+e.slug);
 const input={userId:u,slug:e.slug,occurrenceId:e.id,origin:'http://localhost',ticketType:'SINGLE' as const};
 const one=await startBlackFridayCheckout(db,stripe,input,now);
 const session=sessions.get('black-friday:'+one.orderId);expect(session.amount_total).toBe(e.single);
 session.payment_intent='pi_'+randomUUID();await expect(startBlackFridayCheckout(db,stripe,input,now)).rejects.toThrow('review');session.payment_intent=null;
 session.status='expired';await db.$transaction(tx=>applyBlackFridaySession(tx,session,now));
 const {specialEventRoster}=await import('@/lib/payments/special-event-roster');
 expect((await specialEventRoster(e.id,{id:buyer})).reviewItems).toContainEqual(expect.objectContaining({orderId:one.orderId,state:'EXPIRED',collectedCents:0,canRefund:false}));
 const friend={fullName:'December Friend '+e.slug,phone:'20155501'+decemberEvents.indexOf(e)+'8'};
 const pair={...input,ticketType:'PAIR' as const,friend};
 if(e.single===3000){
  await expect(startBlackFridayCheckout(db,stripe,{...pair,useEventCredit:true},now)).rejects.toThrow();
  const guest=await user(friend.fullName,friend.phone);
  const history=await db.classOccurrence.create({data:{templateId:e.templateId,startAt:now,endAt:now,capacity:4}});
  await db.booking.create({data:{userId:guest,occurrenceId:history.id,status:'ATTENDED'}});
 }else await expect(startBlackFridayCheckout(db,stripe,pair,now)).rejects.toThrow();
 const order=await startBlackFridayCheckout(db,stripe,{...pair,firstVisitDeclared:e.single===2500},now);
 const two=sessions.get('black-friday:'+order.orderId);
 expect(two.amount_total).toBe(e.pair);await paid(two);
 const {refundCommerceOrderFullRemainder}=await import('@/lib/payments/commerce-refunds');
 await expect(refundCommerceOrderFullRemainder(db,stripe,{orderId:order.orderId,actorId:buyer,reason:'Fixture route proof',confirmation:'REFUND'})).rejects.toThrow('ticket cancellation/refund workflow');
 expect((await db.commerceOrder.findUniqueOrThrow({where:{id:order.orderId}})).status).toBe('PAID');
 if(e.single===3000){
  const {linkGuestAccount}=await import('@/lib/payments/special-event-guests');
  const guest=await db.user.findFirstOrThrow({where:{name:friend.fullName}});
  await linkGuestAccount({orderId:order.orderId,selectedUserId:guest.id,identityConfirmed:true},{id:buyer});
 }
 await refund(two);
});
it('December guest signs paper, arrives without account, links later and appears in attendance exactly once',async ()=>{
 const e=decemberEvents[0];await decemberDate(e);
 const instructor=await user('Assigned Instructor'),other=await user('Different Instructor');
 await db.user.updateMany({where:{id:{in:[instructor,other]}},data:{role:'INSTRUCTOR'}});
 await db.classOccurrence.update({where:{id:e.id},data:{instructorId:instructor,capacity:3}});
 const friend={fullName:'Paper Arrival',phone:'2015550147'};
 const {orderId}=await startBlackFridayCheckout(db,stripe,{userId:await user('Paper Buyer'),slug:e.slug,occurrenceId:e.id,origin:'http://localhost',ticketType:'PAIR',friend},now);
 const s=sessions.get('black-friday:'+orderId);await paid(s);
 const {recordGuestPaperWaiver,checkInGuest,linkGuestAccount,searchGuestAccounts}=await import('@/lib/payments/special-event-guests');
 const {specialEventRoster,paidEventDisplayCount}=await import('@/lib/payments/special-event-roster');
 const owner={id:buyer},assigned={id:instructor};
 await expect(checkInGuest({orderId},assigned)).rejects.toThrow();
 await expect(recordGuestPaperWaiver({orderId,displayedWaiverVersionId:'bf-waiver'},{id:other})).rejects.toThrow();
 await expect(recordGuestPaperWaiver({orderId,displayedWaiverVersionId:'obsolete'},assigned)).rejects.toThrow();
 await recordGuestPaperWaiver({orderId,displayedWaiverVersionId:'bf-waiver'},assigned);
 await checkInGuest({orderId},assigned);await checkInGuest({orderId},owner);
 const {inspectNewFriendHistory}=await import('@/lib/payments/black-friday-new-friend-history');
 expect((await inspectNewFriendHistory(db,friend,buyer,new Date(),true)).status).toBe('INELIGIBLE');
 const {GET}=await import('@/app/api/reports/[report]/route');
 async function countVisits(){const res=await GET(new Request('http://localhost/reports/attendance'),{params:Promise.resolve({report:'attendance'})});return (await res.text()).split('\n').filter(row=>row.includes(friend.fullName)).length;}
 expect(await countVisits()).toBe(1);
 const guest=await user(friend.fullName,friend.phone);
 await expect(db.booking.create({data:{occurrenceId:e.id,userId:guest}})).rejects.toThrow('reserved ticket');
 await db.waiverAcceptance.deleteMany({where:{userId:guest}});
 await expect(searchGuestAccounts({orderId,query:'Paper'},assigned)).rejects.toThrow();
 expect(await searchGuestAccounts({orderId,query:'Paper'},owner)).toEqual([expect.objectContaining({id:guest})]);
 await expect(linkGuestAccount({orderId,selectedUserId:guest,identityConfirmed:false},owner)).rejects.toThrow();
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(+new Date(e.start)+60000));
 try{await linkGuestAccount({orderId,selectedUserId:guest,identityConfirmed:true},owner);}finally{vi.useRealTimers();}
 expect(await countVisits()).toBe(1);
 expect(await db.attendanceRecord.findFirst({where:{occurrenceId:e.id,userId:guest}})).toMatchObject({markedById:instructor,status:'CHECKED_IN'});
 expect(await db.waiverAcceptance.count({where:{userId:guest}})).toBe(0);
 const roster=await specialEventRoster(e.id,assigned);expect(roster.groups).toHaveLength(1);expect(roster.linkedBookingIds).toEqual(expect.arrayContaining(roster.groups[0].attendees.map(a=>a.bookingId)));
 expect(await paidEventDisplayCount(e.id)).toBe(2);
 await db.$transaction(tx=>reverseBlackFridayTicket(tx,{orderId,paymentIntentId:s.payment_intent,refundedAmountCents:1000,disputed:false},now));
 expect((await specialEventRoster(e.id,assigned)).groups).toHaveLength(0);
 expect((await specialEventRoster(e.id,assigned)).reviewItems).toHaveLength(0);
 expect(await paidEventDisplayCount(e.id)).toBe(0);
 await refund(s);await paid(s);expect(await countVisits()).toBe(0);
});


async function legacyDecember(occ:string,userId:string,amountCents=3000) {
 const id=randomUUID(), sessionId='cs_'+randomUUID();
 await db.commerceOrder.create({data:{id,kind:'EVENT',occurrenceId:occ,userId,amountCents,stripeCheckoutSessionId:sessionId}});
 const session={id:sessionId,mode:'payment',status:'open',payment_status:'unpaid',currency:'usd',amount_total:amountCents,
   client_reference_id:id,payment_intent:null as string|null,metadata:{purchaseType:'EVENT',userId,occurrenceId:occ,commerceOrderId:id}};
 sessions.set('legacy:'+id,session);
 return session;
}
async function payLegacy(session:Awaited<ReturnType<typeof legacyDecember>>) {
 const {processStripeEvent}=await import('@/lib/payments/webhook-processor');
 session.status='complete';session.payment_status='paid';session.payment_intent ??= 'pi_'+randomUUID();
 const event={id:'evt_'+randomUUID(),type:'checkout.session.completed',created:Math.floor(+now/1000),data:{object:session}};
 await db.$transaction(tx=>processStripeEvent(tx,event as any));
}
it('December verifies legacy expiry before retry, records late conflicting money once, and preserves native single on replay',async()=>{
 const e=decemberEvents[1];await decemberDate(e);
 const userId=await user('Legacy Conflict Buyer'),guest={fullName:'Conflict Friend',phone:'2015550156'};
 const legacy=await legacyDecember(e.id,userId);
 await expect(legacyDecember(e.id,userId)).rejects.toThrow('earlier checkout');
 const input={userId,occurrenceId:e.id,slug:e.slug,origin:'http://localhost',ticketType:'PAIR' as const,friend:guest};
 await expect(startBlackFridayCheckout(db,stripe,input,now)).rejects.toThrow('earlier event');
 legacy.status='expired';
 const pair=await startBlackFridayCheckout(db,stripe,input,now);
 await payLegacy(legacy);await payLegacy(legacy);
 expect((await db.commerceOrder.findUniqueOrThrow({where:{id:legacy.client_reference_id}})).status).toBe('FULFILLMENT_REVIEW');
 expect(await db.paymentRecord.count({where:{commerceOrderId:legacy.client_reference_id}})).toBe(1);
 const {specialEventRoster}=await import('@/lib/payments/special-event-roster');
 expect((await specialEventRoster(e.id,{id:buyer})).reviewItems).toContainEqual(expect.objectContaining({orderId:legacy.client_reference_id,management:'LEGACY_ORDER',collectedCents:3000}));
 expect(await db.booking.count({where:{occurrenceId:e.id,userId}})).toBe(0);
 const held=sessions.get('black-friday:'+pair.orderId);held.status='expired';await db.$transaction(tx=>applyBlackFridaySession(tx,held,now));
 const independent=await legacyDecember(e.id,await user('Valid Native Single'));await payLegacy(independent);
 const {paidEventDisplayCount}=await import('@/lib/payments/special-event-roster');
 expect(await paidEventDisplayCount(e.id)).toBe(1);
 const booking=await db.booking.findUniqueOrThrow({where:{occurrenceId_userId:{occurrenceId:e.id,userId:independent.metadata.userId}}});
 await db.booking.update({where:{id:booking.id},data:{status:'ATTENDED'}});
 await payLegacy(independent);
 expect((await db.booking.findUniqueOrThrow({where:{id:booking.id}})).status).toBe('ATTENDED');
 expect(await paidEventDisplayCount(e.id)).toBe(1);
});
it('December serializes a last-two-seat legacy callback and a pair',async()=>{
 const e=decemberEvents[0];await decemberDate(e);await db.classOccurrence.update({where:{id:e.id},data:{capacity:2}});
 const legacy=await legacyDecember(e.id,await user('Concurrent Legacy Single'));
 const input={userId:await user('Concurrent Pair Buyer'),occurrenceId:e.id,slug:e.slug,origin:'http://localhost',ticketType:'PAIR' as const,friend:{fullName:'Concurrent Friend',phone:'2015550194'}};
 const [callback,pair]=await Promise.allSettled([payLegacy(legacy),startBlackFridayCheckout(db,stripe,input,now)]);
 expect(callback.status).toBe('fulfilled');
 const order=await db.commerceOrder.findUniqueOrThrow({where:{id:legacy.client_reference_id}});
 expect(order.status).toBe(pair.status==='fulfilled'?'FULFILLMENT_REVIEW':'PAID');
 expect(await db.paymentRecord.count({where:{commerceOrderId:order.id}})).toBe(1);
 const [cap]=await db.$queryRaw<{used:number}[]>`SELECT used FROM "BlackFridayCapacity" WHERE "occurrenceId"=${e.id}`;
 expect(cap.used).toBe(pair.status==='fulfilled'?2:1);
});
it('December selects the next actual Fishers date, keeps later ordinary dates single and rejects a Tricia pair',async()=>{
 const e=decemberEvents[2];await decemberDate(e);
 const oldBuyer=buyer;buyer=await user('December Slug Customer');
 const {POST}=await import('@/app/api/checkout/event/route');
 const post=(body:object)=>POST(new Request('http://localhost/api/checkout/event',{method:'POST',body:JSON.stringify(body)}));
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-12-01T16:00Z'));
 try{
  const response=await post({slug:e.slug});expect(response.status).toBe(200);const {orderId}=await response.json();
  expect((await db.commerceOrder.findUniqueOrThrow({where:{id:orderId}})).occurrenceId).toBe(e.id);
  const later=await db.classOccurrence.create({data:{templateId:e.templateId,startAt:new Date('2027-01-20'),endAt:new Date('2027-01-21'),capacity:2,priceCents:2500}});
  expect((await post({slug:e.slug,occurrenceId:later.id,ticketType:'PAIR'})).status).toBe(400);
  expect((await post({slug:e.slug,occurrenceId:later.id})).status).toBe(200);
  const tricia=await db.classTemplate.create({data:{categoryId:'bf-category',slug:'tricia-fixture',name:'Tricia',isEvent:true,description:'Fixture',durationMinutes:75,tags:[],equipment:[],defaultCapacity:2,dropInPriceCents:3000}});
  await db.classOccurrence.create({data:{templateId:tricia.id,startAt:new Date('2026-12-04T23:30Z'),endAt:new Date('2026-12-05T00:45Z'),capacity:2}});
  expect((await post({slug:tricia.slug,ticketType:'PAIR'})).status).toBe(400);
  expect((await post({slug:tricia.slug})).status).toBe(200);
 }finally{vi.useRealTimers();buyer=oldBuyer;}
});
it('December Fishers consumes the current earned credit plus $15; a November bucket cannot roll over',async()=>{
 const e=decemberEvents[2];await decemberDate(e);await db.classOccurrence.update({where:{id:e.id},data:{capacity:6}});
 const f=await vipFixture('December VIP Buyer');const dec=new Date('2026-12-03T16:00:00Z');
 const w=vipMonthlyBenefitWindowForDate(dec);
 const input={userId:f.u,occurrenceId:e.id,slug:e.slug,origin:'http://localhost',ticketType:'PAIR' as const,useEventCredit:true,firstVisitDeclared:true,friend:{fullName:'December VIP Guest',phone:'2015550175'}};
 await expect(startBlackFridayCheckout(db,stripe,input,now)).rejects.toThrow();
 await db.membership.update({where:{id:f.m.id},data:{currentPeriodStart:w.validFrom,currentPeriodEnd:w.validUntil}});
 await db.creditAccount.updateMany({where:{userId:f.u,isUnlimited:true},data:{validUntil:w.validUntil}});
 await db.creditAccount.create({data:{userId:f.u,label:w.eventCreditLabel,isUnlimited:false,validFrom:w.validFrom,validUntil:w.validUntil,entries:{create:{type:'GRANT',quantity:1}}}});
 const {orderId}=await startBlackFridayCheckout(db,stripe,input,dec);const s=sessions.get('black-friday:'+orderId);
 expect(s.amount_total).toBe(1500);await paid(s);await refund(s);
});
