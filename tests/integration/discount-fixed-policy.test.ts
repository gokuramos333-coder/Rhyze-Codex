import {beforeAll,afterAll,beforeEach,it,expect,vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import { discountDatabaseDeclaration, assertDiscountDatabaseIdentity } from '@/scripts/release/disposable-discount-database';
const declaration = discountDatabaseDeclaration(process.env);
const db = new PrismaClient({ datasourceUrl: declaration.url });
const f=vi.hoisted(()=>({auth:vi.fn(),create:vi.fn(),retrieve:vi.fn(),coupon:vi.fn()}));
vi.mock('@/lib/db/prisma',()=>({get prisma(){return db;}}));
vi.mock('@/lib/auth/session',()=>({requireArea:f.auth,requireApprovedOwner:f.auth}));
vi.mock('next/navigation',()=>({redirect:(url:string)=>{throw Error('REDIRECT:'+url)}}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/notifications/email-queue',()=>({queueEmail:vi.fn()}));
vi.mock('@/lib/payments/stripe',()=>({stripeIsConfigured:()=>true,getStripe:()=>({coupons:{retrieve:f.coupon,create:vi.fn()},checkout:{sessions:{create:f.create,retrieve:f.retrieve}}})}));
import {startCheckoutAction} from '@/app/(portal)/member/membership/actions';
import {processStripeEvent} from '@/lib/payments/webhook-processor';
let product:any,waiver:any,campaign:any,user:any;
const sessions=new Map<string,any>(); const calls:any[]=[];
beforeAll(async()=>{
 await assertDiscountDatabaseIdentity(db, declaration);
 product=await db.product.create({data:{slug:randomUUID(),name:'Synthetic pack',description:'Isolated verification',kind:'CLASS_PACK',billingInterval:'ONE_TIME',priceCents:9200,includedCredits:8,eligibleCategoryIds:[],isActive:true,isPublic:true}});
 waiver=await db.waiverVersion.create({data:{version:Math.floor(Date.now()/1000)+200000,title:'Synthetic',body:'Synthetic',effectiveAt:new Date(),isActive:true}});
 campaign=await db.discountCampaign.create({data:{code:'ACTION'+randomUUID().replaceAll('-','').slice(0,12).toUpperCase(),percentOff:null,amountOffCents:1375,startsAt:new Date(Date.now()-60000),endsAt:new Date(Date.now()+86400000),productIds:[product.id],enabled:true}});
});
afterAll(()=>db.$disconnect());
beforeEach(async()=>{
 user=await db.user.create({data:{email:randomUUID()+'@example.invalid',status:'ACTIVE'}});
 await db.waiverAcceptance.create({data:{userId:user.id,waiverVersionId:waiver.id,signedDate:new Date()}});
 await db.discountCampaign.update({where:{id:campaign.id},data:{enabled:true,startsAt:new Date(Date.now()-60000),endsAt:new Date(Date.now()+86400000)}});
 f.auth.mockResolvedValue(user);f.create.mockReset();f.retrieve.mockReset();f.coupon.mockResolvedValue({id:'coupon_synthetic',valid:true,amount_off:1375,currency:'usd',duration:'once'});sessions.clear();calls.length=0;
 f.create.mockImplementation(async(params:any,options:any)=>{calls.push({params,options});if(!sessions.has(options.idempotencyKey))sessions.set(options.idempotencyKey,{id:'cs_'+params.metadata.purchaseId,url:'https://example.invalid/'+params.metadata.purchaseId,status:'open'});return sessions.get(options.idempotencyKey)});
 f.retrieve.mockImplementation(async(id:string)=>[...sessions.values()].find(x=>x.id===id));
});
async function invoke(code=campaign.code, selectedProduct=product.id){const form=new FormData();form.set('productId',selectedProduct);form.set('referralCode',code);try{await startCheckoutAction(form);return 'RETURNED'}catch(e){return String(e)}}
async function purchase(){return db.purchase.findFirstOrThrow({where:{userId:user.id},orderBy:{createdAt:'desc'}})}
function event(p:any,type='checkout.session.completed'){return {id:'evt_'+randomUUID(),livemode:false,type,created:Math.floor(Date.now()/1000),data:{object:{id:'cs_'+p.id,payment_status:'paid',amount_total:7825,currency:'usd',payment_intent:'pi_'+p.id,metadata:{purchaseId:p.id}}}} as any}
async function paid(p:any,type?:string){await db.$transaction(tx=>processStripeEvent(tx,event(p,type)),{timeout:15000});const session=sessions.get('checkout-'+p.id);if(session)session.status='complete';}
async function state(p:any){return {purchase:await db.purchase.findUnique({where:{id:p.id}}),payments:await db.paymentRecord.findMany({where:{purchaseId:p.id}}),accounts:await db.creditAccount.findMany({where:{sourcePurchaseId:p.id},include:{entries:true}})}}
it('actual action sequential same offer returns one purchase/session',async()=>{const a=await invoke(),b=await invoke();expect(a).toContain('https://example.invalid/');expect(b).toBe(a);expect(f.create).toHaveBeenCalledTimes(1);expect(await db.purchase.count({where:{userId:user.id}})).toBe(1)});
it('actual action controlled concurrent same offer uses same durable payload/key/session',async()=>{
 let enter!:()=>void,release!:()=>void;const held=new Promise<void>(r=>enter=r),gate=new Promise<void>(r=>release=r);const original=f.create.getMockImplementation()!;
 f.create.mockImplementation(async(...args:any[])=>{enter();await gate;return original(...args)});
 const a=invoke();await held;const b=invoke();
 for(let i=0;i<100&&f.create.mock.calls.length<2;i++)await new Promise(r=>setTimeout(r,10));
 release();const results=await Promise.all([a,b]);expect(results[0]).toContain('https://example.invalid/');expect(results[1]).toBe(results[0]);expect(f.create).toHaveBeenCalledTimes(2);expect(f.create.mock.calls[0]).toEqual(f.create.mock.calls[1]);expect(sessions.size).toBe(1);expect(await db.purchase.count({where:{userId:user.id}})).toBe(1);
});
it('actual action uncertain provider creation retries stable wire payload and identity',async()=>{const original=f.create.getMockImplementation()!;f.create.mockImplementationOnce(async(...args:any[])=>{await original(...args);throw Error('connection lost after creation')});expect(await invoke()).toContain('checkout-error');const p=await purchase();expect(p.status).toBe('PENDING');expect(await invoke()).toContain('https://example.invalid/');expect(f.create.mock.calls[0]).toEqual(f.create.mock.calls[1]);expect(sessions.size).toBe(1);expect(await db.purchase.count({where:{userId:user.id}})).toBe(1)});
it('actual action expiry-confirmed recovery retains old FAILED history and permits new purchase',async()=>{await invoke();const old=await purchase();sessions.get('checkout-'+old.id).status='expired';expect(await invoke()).toContain('https://example.invalid/');expect((await db.purchase.findUniqueOrThrow({where:{id:old.id}})).status).toBe('FAILED');expect(await db.purchase.count({where:{userId:user.id}})).toBe(2);expect((await purchase()).id).not.toBe(old.id)});
it('actual action paid fulfillment/replay grants once and blocks same campaign',async()=>{await invoke();const p=await purchase();await paid(p);await paid(p,'checkout.session.async_payment_succeeded');const s=await state(p);expect(s.purchase?.status).toBe('PAID');expect(s.payments).toHaveLength(1);expect(s.accounts).toHaveLength(1);expect(s.accounts[0].entries.map(x=>x.quantity)).toEqual([8]);expect(await invoke()).toContain('checkout-error');expect(await db.referralCommission.count({where:{purchaseId:p.id}})).toBe(0);console.log('PAID_STATE',JSON.stringify(s))});
it('legitimate FAILED to paid recovery still fulfills and blocks second discount',async()=>{await invoke();const p=await purchase();await db.$transaction(tx=>processStripeEvent(tx,event(p,'checkout.session.async_payment_failed')));expect((await purchase()).status).toBe('FAILED');await paid(p,'checkout.session.async_payment_succeeded');const s=await state(p);expect(s.purchase?.status).toBe('PAID');expect(s.accounts[0].entries.map(x=>x.quantity)).toEqual([8]);expect(await invoke()).toContain('checkout-error')});

it('same customer can redeem a later campaign after successful first campaign',async()=>{
 await invoke();await paid(await purchase());
 const next=await db.discountCampaign.create({data:{code:('NEXT'+randomUUID().replaceAll('-','').slice(0,20)).toUpperCase(),percentOff:null,amountOffCents:1375,startsAt:new Date(Date.now()-1000),endsAt:new Date(Date.now()+600000),productIds:[product.id],enabled:true}});
 expect(await invoke(next.code)).toContain('https://example.invalid/');expect(await db.purchase.count({where:{userId:user.id}})).toBe(2);
});
it('permanent user/campaign redemption survives refund status changes',async()=>{
 await invoke();const p=await purchase();await paid(p);await db.purchase.update({where:{id:p.id},data:{status:'REFUNDED'}});
 expect(await invoke()).toContain('checkout-error');expect(await db.purchase.count({where:{userId:user.id}})).toBe(1);
 const rows=await db.$queryRaw<any[]>`SELECT * FROM "CampaignRedemption" WHERE "userId"=${user.id}`;expect(rows).toHaveLength(1);expect(rows[0].campaignId).toBe(campaign.id);
});
it('prior referral discount does not exclude a campaign',async()=>{
 await db.purchase.create({data:{userId:user.id,productId:product.id,amountCents:7825,discountCents:1375,status:'PAID'}});
 expect(await invoke()).toContain('https://example.invalid/');
});
it('last-minute issuance uses no early cutoff or 31-minute grace',async()=>{
 await db.discountCampaign.update({where:{id:campaign.id},data:{endsAt:new Date(Date.now()+60000)}});
 const sale=await db.discountCampaign.findUniqueOrThrow({where:{id:campaign.id}});expect(await invoke()).toContain('https://example.invalid/');
 expect(calls[0].params.expires_at).toBe(Math.floor(sale.endsAt!.getTime()/1000)+1800);
});
it.each(['disable','end'])('existing valid session resumes after %s without fresh issuance',async(kind)=>{
 const first=await invoke();await db.discountCampaign.update({where:{id:campaign.id},data:kind==='disable'?{enabled:false}:{endsAt:new Date(Date.now()-1)}});
 expect(await invoke()).toBe(first);expect(f.create).toHaveBeenCalledTimes(1);
});
it.each(['disable','end'])('unknown outcome replays stable parameters after %s',async(kind)=>{
 const original=f.create.getMockImplementation()!;f.create.mockImplementationOnce(async(...args:any[])=>{await original(...args);throw Error('lost')});await invoke();
 await db.discountCampaign.update({where:{id:campaign.id},data:kind==='disable'?{enabled:false}:{endsAt:new Date(Date.now()-1)}});
 expect(await invoke()).toContain('https://example.invalid/');expect(f.create.mock.calls[0]).toEqual(f.create.mock.calls[1]);expect(sessions.size).toBe(1);
});
it.each(['disable','end'])('no fresh admission after %s',async(kind)=>{
 await db.discountCampaign.update({where:{id:campaign.id},data:kind==='disable'?{enabled:false}:{endsAt:new Date(Date.now()-1)}});
 expect(await invoke()).toContain('checkout-error');expect(f.create).not.toHaveBeenCalled();expect(await db.purchase.count({where:{userId:user.id}})).toBe(0);
});
it('concurrent different campaigns retain member-wide in-flight serialization',async()=>{
 const next=await db.discountCampaign.create({data:{code:('OTHER'+randomUUID().replaceAll('-','').slice(0,20)).toUpperCase(),percentOff:null,amountOffCents:1375,startsAt:new Date(Date.now()-1000),endsAt:new Date(Date.now()+600000),productIds:[product.id],enabled:true}});
 const results=await Promise.all([invoke(),invoke(next.code)]);expect(results.filter(x=>x.includes('https://example.invalid/'))).toHaveLength(1);expect(await db.purchase.count({where:{userId:user.id}})).toBe(1);
});
it('monthly campaign uses subscription and one once-only coupon, not recurring discount',async()=>{
 const monthly=await db.product.create({data:{slug:randomUUID(),name:'Synthetic monthly',description:'Test',kind:'LIMITED_MEMBERSHIP',billingInterval:'MONTHLY',priceCents:9200,stripePriceId:'price_'+randomUUID(),eligibleCategoryIds:[],isPublic:true}});
 await db.discountCampaign.update({where:{id:campaign.id},data:{productIds:[product.id,monthly.id]}});
 expect(await invoke(campaign.code,monthly.id)).toContain('https://example.invalid/');expect(calls[0].params.mode).toBe('subscription');expect(calls[0].params.discounts).toEqual([{coupon:'coupon_synthetic'}]);expect(calls[0].params.allow_promotion_codes).toBeUndefined();
});

it('provider minimum expiry rejection never gains a minute or a new retry identity',async()=>{
 await db.discountCampaign.update({where:{id:campaign.id},data:{endsAt:new Date(Date.now()+1000)}});
 f.create.mockImplementation(async(params:any)=>{
  // Explicit Stripe-contract double: receipt is later than durable allocation.
  const providerNow=Math.floor(Date.now()/1000)+2;
  if(params.expires_at < providerNow+1800) throw Object.assign(Error('expires_at must be at least 30 minutes'),{type:'StripeInvalidRequestError',param:'expires_at'});
  throw Error('unexpected accepted request');
 });
 expect(await invoke()).toContain('campaign-checkout-expiry');expect(await invoke()).toContain('campaign-checkout-expiry');
 expect(f.create.mock.calls).toHaveLength(2);expect(f.create.mock.calls[0]).toEqual(f.create.mock.calls[1]);
 expect(await db.purchase.count({where:{userId:user.id}})).toBe(1);
 expect((await purchase()).status).toBe('PENDING');
});
it('disable during coupon setup prevents session issuance while retaining safe reservation',async()=>{
 f.coupon.mockImplementationOnce(async()=>{await db.discountCampaign.update({where:{id:campaign.id},data:{enabled:false}});return {id:'coupon_synthetic',valid:true,amount_off:1375,currency:'usd',duration:'once'}});
 expect(await invoke()).toContain('checkout-error');expect(f.create).not.toHaveBeenCalled();
});
it('provider-confirmed expired session after sale end cannot create a fresh checkout',async()=>{
 await invoke();const p=await purchase();sessions.get('checkout-'+p.id).status='expired';
 await db.discountCampaign.update({where:{id:campaign.id},data:{endsAt:new Date(Date.now()-1)}});
 expect(await invoke()).toContain('checkout-error');expect(f.create).toHaveBeenCalledTimes(1);expect(await db.purchase.count({where:{userId:user.id}})).toBe(1);
});
it.each(['pack','monthly'])('fixed sale-close expiry accepts final-minute %s with modeled two-second provider latency',async(kind)=>{
 const end=new Date(Date.now()+60000);await db.discountCampaign.update({where:{id:campaign.id},data:{endsAt:end}});
 let selected=product.id;
 if(kind==='monthly'){const m=await db.product.create({data:{slug:randomUUID(),name:'Synthetic monthly expiry',description:'Test',kind:'LIMITED_MEMBERSHIP',billingInterval:'MONTHLY',priceCents:9200,stripePriceId:'price_'+randomUUID(),eligibleCategoryIds:[],isPublic:true}});selected=m.id;await db.discountCampaign.update({where:{id:campaign.id},data:{productIds:[product.id,m.id]}})}
 const original=f.create.getMockImplementation()!;
 f.create.mockImplementation(async(params:any,options:any)=>{const reference=Math.floor(Date.now()/1000)+2;expect(params.expires_at-reference).toBeGreaterThanOrEqual(1800);expect(params.expires_at-reference).toBeLessThanOrEqual(86400);return original(params,options)});
 expect(await invoke(campaign.code,selected)).toContain('https://example.invalid/');expect(calls[0].params.expires_at).toBe(Math.floor(end.getTime()/1000)+1800);expect(calls[0].params.mode).toBe(kind==='pack'?'payment':'subscription');
});
it('early sale uses fixed end plus grace and never extends unknown retry',async()=>{
 const end=new Date(Date.now()+7200000);await db.discountCampaign.update({where:{id:campaign.id},data:{endsAt:end}});
 f.create.mockRejectedValueOnce(Error('uncertain'));await invoke();const first=f.create.mock.calls[0];expect(first[0].expires_at).toBe(Math.floor(end.getTime()/1000)+1800);
 expect(await invoke()).toContain('https://example.invalid/');expect(f.create.mock.calls[1]).toEqual(first);
});
it('multi-day sale caps expiry at authorization plus provider 24 hours',async()=>{
 await db.discountCampaign.update({where:{id:campaign.id},data:{endsAt:new Date(Date.now()+172800000)}});
 const before=Math.floor(Date.now()/1000);await invoke();expect(calls[0].params.expires_at).toBeGreaterThanOrEqual(before+86400);expect(calls[0].params.expires_at).toBeLessThanOrEqual(Math.floor(Date.now()/1000)+86400);
});
it('coupon work crossing sale end never authorizes provider issuance',async()=>{
 f.coupon.mockImplementationOnce(async()=>{await db.discountCampaign.update({where:{id:campaign.id},data:{endsAt:new Date(Date.now()-1)}});return {id:'coupon_synthetic',valid:true,amount_off:1375,currency:'usd',duration:'once'}});
 expect(await invoke()).toContain('checkout-error');expect(f.create).not.toHaveBeenCalled();expect(await db.purchase.count({where:{userId:user.id}})).toBe(1);
});
it('concurrent expiry rejection retains identity while earlier create can still succeed',async()=>{
 let entered!:()=>void,release!:()=>void;const held=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);const original=f.create.getMockImplementation()!;
 f.create.mockImplementationOnce(async(...args:any[])=>{entered();await gate;return original(...args)}).mockRejectedValueOnce(Object.assign(Error('expiry rejected'),{type:'StripeInvalidRequestError',param:'expires_at'}));
 const first=invoke();await held;try{expect(await invoke()).toContain('campaign-checkout-expiry');const p=await purchase();expect(p.status).toBe('PENDING');expect(await db.purchase.count({where:{userId:user.id}})).toBe(1);}finally{release()}
 expect(await first).toContain('https://example.invalid/');expect(await invoke()).toContain('https://example.invalid/');expect(f.create.mock.calls[0]).toEqual(f.create.mock.calls[1]);
});
it('known open session is not resumed beyond original expiry and late settlement still grants',async()=>{
 await invoke();const p=await purchase();const [row]=await db.$queryRaw<any[]>`SELECT * FROM "DiscountCheckoutAdmission" WHERE "userId"=${user.id}`;
 const expiry=row.params.expires_at;vi.spyOn(Date,'now').mockReturnValue((expiry+1)*1000);
 try {expect(await invoke()).toContain('campaign-checkout-expiry');await paid(p);expect((await state(p)).accounts).toHaveLength(1);}finally{vi.restoreAllMocks()}
 expect(f.create).toHaveBeenCalledTimes(1);
});
it.each([
 ['inclusive start','2026-01-01T00:00:00.000Z','2026-01-01T02:00:00.000Z','2026-01-01T02:30:00.000Z'],
 ['fractional','2026-01-01T01:59:00.987Z','2026-01-01T02:00:00.999Z','2026-01-01T02:30:00.000Z'],
 ['DST','2026-03-08T06:59:00.000Z','2026-03-08T07:00:00.000Z','2026-03-08T07:30:00.000Z'],
])('deterministic actual action %s stores exact deadline and key',async(_,now,end,deadline)=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(now));
 try {
  await db.discountCampaign.update({where:{id:campaign.id},data:{startsAt:new Date(now),endsAt:new Date(end)}});
  expect(await invoke()).toContain('https://example.invalid/');const p=await purchase();const [admission]=await db.$queryRaw<any[]>`SELECT * FROM "DiscountCheckoutAdmission" WHERE "userId"=${user.id}`;
  expect(admission.params).toEqual(calls[0].params);expect(admission.params.expires_at).toBe(Date.parse(deadline)/1000);expect(calls[0].options.idempotencyKey).toBe('checkout-'+p.id);
 } finally {vi.useRealTimers()}
});
it('deterministic issuance crossing provider reference end rejects without losing attempt',async()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-01-01T01:59:59.000Z'));
 try {
  await db.discountCampaign.update({where:{id:campaign.id},data:{startsAt:new Date('2026-01-01T00:00:00Z'),endsAt:new Date('2026-01-01T02:00:00Z')}});
  f.create.mockImplementation(async(params:any)=>{expect(params.expires_at).toBe(Date.parse('2026-01-01T02:30:00Z')/1000);const reference=Date.parse('2026-01-01T02:00:01Z')/1000;expect(params.expires_at-reference).toBe(1799);throw Object.assign(Error('expiry'),{type:'StripeInvalidRequestError',param:'expires_at'})});
  expect(await invoke()).toContain('campaign-checkout-expiry');const p=await purchase();expect(p.status).toBe('PENDING');expect(await db.purchase.count({where:{userId:user.id}})).toBe(1);
  const [row]=await db.$queryRaw<any[]>`SELECT * FROM "DiscountCheckoutAdmission" WHERE "userId"=${user.id}`;expect(row.purchaseId).toBe(p.id);expect(row.params).toEqual(f.create.mock.calls[0][0]);
 }finally{vi.useRealTimers()}
});
it('ordinary full-price immediate checkout is unchanged',async()=>{
 expect(await invoke('')).toContain('https://example.invalid/');const p=await purchase();expect(p.discountCents).toBe(0);expect(p.amountCents).toBe(9200);expect(p.discountCampaignId).toBeNull();expect(calls[0].params.expires_at).toBeUndefined();expect(calls[0].params.mode).toBe('payment');
});
it('prior paid campaign still respects inherited referral exclusion',async()=>{
 await invoke();await paid(await purchase());expect(await invoke('NOTACAMPAIGN')).toContain('referral-used');
});

