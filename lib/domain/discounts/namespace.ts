import { prisma } from '@/lib/db/prisma';
// Legacy collisions must fail closed even before a blocked migration is resolved.
export async function discountCodeIsAmbiguous(code: string) {
 const rows = await prisma.$queryRaw<{n:bigint}[]>`SELECT count(*) AS n FROM (SELECT "id" FROM "DiscountCampaign" WHERE upper(btrim("code"))=${code.trim().toUpperCase()} UNION ALL SELECT "id" FROM "ReferralCode" WHERE upper(btrim("code"))=${code.trim().toUpperCase()}) matches`;
 return Number(rows[0].n) > 1;
}
