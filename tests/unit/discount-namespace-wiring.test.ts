import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
it.each(['app/(studio)/admin/instructors/actions.ts','scripts/sync-owned-catalog.ts'])('referral generator reads shared reserved namespace: %s',path=>{
 expect(readFileSync(path,'utf8')).toContain('SELECT "code" FROM "DiscountCodeNamespace"');
});
it('checkout rejects legacy ambiguous normalized codes before choosing a campaign',()=>{
 const text=readFileSync('app/(portal)/member/membership/actions.ts','utf8');
 expect(text).toContain('discountCodeIsAmbiguous');
 expect(text.indexOf('await discountCodeIsAmbiguous')).toBeLessThan(text.indexOf('await prisma.discountCampaign.findUnique'));
});