it('fixed purchase persists commercial quote and audit',async()=>{await invoke();const p=await purchase();expect(p).toMatchObject({amountCents:7825,discountCents:1375});expect((p as any).discountQuote).toMatchObject({version:1,purpose:'COMMERCIAL',currency:'usd',amountOffCents:1375,percentOff:null,priceCents:9200,amountCents:7825,duration:'once'});expect(await db.auditLog.count({where:{entityId:p.id,action:'DISCOUNT_QUOTED'}})).toBe(1)});
it.each([9200,9300])('fixed amount %s cannot create zero-total purchase',async(amount)=>{await db.discountCampaign.update({where:{id:campaign.id},data:{amountOffCents:amount}});try{expect(await invoke()).toContain('checkout-error');expect(await db.purchase.count({where:{userId:user.id}})).toBe(0);expect(f.create).not.toHaveBeenCalled()}finally{await db.discountCampaign.update({where:{id:campaign.id},data:{amountOffCents:1375}})}});
it('SQL keeps percentage bounds and enforces exclusive positive fixed cents',async()=>{for(const fields of [{percentOff:0,amountOffCents:null},{percentOff:100,amountOffCents:null},{percentOff:null,amountOffCents:0},{percentOff:15,amountOffCents:1375},{percentOff:null,amountOffCents:null}]){await expect(db.discountCampaign.update({where:{id:campaign.id},data:fields})).rejects.toThrow()}});

