import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createServer } from 'node:http';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';
import { writeFileSync, readFileSync, readdirSync } from 'node:fs';
const f = vi.hoisted(() => ({ owner: vi.fn(), coupon: vi.fn(), checkout: vi.fn() }));
const db = new PrismaClient({ datasourceUrl: 'postgresql://gokuramos@127.0.0.1:51583/discount_campaign_test' });
vi.mock('@/lib/db/prisma', () => ({ get prisma() { return db; } }));
vi.mock('@/lib/auth/session', () => ({ requireApprovedOwner: f.owner, requireArea: f.owner }));
vi.mock('@/lib/payments/stripe', () => ({ stripeIsConfigured: () => true, getStripe: () => ({ coupons: {retrieve:async()=>{throw {code:'resource_missing'};},create:f.coupon},checkout:{sessions:{create:f.checkout}} }) }));
vi.mock('@/lib/notifications/email-queue', () => ({ queueEmail: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (s: string) => { throw Error(`redirect:${s}`); } }));
import { createDiscountCampaignAction, setDiscountCampaignEnabledAction } from '@/app/(studio)/admin/discounts/actions';
import DiscountsPage from '@/app/(studio)/admin/discounts/page';
import { startCheckoutAction } from '@/app/(portal)/member/membership/actions';
import { processStripeEvent } from '@/lib/payments/webhook-processor';
import type Stripe from 'stripe';
const ownerId='discount-synthetic-owner';
const productId='discount-synthetic-monthly';
function data(code='SYNTHETIC15') { const d=new FormData(); Object.entries({code, percentOff:'15', startsAt:'2030-11-10T12:00', endsAt:'2030-11-11T12:00',productIds:productId}).forEach(([k,v])=>d.set(k,v)); return d; }
beforeAll(async () => {
 if (process.env.NODE_ENV !== 'test') throw Error('Test only');
 const [identity] = await db.$queryRawUnsafe<{db:string;host:string;port:number;dir:string}[]>("SELECT current_database() AS db, host(inet_server_addr()) AS host, inet_server_port() AS port, current_setting('data_directory') AS dir");
 expect(identity).toEqual({db:'discount_campaign_test',host:'127.0.0.1',port:51583,dir:'/Users/gokuramos/Inbox/rhyze-discount-code-admin/discount-pg'});
 await db.paymentRecord.deleteMany({where:{userId:ownerId}});
 await db.creditLedgerEntry.deleteMany({where:{creditAccount:{userId:ownerId}}});
 await db.creditAccount.deleteMany({where:{userId:ownerId}});
 await db.membership.deleteMany({where:{userId:ownerId}});
 await db.purchase.deleteMany({where:{userId:ownerId}});
 await db.referralAttribution.deleteMany({where:{referredUserId:ownerId}});
 await db.auditLog.deleteMany({where:{entityType:'DiscountCampaign',actorId:ownerId}});
 await db.discountCampaign.deleteMany({where:{code:{in:['SYNTHETIC15','SYNTHETICBROWSER','SYNTHETICCHECKOUT']}}});
 await db.user.upsert({where:{id:ownerId},update:{},create:{id:ownerId,email:'discount-owner@example.invalid',name:'Synthetic owner',role:'ADMIN',status:'ACTIVE'}});
 await db.product.upsert({where:{id:productId},update:{},create:{id:productId,slug:productId,name:'Synthetic monthly',description:'Synthetic only',kind:'LIMITED_MEMBERSHIP',billingInterval:'MONTHLY',priceCents:9200,eligibleCategoryIds:[]}});
 f.owner.mockResolvedValue({id:ownerId,email:'discount-owner@example.invalid',role:'ADMIN'});
});
afterAll(async()=>{ await db.$disconnect(); });
it('actual monthly/pack checkout persists exact campaign accounting with mocked provider only',async()=>{
 await db.product.update({where:{id:productId},data:{stripePriceId:'price_synthetic_monthly'}});
 const pack=await db.product.upsert({where:{id:'discount-synthetic-pack'},update:{},create:{id:'discount-synthetic-pack',slug:'discount-synthetic-pack',name:'Synthetic pack',description:'Synthetic only',kind:'CLASS_PACK',billingInterval:'ONE_TIME',priceCents:9200,eligibleCategoryIds:[],includedCredits:8}});
 const waiver=await db.waiverVersion.upsert({where:{version:1},update:{isActive:true},create:{version:1,title:'Synthetic waiver',body:'Synthetic only',effectiveAt:new Date(),isActive:true,requiresSign:true}});
 await db.waiverAcceptance.upsert({where:{waiverVersionId_userId:{waiverVersionId:waiver.id,userId:ownerId}},update:{},create:{waiverVersionId:waiver.id,userId:ownerId,signedDate:new Date()}});
 const c=await db.discountCampaign.create({data:{code:'SYNTHETICCHECKOUT',percentOff:15,enabled:true,startsAt:new Date(Date.now()-60000),endsAt:new Date(Date.now()+86400000),productIds:[productId,pack.id]}});
 f.coupon.mockResolvedValue({id:'coupon_synthetic'});
 for (const id of [productId,pack.id]) {
  f.checkout.mockResolvedValue({id:`cs_${id}`,url:'https://checkout.example.invalid/synthetic'});
  const d=new FormData();d.set('productId',id);d.set('referralCode',c.code);
  await expect(startCheckoutAction(d)).rejects.toThrow('redirect:https://checkout.example.invalid/synthetic');
  const p=await db.purchase.findUniqueOrThrow({where:{stripeCheckoutSessionId:`cs_${id}`}});
  expect(p).toMatchObject({status:'PENDING',discountCampaignId:c.id,amountCents:7820,discountCents:1380});
 }
 expect(await db.referralAttribution.count({where:{referredUserId:ownerId}})).toBe(0);
 const referral=await db.referralCode.upsert({where:{code:'SYNTHETICOLDREF'},update:{},create:{code:'SYNTHETICOLDREF',instructorId:ownerId}});
 await db.referralAttribution.create({data:{referredUserId:ownerId,referralCodeId:referral.id}});
 // Explicit synthetic events, NOT provider receipts. Preserve invoice-funded
 // recurring credits, and ensure old referral attribution cannot earn commission.
 for (const id of [productId,pack.id]) {
  const purchase=await db.purchase.findUniqueOrThrow({where:{stripeCheckoutSessionId:`cs_${id}`}});
  const event={id:`evt_synthetic_${id}`,type:'checkout.session.completed',created:Math.floor(Date.now()/1000),data:{object:{id:`cs_${id}`,payment_status:'paid',amount_total:7820,currency:'usd',total_details:{amount_discount:1380,amount_tax:0},payment_intent:id===pack.id?'pi_synthetic_pack':null,subscription:id===productId?'sub_synthetic_monthly':null,metadata:{purchaseId:purchase.id}}}} as unknown as Stripe.Event;
  await db.$transaction(tx=>processStripeEvent(tx,event));
  await db.$transaction(tx=>processStripeEvent(tx,event));
  expect((await db.purchase.findUniqueOrThrow({where:{id:purchase.id}})).amountCents).toBe(7820);
 }
 expect(await db.creditLedgerEntry.count({where:{creditAccount:{userId:ownerId},type:'GRANT'}})).toBe(1);
 expect(await db.creditLedgerEntry.aggregate({where:{creditAccount:{userId:ownerId},type:'GRANT'},_sum:{quantity:true}})).toMatchObject({_sum:{quantity:8}});
 expect(await db.creditAccount.count({where:{sourcePurchase:{productId}}})).toBe(0);
 expect(await db.referralCommission.count({where:{referredUserId:ownerId}})).toBe(0);
});
it('denies owner page before data access when guard rejects', async()=>{
 f.owner.mockRejectedValueOnce(Error('denied'));
 await expect(DiscountsPage()).rejects.toThrow('denied');
});
it('creates disabled campaign with durable audited Eastern terms, rejects duplicates and toggles',async()=>{
 await expect(createDiscountCampaignAction(data())).rejects.toThrow('redirect:/admin/discounts?result=created');
 const c=await db.discountCampaign.findUniqueOrThrow({where:{code:'SYNTHETIC15'}});
 expect(c).toMatchObject({percentOff:15,enabled:false,productIds:[productId],startsAt:new Date('2030-11-10T17:00:00Z')});
 expect(await db.auditLog.count({where:{entityId:c.id,actorId:ownerId,action:'DISCOUNT_CAMPAIGN_CREATED'}})).toBe(1);
 await expect(createDiscountCampaignAction(data())).rejects.toThrow();
 for (const enabled of ['true','false']) { const d=new FormData();d.set('id',c.id);d.set('enabled',enabled); await expect(setDiscountCampaignEnabledAction(d)).rejects.toThrow('result=updated'); expect((await db.discountCampaign.findUniqueOrThrow({where:{id:c.id}})).enabled).toBe(enabled==='true'); }
});
it('rejects unsupported product without creating a campaign',async()=>{
 const d=data('SYNTHETICBAD');d.set('productIds','missing-product');
 await expect(createDiscountCampaignAction(d)).rejects.toThrow('Select active');
 expect(await db.discountCampaign.count({where:{code:'SYNTHETICBAD'}})).toBe(0);
});
it('actual Chromium submits rendered owner form to actual action with disposable DB only', async()=>{
 const css = readdirSync('.next-build/static/css').filter(name=>name.endsWith('.css')).map(name=>readFileSync(`.next-build/static/css/${name}`,'utf8')).join('\n');
 const server=createServer(async(req,res)=>{
  res.setHeader('Content-Type','text/html; charset=utf-8');
  try {
   if(req.method==='POST') { let body='';for await(const chunk of req)body+=chunk;const d=new FormData();for(const[k,v]of new URLSearchParams(body))d.append(k,v);try{await (d.has('id') ? setDiscountCampaignEnabledAction(d) : createDiscountCampaignAction(d));}catch(e){if(!String(e).includes('redirect:'))throw e;} }
   res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic Discounts local milestone</title><style>'+css+'</style><h1>SYNTHETIC ONLY — provider not connected</h1>'+renderToStaticMarkup(await DiscountsPage()));
  }catch(e){res.statusCode=500;res.end(String(e));}
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();if(!address||typeof address==='string')throw Error('No server');
 const origin=`http://127.0.0.1:${address.port}`;
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
  await page.goto(origin);
  await page.getByLabel('Code',{exact:true}).fill('SYNTHETICBROWSER');
  await page.getByLabel('Percent off').fill('15');
  await page.getByLabel('Redemption starts (Eastern)',{exact:true}).fill('2030-11-10T12:00');
  await page.getByLabel('Redemption ends (Eastern, exclusive)').fill('2030-11-11T12:00');
  await page.getByLabel('Synthetic monthly',{exact:true}).check();
  // Local diagnostic transport replaces Next's action encoding, not its controls/action implementation.
  await page.locator('form').first().evaluate(form=>{form.setAttribute('action','/');form.setAttribute('method','POST');});
  await page.getByRole('button',{name:'Create disabled code'}).click();
  await page.getByRole('heading',{name:'SYNTHETICBROWSER',exact:true}).waitFor();
  expect(await db.discountCampaign.count({where:{code:'SYNTHETICBROWSER',enabled:false}})).toBe(1);
  const section=page.locator('section').filter({has:page.getByRole('heading',{name:'SYNTHETICBROWSER',exact:true})});
  for (const label of ['Enable code','Disable new checkouts']) {
   await section.locator('form').evaluate(form=>{form.setAttribute('action','/');form.setAttribute('method','POST');});
   await section.getByRole('button',{name:label,exact:true}).click();
   await section.getByRole('button',{name:label==='Enable code'?'Disable new checkouts':'Enable code',exact:true}).waitFor();
  }
  expect(await db.discountCampaign.count({where:{code:'SYNTHETICBROWSER',enabled:false}})).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:'../synthetic-discounts-mobile.png',fullPage:true});
  await page.setViewportSize({width:1280,height:900});
  await page.screenshot({path:'../synthetic-discounts-desktop.png',fullPage:true});
  writeFileSync('../synthetic-discounts-browser.json',JSON.stringify({actualComponent:'DiscountsPage + DiscountCampaignForm',actualAction:'createDiscountCampaignAction',database:'owned loopback disposable',provider:'not contacted',transport:'diagnostic HTTP adapter, NOT full Next authentication/actions',createdCode:'SYNTHETICBROWSER (local DB only)',screenshot:'synthetic-discounts-mobile.png'},null,2));
 }finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
},30000);
