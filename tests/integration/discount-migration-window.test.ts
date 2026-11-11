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