// Real admin action and database; Stripe is a synthetic local double throughout.
import {createDiscountCampaignAction} from '@/app/(studio)/admin/discounts/actions';
function adminForm(amount='13.75'){const form=new FormData();Object.entries({code:'ADMIN'+randomUUID().replaceAll('-','').slice(0,12).toUpperCase(),discountKind:'FIXED',amountOff:amount,startsAt:'2030-01-01T12:00',endsAt:'2030-01-02T12:00',productIds:product.id}).forEach(([k,v])=>form.set(k,v));return form;}
it('owner creation persists fixed terms and matching audit without provider calls',async()=>{const form=adminForm();await expect(createDiscountCampaignAction(form)).rejects.toThrow('REDIRECT:/admin/discounts?result=created');const c=await db.discountCampaign.findUniqueOrThrow({where:{code:String(form.get('code'))}});expect(c).toMatchObject({amountOffCents:1375,percentOff:null,enabled:false});const audit=await db.auditLog.findFirstOrThrow({where:{entityId:c.id,action:'DISCOUNT_CAMPAIGN_CREATED'}});expect(audit.after).toMatchObject({amountOffCents:1375,percentOff:null});expect(f.create).not.toHaveBeenCalled()});
it('owner creation rejects fixed amount making a selected pack free',async()=>{const form=adminForm('92.00');await expect(createDiscountCampaignAction(form)).resolves.toMatchObject({error:expect.any(String)});expect(await db.discountCampaign.count({where:{code:String(form.get('code'))}})).toBe(0)});
it('product repricing during coupon creation fails closed without overwriting quote',async()=>{f.coupon.mockImplementationOnce(async()=>{await db.product.update({where:{id:product.id},data:{priceCents:9300}});return {id:'coupon_synthetic',valid:true,amount_off:1375,currency:'usd',duration:'once'}});try{expect(await invoke()).toContain('checkout-error');expect(f.create).not.toHaveBeenCalled();expect((await purchase()).amountCents).toBe(7825)}finally{await db.product.update({where:{id:product.id},data:{priceCents:9200}})}});

