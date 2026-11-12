import { beforeAll, afterAll, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { discountDatabaseDeclaration, assertDiscountDatabaseIdentity } from '@/scripts/release/disposable-discount-database';
const declaration=discountDatabaseDeclaration(process.env);
const db=new PrismaClient({datasourceUrl:declaration.url});
beforeAll(()=>assertDiscountDatabaseIdentity(db,declaration));
afterAll(()=>db.$disconnect());
const campaign=(ms:number)=>({code:'WINDOW'+randomUUID().replaceAll('-','').slice(0,16).toUpperCase(),percentOff:15,productIds:['synthetic'],startsAt:new Date('2030-01-01T00:00:00Z'),endsAt:new Date(Date.parse('2030-01-01T00:00:00Z')+ms)});
it.each([1,60000,600000])('exact migrated SQL accepts positive interval %s ms',async ms=>{
 await expect(db.discountCampaign.create({data:campaign(ms)})).resolves.toHaveProperty('id');
});
it.each([0,-1])('exact migrated SQL rejects nonpositive interval %s ms',async ms=>{
 await expect(db.discountCampaign.create({data:campaign(ms)})).rejects.toThrow('DiscountCampaign_window');
});
it('migrated SQL preserves old once defaults and accepts independent unlimited redemption/benefit',async()=>{
 const legacy=await db.discountCampaign.create({data:campaign(60000)});expect(legacy.duration).toBe('once');expect(legacy.durationMonths).toBeNull();
 const lifetime=await db.discountCampaign.create({data:{...campaign(60000),endsAt:null,duration:'forever'}});expect(lifetime.endsAt).toBeNull();
 const limited=await db.discountCampaign.create({data:{...campaign(60000),duration:'repeating',durationMonths:3}});expect(limited.durationMonths).toBe(3);
});
it.each([{duration:'bad'},{duration:'repeating'},{duration:'repeating',durationMonths:0},{duration:'repeating',durationMonths:601},{duration:'forever',durationMonths:3},{duration:'once',durationMonths:1}])('SQL rejects invalid financial duration %j',async terms=>{
 await expect(db.discountCampaign.create({data:{...campaign(60000),...terms}})).rejects.toThrow('DiscountCampaign_duration_check');
});
