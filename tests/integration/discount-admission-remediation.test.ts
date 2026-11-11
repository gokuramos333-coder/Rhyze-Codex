import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { discountDatabaseDeclaration, assertDiscountDatabaseIdentity } from '@/scripts/release/disposable-discount-database';
const declaration = discountDatabaseDeclaration(process.env);
const db = new PrismaClient({ datasourceUrl: declaration.url });
vi.mock('@/lib/db/prisma', () => ({ get prisma() { return db; } }));
import { runDiscountCheckout } from '@/lib/domain/discounts/admission';
const prefix = randomUUID();
let userId: string; let productId: string;
beforeAll(async () => {
 await assertDiscountDatabaseIdentity(db, declaration);
 productId=(await db.product.create({data:{slug:prefix,name:'Synthetic',description:'Test',kind:'CLASS_PACK',billingInterval:'ONE_TIME',priceCents:9200,eligibleCategoryIds:[]}})).id;
});
afterAll(()=>db.$disconnect());
async function fixture() { userId=(await db.user.create({data:{email:`${randomUUID()}@example.invalid`,status:'ACTIVE'}})).id; return userId; }
function args(uid: string, provider: import('@/lib/domain/discounts/admission').DiscountCheckoutInput['create']) { return { userId:uid, productId, code:'TEST15', purchaseData:{userId:uid,productId,amountCents:7820,discountCents:1380}, build:async(purchaseId:string)=>({mode:'payment' as const,metadata:{purchaseId},expires_at:Math.floor(Date.now()/1000)+3600}), create:provider, retrieve:vi.fn().mockResolvedValue({id:'cs_'+uid,url:'https://example.invalid/pay',status:'open'}) }; }
it('sequential retry returns same payable session and purchase',async()=>{
 const uid=await fixture();const create=vi.fn().mockResolvedValue({id:'cs_'+uid,url:'https://example.invalid/pay',status:'open'}); const input=args(uid,create);
 expect(await runDiscountCheckout(input)).toBe('https://example.invalid/pay');
 expect(await runDiscountCheckout(input)).toBe('https://example.invalid/pay');
 expect(create).toHaveBeenCalledTimes(1);
 expect(await db.purchase.count({where:{userId:uid}})).toBe(1);
});
it('unknown provider result retries identical payload and identity, never a new purchase',async()=>{
 const uid=await fixture();const create=vi.fn().mockRejectedValueOnce(Error('connection lost after create')).mockResolvedValue({id:'cs_'+uid,url:'https://example.invalid/pay',status:'open'});const input=args(uid,create);
 await expect(runDiscountCheckout(input)).rejects.toThrow('connection lost');
 await runDiscountCheckout(input);
 expect(create.mock.calls[1]).toEqual(create.mock.calls[0]);
 expect(await db.purchase.count({where:{userId:uid}})).toBe(1);
});
it('concurrent campaign/referral requests cannot allocate different purchases',async()=>{
 const uid=await fixture();let entered!:()=>void;const held=new Promise<void>(r=>entered=r);let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 const create=vi.fn(async()=>{entered();await gate;return {id:'cs_'+uid,url:'https://example.invalid/pay',status:'open'};});
 const input=args(uid,create);const first=runDiscountCheckout(input);await held;
 const other=runDiscountCheckout({...input,code:'OTHERREF'});
 await expect(other).rejects.toThrow('already in progress');release();await first;
 expect(await db.purchase.count({where:{userId:uid}})).toBe(1);
});

it('provider-confirmed expiration permits legitimate new attempt without deleting purchase history',async()=>{
 const uid=await fixture();const create=vi.fn().mockResolvedValue({id:'old_'+uid,url:'https://example.invalid/old',status:'open'});const input=args(uid,create);
 await runDiscountCheckout(input);
 input.retrieve.mockResolvedValue({id:'old_'+uid,url:null,status:'expired'});
 create.mockResolvedValue({id:'new_'+uid,url:'https://example.invalid/new',status:'open'});
 expect(await runDiscountCheckout(input)).toBe('https://example.invalid/new');
 expect(await db.purchase.count({where:{userId:uid}})).toBe(2);
 expect(await db.purchase.count({where:{userId:uid,status:'FAILED'}})).toBe(1);
});
it('unknown outcomes older than provider idempotency retention fail closed',async()=>{
 const uid=await fixture();const create=vi.fn().mockRejectedValue(Error('unknown'));const input=args(uid,create);
 await expect(runDiscountCheckout(input)).rejects.toThrow('unknown');
 await db.$executeRaw`UPDATE "DiscountCheckoutAdmission" SET "createdAt"=now()-interval '25 hours' WHERE "userId"=${uid}`;
 await expect(runDiscountCheckout(input)).rejects.toThrow('reconciliation');
 expect(create).toHaveBeenCalledTimes(1);
});