it('repricing before admission rejects stale provider quote',async()=>{
 const original=db.discountCampaign.findUnique.bind(db.discountCampaign);
 const spy=vi.spyOn(db.discountCampaign,'findUnique').mockImplementationOnce(((async(args:any)=>{const result=await original(args);await db.product.update({where:{id:product.id},data:{priceCents:9300}});return result;}) as typeof db.discountCampaign.findUnique));
 try {expect(await invoke()).toContain('checkout-error');expect(f.create).not.toHaveBeenCalled();expect(await db.purchase.count({where:{userId:user.id}})).toBe(0);}finally{spy.mockRestore();await db.product.update({where:{id:product.id},data:{priceCents:9200}})}
});
it.each(['open','uncertain'])('repriced zero-total catalog retains %s committed recovery',async(kind)=>{
 const original=f.create.getMockImplementation()!;
 if(kind==='uncertain')f.create.mockImplementationOnce(async(...args:any[])=>{await original(...args);throw Error('lost')});
 await invoke();const p=await purchase();const first=f.create.mock.calls[0];
 await db.product.update({where:{id:product.id},data:{priceCents:1375}});
 try {expect(await invoke()).toContain('https://example.invalid/');expect((await purchase()).id).toBe(p.id);expect((await purchase()).amountCents).toBe(7825);if(kind==='uncertain')expect(f.create.mock.calls[1]).toEqual(first);else expect(f.create).toHaveBeenCalledTimes(1);}finally{await db.product.update({where:{id:product.id},data:{priceCents:9200}})}
});
