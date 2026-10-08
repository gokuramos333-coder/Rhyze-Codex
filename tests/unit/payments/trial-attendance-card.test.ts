import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({booking:vi.fn(),account:vi.fn(),purchases:vi.fn(),intent:vi.fn(),method:vi.fn()}));
vi.mock('@/lib/db/prisma',()=>({prisma:{booking:{findFirst:mocks.booking},creditAccount:{findFirst:mocks.account},purchase:{findMany:mocks.purchases}}}));
vi.mock('@/lib/payments/stripe',()=>({getStripe:()=>({paymentIntents:{retrieve:mocks.intent},paymentMethods:{retrieve:mocks.method}})}));
import { resolveTrialAttendancePaymentSource } from '@/lib/payments/trial-attendance-card';
const purchase={id:'purchase',userId:'member',status:'PAID',amountCents:700,currency:'usd',refundedAmountCents:0,stripePaymentIntentId:'pi_trial',policyAcceptance:{savedPaymentMethodConsent:true},product:{kind:'INTRO_TRIAL'}};
beforeEach(()=>{
 vi.resetAllMocks();
 mocks.booking.mockResolvedValue({source:'MEMBER',policySnapshot:{accessType:'INTRO_TRIAL',creditAccountId:'account'},user:{memberships:[]}});
 mocks.account.mockResolvedValue({sourcePurchase:purchase});
 mocks.intent.mockResolvedValue({status:'succeeded',amount_received:700,currency:'usd',customer:'cus_trial',payment_method:'pm_trial',metadata:{purchaseId:'purchase',userId:'member'}});
 mocks.method.mockResolvedValue({type:'card',customer:'cus_trial'});
});
describe('trial card provenance',()=>{
 it('resolves the saved card from the exact paid trial behind the booking',async()=>{
  expect(await resolveTrialAttendancePaymentSource({bookingId:'booking',userId:'member'})).toEqual({isTrial:true,customerId:'cus_trial',paymentMethodId:'pm_trial'});
  expect(mocks.account).toHaveBeenCalledWith(expect.objectContaining({where:{id:'account',userId:'member'}}));
  expect(mocks.intent).toHaveBeenCalledWith('pi_trial');
 });
 it.each(['detached','wrong-customer'])('does not use an %s card',async reason=>{
  mocks.method.mockResolvedValue({type:'card',customer:reason==='detached'?null:'cus_other'});
  expect(await resolveTrialAttendancePaymentSource({bookingId:'booking',userId:'member'})).toEqual({isTrial:true});
 });
 it('never follows an account belonging to another member',async()=>{
  mocks.account.mockResolvedValue(null);
  expect(await resolveTrialAttendancePaymentSource({bookingId:'booking',userId:'member'})).toEqual({isTrial:true});
  expect(mocks.intent).not.toHaveBeenCalled();expect(mocks.purchases).not.toHaveBeenCalled();
 });
 it.each([{status:'PENDING'},{policyAcceptance:null},{refundedAmountCents:700}])('requires a paid unrefunded consented purchase: %j',async patch=>{
  mocks.account.mockResolvedValue({sourcePurchase:{...purchase,...patch}});
  expect(await resolveTrialAttendancePaymentSource({bookingId:'booking',userId:'member'})).toEqual({isTrial:true});
  expect(mocks.intent).not.toHaveBeenCalled();
 });
 it('rejects a provider payment amount mismatch',async()=>{
  mocks.intent.mockResolvedValue({status:'succeeded',amount_received:1,currency:'usd',customer:'cus_trial',payment_method:'pm_trial'});
  expect(await resolveTrialAttendancePaymentSource({bookingId:'booking',userId:'member'})).toEqual({isTrial:true});
 });
 it('does not guess among multiple legacy trial purchases',async()=>{
  mocks.booking.mockResolvedValue({source:'MEMBER',policySnapshot:{accessType:'INTRO_TRIAL'},user:{memberships:[]}});
  mocks.purchases.mockResolvedValue([purchase,purchase]);
  expect(await resolveTrialAttendancePaymentSource({bookingId:'booking',userId:'member'})).toEqual({isTrial:true});
 });
 it('leaves nontrial and complimentary card selection unchanged',async()=>{
  mocks.booking.mockResolvedValue({source:'OWNER_COMPLIMENTARY',policySnapshot:{accessType:'INTRO_TRIAL'},user:{memberships:[]}});
  expect(await resolveTrialAttendancePaymentSource({bookingId:'booking',userId:'member'})).toBeNull();
  expect(mocks.intent).not.toHaveBeenCalled();
 });
});
