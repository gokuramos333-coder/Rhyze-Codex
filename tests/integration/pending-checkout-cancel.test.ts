import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { PrismaClient, type Role } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const runtime = vi.hoisted(() => ({ db: null as unknown as PrismaClient, actorId: '', origin: 'http://localhost:3000', retrieve: vi.fn(), expire: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: new Proxy({}, { get: (_,key) => { const value=runtime.db[key as keyof PrismaClient]; return typeof value==='function' ? value.bind(runtime.db) : value; } }) }));
vi.mock('@/auth', () => ({auth:async()=>runtime.actorId ? {user:{id:runtime.actorId}} : null}));
vi.mock('next/headers', () => ({headers:async()=>new Headers({origin:runtime.origin})}));
vi.mock('next/navigation', () => ({redirect:(to:string)=>{throw Error('redirect:'+to);}}));
vi.mock('next/cache', () => ({revalidatePath:vi.fn()}));
vi.mock('@/lib/payments/stripe', () => ({stripeIsConfigured:()=>true,stripeAccountMode:()=> 'test',getStripe:()=>({checkout:{sessions:{retrieve:runtime.retrieve,expire:runtime.expire}}})}));
import * as actions from '@/app/(studio)/admin/members/[userId]/actions';
import { processStripeEvent } from '@/lib/payments/webhook-processor';
const url=process.env.CALLBACK_TEST_DATABASE_URL;
const directory=process.env.TRIAL_TEST_DATABASE_DIR;
const db=new PrismaClient({datasourceUrl:url || 'postgresql://invalid@127.0.0.1:1/callback_test'});
async function guard() {
  if (process.env.NODE_ENV!=='test' || !url || !directory || !isAbsolute(directory)) throw Error('Owned disposable database declaration required');
  const u=new URL(url);
  if (!['postgresql:','postgres:'].includes(u.protocol) || u.hostname!=='127.0.0.1' || !u.port || u.pathname!=='/callback_test' || u.search || u.hash) throw Error('Unsafe test database');
  const [row]=await db.$queryRaw<{name:string,address:string,port:number,directory:string}[]>`SELECT current_database() AS name,host(inet_server_addr()) AS address,inet_server_port() AS port,current_setting('data_directory') AS directory`;
  if(row.name!=='callback_test'||row.address!=='127.0.0.1'||row.port!==Number(u.port)||await realpath(row.directory)!==await realpath(directory)) throw Error('Owned database identity mismatch');
}
let ownerId='cancel-owner-'+randomUUID();
beforeAll(async()=>{await guard();runtime.db=db;const owner=await db.user.upsert({where:{email:'automation-admin@rhyze.local'},update:{},create:{id:ownerId,email:'automation-admin@rhyze.local',role:'OWNER',status:'ACTIVE'}});ownerId=owner.id;});
afterAll(async()=>{await db.$disconnect();});
beforeEach(()=>{runtime.actorId=ownerId;runtime.origin='http://localhost:3000';process.env.NEXT_PUBLIC_APP_URL='http://localhost:3000';runtime.retrieve.mockReset();runtime.expire.mockReset();});
async function fixture(){
  await guard();const id=randomUUID();
  const user=await db.user.create({data:{email:`synthetic-${id}@example.test`,name:'Synthetic Member',status:'ACTIVE',stripeCustomerId:'cus_'+id}});
  const product=await db.product.create({data:{name:'Synthetic monthly',slug:id,description:'Synthetic only',kind:'LIMITED_MEMBERSHIP',billingInterval:'MONTHLY',priceCents:9200}});
  const purchase=await db.purchase.create({data:{userId:user.id,productId:product.id,amountCents:7800,stripeCheckoutSessionId:'cs_test_'+id,policyAcceptance:{source:'ADMIN_CHECKOUT',memberPricing:{monthlyCents:7800,regularCents:9200,amountOff:1400,duration:'repeating',months:1,reason:'Synthetic offer'}}}});
  let state='open';
  const session=()=>({id:purchase.stripeCheckoutSessionId,status:state,payment_status:'unpaid',mode:'subscription',livemode:false,customer:user.stripeCustomerId,client_reference_id:purchase.id,metadata:{purchaseId:purchase.id,userId:user.id,productId:product.id,initiatedBy:'ADMIN'},invoice:null,subscription:null,payment_intent:null});
  runtime.retrieve.mockImplementation(async()=>session());runtime.expire.mockImplementation(async()=>{state='expired';return session();});
  const form=new FormData();form.set('userId',user.id);form.set('purchaseId',purchase.id);form.set('reason','Correct mistaken price');form.set('confirmed','yes');
  const event={id:'evt_'+id,type:'checkout.session.completed',created:Math.floor(Date.now()/1000),livemode:false,data:{object:{...session(),payment_status:'paid',amount_total:7800,currency:'usd',subscription:'sub_'+id,payment_intent:'pi_'+id}}};
  return {user,product,purchase,form,session,setState:(s:string)=>{state=s;},event};
}
async function cancel(form:FormData){
  const action=(actions as unknown as Record<string,(form:FormData)=>Promise<unknown>>).cancelAdminMembershipCheckoutAction;
  expect(action,'actual authenticated cancellation action must exist').toBeTypeOf('function');
  return action(form);
}
const success=(form:FormData)=>expect(cancel(form)).rejects.toThrow('checkout-cancelled');
const rejected=(form:FormData)=>expect(cancel(form)).rejects.toThrow('checkout-review');
async function unchanged(id:string){expect(await db.purchase.findUnique({where:{id}})).toMatchObject({status:'PENDING',paidAt:null,failedAt:null});}
describe('actual checkout cancellation action on owned PostgreSQL',()=>{
  async function emailFixture() {
    const f=await fixture();
    await db.user.update({where:{id:f.user.id},data:{stripeCustomerId:null}});
    const session=()=>({...f.session(),customer:null,customer_email:f.user.email,customer_details:null,
      metadata:{...f.session().metadata,customerEmail:f.user.email}});
    runtime.retrieve.mockImplementation(async()=>session());
    runtime.expire.mockImplementation(async()=>{f.setState('expired');return session();});
    return {...f,session};
  }
  it.each(['open','expired'])('cancels customer-email-created %s session and safely replays',async status=>{
    const f=await emailFixture(); f.setState(status);
    f.form.set('customerEmail','attacker@example.test'); f.form.set('customerId','cus_attacker');
    await success(f.form);await success(f.form);
    expect(runtime.expire).toHaveBeenCalledTimes(status==='open'?1:0);
    expect(await db.purchase.findUnique({where:{id:f.purchase.id}})).toMatchObject({status:'FAILED',paidAt:null,stripeCheckoutSessionId:f.purchase.stripeCheckoutSessionId});
    expect(await db.user.findUnique({where:{id:f.user.id}})).toMatchObject({stripeCustomerId:null,email:f.user.email});
    expect(await db.auditLog.count({where:{entityId:f.purchase.id,action:'ADMIN_MEMBERSHIP_CHECKOUT_CANCELLED'}})).toBe(1);
  });
  it.each(['missingEmail','wrongEmail','missingProvenance','wrongProvenance','wrongDetails','unboundCustomer','changedSavedEmail'])(
    'rejects customerless %s before provider expiry',async kind=>{
      const f=await emailFixture();const s=f.session();
      const overrides:Record<string,unknown>={};
      if(kind==='missingEmail')overrides.customer_email=null;
      if(kind==='wrongEmail')overrides.customer_email='wrong@example.test';
      if(kind==='missingProvenance')overrides.metadata={...s.metadata,customerEmail:undefined};
      if(kind==='wrongProvenance')overrides.metadata={...s.metadata,customerEmail:'wrong@example.test'};
      if(kind==='wrongDetails')overrides.customer_details={email:'wrong@example.test'};
      if(kind==='unboundCustomer')overrides.customer='cus_arbitrary';
      if(kind==='changedSavedEmail')await db.user.update({where:{id:f.user.id},data:{email:`changed-${randomUUID()}@example.test`}});
      runtime.retrieve.mockResolvedValue({...s,...overrides});await rejected(f.form);
      await unchanged(f.purchase.id);expect(runtime.expire).not.toHaveBeenCalled();
    });
  it.each(['email','customer','providerProvenance','paid'])( 'rejects customerless changed %s during provider work',async kind=>{
    const f=await emailFixture();runtime.expire.mockImplementation(async()=>{
      f.setState('expired');
      if(kind==='email')await db.user.update({where:{id:f.user.id},data:{email:`changed-${randomUUID()}@example.test`}});
      if(kind==='customer')await db.user.update({where:{id:f.user.id},data:{stripeCustomerId:'cus_changed_'+randomUUID()}});
      if(kind==='providerProvenance')runtime.retrieve.mockResolvedValue({...f.session(),metadata:{...f.session().metadata,customerEmail:'wrong@example.test'}});
      if(kind==='paid')runtime.retrieve.mockResolvedValue({...f.session(),payment_status:'paid'});
    });await rejected(f.form);await unchanged(f.purchase.id);
  });

  it('expires exact saved session and preserves historical membership, credits and payments',async()=>{
    const f=await fixture(); const historical=await db.membership.create({data:{userId:f.user.id,productId:f.product.id,status:'EXPIRED',currentPeriodStart:new Date(0),currentPeriodEnd:new Date(1)}});
    await success(f.form);expect(await db.purchase.findUnique({where:{id:f.purchase.id}})).toMatchObject({status:'FAILED',stripeCheckoutSessionId:f.purchase.stripeCheckoutSessionId,paidAt:null});
    expect(await db.membership.findUnique({where:{id:historical.id}})).toEqual(historical);
    expect(await db.paymentRecord.count({where:{userId:f.user.id}})).toBe(0);expect(await db.emailMessage.count({where:{userId:f.user.id}})).toBe(0);
    const audit=await db.auditLog.findFirst({where:{entityId:f.purchase.id,action:'ADMIN_MEMBERSHIP_CHECKOUT_CANCELLED'}});
    expect(audit).toMatchObject({actorId:ownerId,after:{reason:'Correct mistaken price',proof:{sessionId:f.purchase.stripeCheckoutSessionId,status:'expired',paymentStatus:'unpaid'}}});
  });
  it.each(['MEMBER','INSTRUCTOR','ADMIN'] as Role[])('rejects unauthorized %s using real role rules',async role=>{
    const f=await fixture();await db.user.update({where:{id:f.user.id},data:{role}});runtime.actorId=f.user.id;
    await expect(cancel(f.form)).rejects.toThrow('redirect:/member');expect(runtime.retrieve).not.toHaveBeenCalled();await unchanged(f.purchase.id);
  });
  it('rejects unapproved owner and absent session',async()=>{const f=await fixture();await db.user.update({where:{id:f.user.id},data:{role:'OWNER'}});runtime.actorId=f.user.id;await expect(cancel(f.form)).rejects.toThrow('redirect:/member');runtime.actorId='';await expect(cancel(f.form)).rejects.toThrow('redirect:/sign-in');expect(runtime.retrieve).not.toHaveBeenCalled();});
  it('rejects wrong origin before provider access',async()=>{const f=await fixture();runtime.origin='https://evil.example';await rejected(f.form);expect(runtime.retrieve).not.toHaveBeenCalled();});
  it('rejects wrong client and ignores submitted provider IDs',async()=>{const f=await fixture();f.form.set('userId','wrong');await rejected(f.form);expect(runtime.retrieve).not.toHaveBeenCalled();f.form.set('userId',f.user.id);f.form.set('sessionId','cs_attacker');await success(f.form);expect(runtime.expire.mock.calls[0][0]).toBe(f.purchase.stripeCheckoutSessionId);});
  it('requires confirmation and bounded reason',async()=>{const f=await fixture();f.form.delete('confirmed');await rejected(f.form);f.form.set('confirmed','yes');f.form.set('reason','x');await rejected(f.form);expect(runtime.retrieve).not.toHaveBeenCalled();});
  it('rejects wrong provider identity without clearing purchase',async()=>{const f=await fixture();runtime.retrieve.mockResolvedValue({...f.session(),customer:'wrong'});await rejected(f.form);await unchanged(f.purchase.id);expect(runtime.expire).not.toHaveBeenCalled();});
  it('rejects paid provider state and existing application settlement',async()=>{const f=await fixture();runtime.retrieve.mockResolvedValue({...f.session(),payment_status:'paid'});await rejected(f.form);await unchanged(f.purchase.id);runtime.retrieve.mockClear();await db.purchase.update({where:{id:f.purchase.id},data:{paidAt:new Date(),status:'PAID'}});await rejected(f.form);expect(runtime.retrieve).not.toHaveBeenCalled();});
  it('does not clear on expiry failure; allows safe retry',async()=>{const f=await fixture();runtime.expire.mockRejectedValue(Error('timeout'));await rejected(f.form);await unchanged(f.purchase.id);f.setState('expired');await success(f.form);});
  it('replays completed cancellation without duplicating audit',async()=>{const f=await fixture();await success(f.form);await success(f.form);expect(await db.auditLog.count({where:{entityId:f.purchase.id,action:'ADMIN_MEMBERSHIP_CHECKOUT_CANCELLED'}})).toBe(1);expect(runtime.expire).toHaveBeenCalledTimes(1);});
  it('rejects unrelated failed purchase even if provider expired',async()=>{const f=await fixture();await db.purchase.update({where:{id:f.purchase.id},data:{status:'FAILED',failedAt:new Date()}});f.setState('expired');await rejected(f.form);expect(runtime.retrieve).not.toHaveBeenCalled();});
  it('serializes concurrent cancellation and records one receipt',async()=>{const f=await fixture();await Promise.all([success(f.form),success(f.form)]);expect(await db.auditLog.count({where:{entityId:f.purchase.id,action:'ADMIN_MEMBERSHIP_CHECKOUT_CANCELLED'}})).toBe(1);});
  it('payment webhook winning during provider work is never overwritten',async()=>{const f=await fixture();runtime.expire.mockImplementation(async()=>{await db.$transaction(tx=>processStripeEvent(tx,f.event as never));f.setState('expired');return f.session();});await rejected(f.form);expect(await db.purchase.findUnique({where:{id:f.purchase.id}})).toMatchObject({status:'PAID',failedAt:null});expect(await db.auditLog.count({where:{entityId:f.purchase.id,action:'ADMIN_MEMBERSHIP_CHECKOUT_CANCELLED'}})).toBe(0);});
  it('rejects an unlinked payment record for the same provider session',async()=>{
    const f=await fixture();await db.paymentRecord.create({data:{kind:'PRODUCT_PURCHASE',status:'SUCCEEDED',amountCents:7800,stripeEventId:'evt-unlinked-'+randomUUID(),stripeCheckoutSessionId:f.purchase.stripeCheckoutSessionId}});
    await rejected(f.form);expect(runtime.retrieve).not.toHaveBeenCalled();await unchanged(f.purchase.id);
  });
  it('recovers real transaction rollback after provider expiry without creating another link',async()=>{
    const f=await fixture();let transactions=0;
    runtime.db=new Proxy(db,{get(target,key){if(key==='$transaction') return (fn: Parameters<PrismaClient['$transaction']>[0])=>db.$transaction(async tx=>{const result=await (fn as unknown as (tx:unknown)=>Promise<unknown>)(tx);if(++transactions===2)throw Error('Synthetic commit failure');return result;});const value=target[key as keyof PrismaClient];return typeof value==='function'?value.bind(target):value;}});
    try {await rejected(f.form);} finally {runtime.db=db;}
    await unchanged(f.purchase.id);expect(await db.auditLog.count({where:{entityId:f.purchase.id,action:'ADMIN_MEMBERSHIP_CHECKOUT_CANCELLED'}})).toBe(0);
    expect(await db.auditLog.count({where:{entityId:f.purchase.id,action:'ADMIN_MEMBERSHIP_CHECKOUT_CANCEL_REQUESTED'}})).toBe(1);
    await success(f.form);expect(runtime.expire).toHaveBeenCalledTimes(1);
  });
  it.each(['source','kind','invoice','membership','paymentIntent'] as const)('rejects ineligible saved %s before provider access',async field=>{
    const f=await fixture();
    if(field==='source')await db.purchase.update({where:{id:f.purchase.id},data:{policyAcceptance:{source:'MEMBER'}}});
    if(field==='kind')await db.product.update({where:{id:f.product.id},data:{kind:'INTRO_TRIAL'}});
    if(field==='invoice')await db.invoice.create({data:{purchaseId:f.purchase.id,number:randomUUID(),amountCents:7800}});
    if(field==='membership')await db.membership.create({data:{userId:f.user.id,productId:f.product.id,purchaseId:f.purchase.id,status:'ACTIVE',currentPeriodStart:new Date()}});
    if(field==='paymentIntent')await db.purchase.update({where:{id:f.purchase.id},data:{stripePaymentIntentId:'pi_'+randomUUID()}});
    await rejected(f.form);expect(runtime.retrieve).not.toHaveBeenCalled();await unchanged(f.purchase.id);
  });
  it.each(['amount','policy','session','unlinkedPayment'] as const)('rejects changed saved %s after provider expiry',async field=>{
    const f=await fixture();runtime.expire.mockImplementation(async()=>{
      f.setState('expired');
      if(field==='amount')await db.purchase.update({where:{id:f.purchase.id},data:{amountCents:7820}});
      if(field==='policy')await db.purchase.update({where:{id:f.purchase.id},data:{policyAcceptance:{source:'ADMIN_CHECKOUT',changed:true}}});
      if(field==='session')await db.purchase.update({where:{id:f.purchase.id},data:{stripeCheckoutSessionId:'cs_changed_'+randomUUID()}});
      if(field==='unlinkedPayment')await db.paymentRecord.create({data:{kind:'PRODUCT_PURCHASE',status:'SUCCEEDED',amountCents:7800,stripeEventId:randomUUID(),stripeCheckoutSessionId:f.purchase.stripeCheckoutSessionId}});
      return f.session();
    });await rejected(f.form);await unchanged(f.purchase.id);
    expect(await db.auditLog.count({where:{entityId:f.purchase.id,action:'ADMIN_MEMBERSHIP_CHECKOUT_CANCELLED'}})).toBe(0);
  });
  it.each([['cancel',false],['webhook',false],['cancel',true],['webhook',true]] as const)('controlled overlapping purchase locks: %s wins, customerless=%s',async (winner,customerless)=>{
    const f=await (customerless ? emailFixture() : fixture());
    let release!:()=>void, reached!:()=>void;
    const gate=new Promise<void>(r=>{release=r;});const locked=new Promise<void>(r=>{reached=r;});
    const wrap=(tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0])=>new Proxy(tx,{get(target,key){
      if(key==='$queryRaw')return async(...args:unknown[])=>{
        const result=await (target.$queryRaw as (...args:unknown[])=>Promise<unknown>)(...args);
        if(String(args[0]).includes('FROM "Purchase"')&&String(args[0]).includes('FOR UPDATE')){reached();await gate;}
        return result;
      };
      const value=target[key as keyof typeof target];return typeof value==='function'?value.bind(target):value;
    }});
    let count=0;
    if(winner==='cancel')runtime.db=new Proxy(db,{get(target,key){
      if(key==='$transaction')return (fn:(tx:unknown)=>Promise<unknown>)=>db.$transaction(tx=>fn(++count===2?wrap(tx):tx));
      const value=target[key as keyof PrismaClient];return typeof value==='function'?value.bind(target):value;
    }});
    const first=winner==='cancel'?success(f.form):db.$transaction(tx=>processStripeEvent(wrap(tx),f.event as never));
    await locked;
    const second=winner==='cancel'?expect(db.$transaction(tx=>processStripeEvent(tx,f.event as never))).rejects.toThrow('cancelled checkout'):rejected(f.form);
    try {
      await vi.waitFor(async()=>{
        const rows=await db.$queryRaw<{n:bigint}[]>`SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%Purchase%'`;
        expect(Number(rows[0].n)).toBeGreaterThan(0);
      });
    } finally {release();await Promise.all([first,second]);runtime.db=db;}
    expect(await db.purchase.findUnique({where:{id:f.purchase.id}})).toMatchObject({status:winner==='cancel'?'FAILED':'PAID'});
    if(winner==='cancel'){await success(f.form);await success(f.form);expect(await db.auditLog.count({where:{entityId:f.purchase.id,action:'ADMIN_MEMBERSHIP_CHECKOUT_CANCELLED'}})).toBe(1);}
    else {await rejected(f.form);expect(await db.auditLog.count({where:{entityId:f.purchase.id,action:'ADMIN_MEMBERSHIP_CHECKOUT_CANCELLED'}})).toBe(0);}
  });
  it('contradictory paid webhook after verified expiry fails closed for reconciliation',async()=>{const f=await fixture();await success(f.form);await expect(db.$transaction(tx=>processStripeEvent(tx,f.event as never))).rejects.toThrow('cancelled checkout');expect(await db.purchase.findUnique({where:{id:f.purchase.id}})).toMatchObject({status:'FAILED',paidAt:null});});
});
