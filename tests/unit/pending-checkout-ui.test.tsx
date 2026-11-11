// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
afterEach(cleanup);
const offer={id:'purchase-synthetic',name:'Synthetic monthly plan',amountCents:7800,pricingLabel:'$78.00/month for 1 month; then $92.00/month',createdAt:'Nov 11, 2026',hasSession:true};
async function component(action=vi.fn()) {
  const module=await import('@/components/admin/PendingMembershipCheckout').catch(()=>({PendingMembershipCheckout:undefined}));
  expect(module.PendingMembershipCheckout,'pending saved offer and cancellation control must render').toBeTypeOf('function');
  const Component=module.PendingMembershipCheckout!;
  render(<Component userId="synthetic-member" offer={offer} action={action}/>); return action;
}
it('displays saved offer and explicit limited effect before cancellation',async()=>{
  await component();
  expect(screen.getByText(offer.name)).toBeTruthy();expect(screen.getByText(offer.pricingLabel)).toBeTruthy();
  expect(screen.getByText(/does not charge.*cancel an existing membership/i)).toBeTruthy();
  expect(screen.queryByRole('checkbox')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Cancel unfinished checkout'}));
  expect(screen.getByRole('checkbox',{name:/stop this unpaid payment link/i})).toBeTruthy();
  expect((screen.getByRole('button',{name:'Confirm cancellation'}) as HTMLButtonElement).disabled).toBe(true);
});
it('requires reason and explicit confirm, dispatches only saved purchase then disables repeats',async()=>{
  const action=vi.fn(async(_data: FormData)=>{await new Promise<void>(()=>{});});await component(action);
  fireEvent.click(screen.getByRole('button',{name:'Cancel unfinished checkout'}));
  fireEvent.change(screen.getByLabelText('Cancellation reason'),{target:{value:'Correct price'}});
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button',{name:'Confirm cancellation'}));
  await waitFor(()=>expect(action).toHaveBeenCalledTimes(1));
  const data=action.mock.calls[0][0] as FormData;
  expect(Object.fromEntries(data.entries())).toEqual({userId:'synthetic-member',purchaseId:offer.id,reason:'Correct price',confirmed:'yes'});
  expect((screen.getByRole('button',{name:'Checking checkout…'}) as HTMLButtonElement).disabled).toBe(true);
});
it('keep checkout closes confirmation without a mutation',async()=>{
  const action=await component();fireEvent.click(screen.getByRole('button',{name:'Cancel unfinished checkout'}));
  fireEvent.click(screen.getByRole('button',{name:'Keep checkout'}));expect(screen.queryByRole('checkbox')).toBeNull();expect(action).not.toHaveBeenCalled();
});
