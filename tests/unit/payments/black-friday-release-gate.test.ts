import { afterEach, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type Stripe from 'stripe';
import { startBlackFridayCheckout } from '@/lib/payments/black-friday-checkout';
afterEach(()=>vi.unstubAllEnvs());
it.each([undefined, 'false', 'TRUE'])('blocks new special tickets before database/provider access when the release gate is %s', async value=>{
 vi.stubEnv('RHYZE_BLACK_FRIDAY_SALES_ENABLED',value);
 const db={$transaction:vi.fn(()=>{throw Error('Database accessed');})};
 const provider={checkout:{sessions:{create:vi.fn()}}};
 await expect(startBlackFridayCheckout(db as unknown as PrismaClient,provider as unknown as Stripe,{userId:'fixture',occurrenceId:'cmvv9bp4g0001gt09ewtk8n57',slug:'rhyzology-black-friday-neon-choreo-party-mvv992kn',origin:'http://localhost',ticketType:'PAIR',friend:{fullName:'Fresh Friend',phone:'2015550190'},firstVisitDeclared:true})).rejects.toThrow('not open');
 expect(db.$transaction).not.toHaveBeenCalled();
 expect(provider.checkout.sessions.create).not.toHaveBeenCalled();
});
