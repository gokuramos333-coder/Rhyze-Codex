import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
it('routes every discounted membership checkout through durable admission before creating purchase',()=>{
 const source=readFileSync('app/(portal)/member/membership/actions.ts','utf8');
 expect(source).toContain('await runDiscountCheckout(');
 expect(source.indexOf('await runDiscountCheckout(')).toBeLessThan(source.indexOf('await prisma.purchase.create('));
});
