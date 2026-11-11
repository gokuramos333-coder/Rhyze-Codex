import { describe, expect, it, vi } from 'vitest';
import * as checkout from '@/lib/domain/memberships/admin-membership-checkout';

const binding = { sessionId: 'cs_test_synthetic', purchaseId: 'purchase', userId: 'member', productId: 'product', customerId: 'cus_synthetic', live: false };
function session(overrides = {}) {
  return { id: binding.sessionId, status: 'open', payment_status: 'unpaid', mode: 'subscription', livemode: false,
    customer: binding.customerId, client_reference_id: binding.purchaseId,
    metadata: { purchaseId: binding.purchaseId, userId: binding.userId, productId: binding.productId, initiatedBy: 'ADMIN' },
    invoice: null, subscription: null, payment_intent: null, ...overrides };
}
const cancel = (...args: unknown[]) => {
  const fn = (checkout as unknown as Record<string, (...args: unknown[]) => unknown>).expireAdminMembershipCheckoutSession;
  expect(fn, 'membership cancellation must verify and expire the exact provider session').toBeTypeOf('function');
  return fn(...args);
};
describe('pending membership checkout expiry proof', () => {
  const emailBinding = { ...binding, customerId: null, customerEmail: 'member@example.test' };
  const emailSession = (overrides = {}) => session({ customer: null, customer_email: emailBinding.customerEmail,
    customer_details: null, metadata: { ...session().metadata, customerEmail: emailBinding.customerEmail }, ...overrides });
  it.each(['open', 'expired'])('accepts email-created %s checkout with null customer and details', async status => {
    const retrieve = vi.fn().mockResolvedValueOnce(emailSession({status})).mockResolvedValueOnce(emailSession({status:'expired'}));
    const expire = vi.fn();
    await expect(cancel(emailBinding,{retrieve,expire})).resolves.toMatchObject({status:'expired',customerId:null});
    expect(expire).toHaveBeenCalledTimes(status === 'open' ? 1 : 0);
  });
  it('accepts matching collected email without requiring customer_details before completion', async () => {
    await expect(cancel(emailBinding,{retrieve:vi.fn().mockResolvedValue(emailSession({status:'expired',customer_details:{email:emailBinding.customerEmail}})),expire:vi.fn()})).resolves.toMatchObject({status:'expired'});
  });
  it.each([
    {customer:'cus_unbound'}, {customer:{id:'cus_unbound'}}, {customer_email:null}, {customer_email:''}, {customer_email:'wrong@example.test'},
    {metadata:{...session().metadata}}, {metadata:{...session().metadata,customerEmail:'wrong@example.test'}},
    {customer_details:{email:'wrong@example.test'}}, {customer_details:{email:null}},
    {client_reference_id:'wrong'}, {metadata:{...session().metadata,customerEmail:emailBinding.customerEmail,userId:'wrong'}},
    {metadata:{...session().metadata,customerEmail:emailBinding.customerEmail,purchaseId:'wrong'}},
    {metadata:{...session().metadata,customerEmail:emailBinding.customerEmail,productId:'wrong'}},
    {metadata:{...session().metadata,customerEmail:emailBinding.customerEmail,initiatedBy:'MEMBER'}},
    {livemode:true}, {mode:'payment'}, {payment_status:'paid'}, {subscription:'sub_any'}, {invoice:'in_any'}, {payment_intent:'pi_any'},
  ])('fails closed for email-created identity/state %j on both reads', async overrides => {
    for (const onReadback of [false,true]) {
      const retrieve=vi.fn(); const expire=vi.fn();
      if (onReadback) retrieve.mockResolvedValueOnce(emailSession());
      retrieve.mockResolvedValue(emailSession({status:'expired',...overrides}));
      await expect(cancel(emailBinding,{retrieve,expire})).rejects.toThrow();
      expect(expire).toHaveBeenCalledTimes(onReadback ? 1 : 0);
    }
  });
  it('does not downgrade a known customer to email proof', async () => {
    await expect(cancel({...emailBinding,customerId:binding.customerId},{retrieve:vi.fn().mockResolvedValue(emailSession({status:'expired'})),expire:vi.fn()})).rejects.toThrow();
  });
  it('rejects absent saved email even when provider metadata and email agree', async () => {
    await expect(cancel({...emailBinding,customerEmail:''},{retrieve:vi.fn().mockResolvedValue(emailSession({status:'expired'})),expire:vi.fn()})).rejects.toThrow();
  });

  it('retrieves, expires open unpaid session, independently retrieves expired proof', async () => {
    const retrieve = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(session({status:'expired'}));
    const expire = vi.fn().mockResolvedValue(session({status:'expired'}));
    await expect(cancel(binding, {retrieve, expire})).resolves.toMatchObject({status:'expired', sessionId:binding.sessionId});
    expect(retrieve.mock.calls).toEqual([[binding.sessionId],[binding.sessionId]]);
    expect(expire).toHaveBeenCalledWith(binding.sessionId, 'admin-checkout-cancel:purchase');
  });
  it('recovers already expired without another expiry', async () => {
    const retrieve = vi.fn().mockResolvedValue(session({status:'expired'})); const expire = vi.fn();
    await expect(cancel(binding,{retrieve,expire})).resolves.toMatchObject({status:'expired'});
    expect(expire).not.toHaveBeenCalled();
  });
  it.each([
    {id:'cs_wrong'}, {customer:'cus_wrong'}, {client_reference_id:'wrong'}, {livemode:true}, {mode:'payment'},
    {metadata:{purchaseId:'purchase',userId:'wrong',productId:'product',initiatedBy:'ADMIN'}},
    {metadata:{purchaseId:'wrong',userId:'member',productId:'product',initiatedBy:'ADMIN'}},
    {metadata:{purchaseId:'purchase',userId:'member',productId:'wrong',initiatedBy:'ADMIN'}},
    {status:'complete'}, {payment_status:'paid'}, {payment_status:'no_payment_required'},
    {invoice:'in_any'}, {subscription:'sub_any'}, {payment_intent:'pi_any'}, {status:null},
  ])('rejects unsafe provider state %j without expiry', async (overrides) => {
    const retrieve=vi.fn().mockResolvedValue(session(overrides)); const expire=vi.fn();
    await expect(cancel(binding,{retrieve,expire})).rejects.toThrow(); expect(expire).not.toHaveBeenCalled();
  });
  it('does not trust expire response if independent read remains open', async () => {
    await expect(cancel(binding,{retrieve:vi.fn().mockResolvedValue(session()),expire:vi.fn().mockResolvedValue(session({status:'expired'}))})).rejects.toThrow();
  });
  it('recovers uncertain expiry only with fresh expired proof', async () => {
    const retrieve=vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(session({status:'expired'}));
    await expect(cancel(binding,{retrieve,expire:vi.fn().mockRejectedValue(Error('timeout'))})).resolves.toMatchObject({status:'expired'});
  });
  it('rejects uncertain expiry when fresh retrieval fails', async () => {
    const retrieve=vi.fn().mockResolvedValueOnce(session()).mockRejectedValue(Error('offline'));
    await expect(cancel(binding,{retrieve,expire:vi.fn().mockRejectedValue(Error('timeout'))})).rejects.toThrow();
  });
  it('revalidates every binding after expiry', async () => {
    const retrieve=vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(session({status:'expired',customer:'wrong'}));
    await expect(cancel(binding,{retrieve,expire:vi.fn()})).rejects.toThrow();
  });
});
