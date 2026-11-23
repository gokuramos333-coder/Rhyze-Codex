// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { EventCheckoutButton } from '@/components/checkout/EventCheckoutButton';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('keeps checkout disabled after success while navigation is pending',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,status:200,json:async()=>({url:'#test-checkout-connected'})})));
 render(<EventCheckoutButton slug="ordinary-event"/>);
 fireEvent.click(screen.getByRole('button',{name:'Continue to payment'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Connecting securely…'}).hasAttribute('disabled')).toBe(true));
 await new Promise(resolve=>setTimeout(resolve,0));
 expect(screen.getByRole('button',{name:'Connecting securely…'}).hasAttribute('disabled')).toBe(true);
});
it('updates the visible payable total and seats when choosing a pair or eligible credit',()=>{
 render(<EventCheckoutButton specialTicketSalesEnabled slug="rhyzology-black-friday-neon-choreo-party-mvv992kn" occurrenceId="cmvv9bp4g0001gt09ewtk8n57"/>);
 expect(screen.getByRole('status').textContent).toContain('$25');
 fireEvent.change(screen.getByLabelText('Ticket option'),{target:{value:'PAIR'}});
 expect(screen.getByRole('status').textContent).toContain('$40');
 expect(screen.getByRole('status').textContent).toContain('2 spots');
 fireEvent.click(screen.getByLabelText('Use one VIP event credit + pay $15'));
 expect(screen.getByRole('status').textContent).toContain('credit + $15 · 2 spots');
 fireEvent.change(screen.getByLabelText('Ticket option'),{target:{value:'CREDIT'}});
 expect(screen.getByRole('link',{name:'Continue with VIP event credit'}).getAttribute('href')).toContain('occurrence=cmvv9bp4g0001gt09ewtk8n57');
 expect(screen.getByRole('status').textContent).toContain('event credit');
 fireEvent.change(screen.getByLabelText('Ticket option'),{target:{value:'SINGLE'}});
 expect(screen.getByRole('status').textContent).toContain('$25');
});
it('renders approved prices, requires name phone declaration, and submits an actual pair request',async()=>{
 const fetcher=vi.fn(async(_url: string, _options: RequestInit)=>({ok:false,status:400,json:async()=>({error:'Provider mock'})})); vi.stubGlobal('fetch',fetcher);
 render(<EventCheckoutButton specialTicketSalesEnabled slug="rhyzology-black-friday-neon-choreo-party-mvv992kn" occurrenceId="cmvv9bp4g0001gt09ewtk8n57"/>);
 fireEvent.change(screen.getByLabelText('Ticket option'),{target:{value:'PAIR'}});
 expect(screen.getByText('Me + a NEW friend — $40 total')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Continue to payment'})); expect(fetcher).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Friend’s full name'),{target:{value:'Fresh Friend'}});
 fireEvent.change(screen.getByLabelText('Friend’s phone'),{target:{value:'2015550190'}});
 fireEvent.click(screen.getByLabelText('This is my friend’s first visit'));
 fireEvent.click(screen.getByLabelText('Use one VIP event credit + pay $15'));
 fireEvent.click(screen.getByRole('button',{name:'Continue to payment'}));
 await waitFor(()=>expect(fetcher).toHaveBeenCalled());
 expect(JSON.parse(String(fetcher.mock.calls[0][1].body))).toMatchObject({ticketType:'PAIR',useEventCredit:true,firstVisitDeclared:true,friend:{fullName:'Fresh Friend',phone:'2015550190'}});
});

it.each(['network', 'invalid-json'])('recovers the checkout controls after %s failure without resubmitting', async (failure) => {
 const fetcher = vi.fn(async () => {
  if (failure === 'network') throw new TypeError('Failed to fetch');
  return { ok: false, status: 502, json: async () => { throw new SyntaxError('Invalid JSON'); } };
 });
 vi.stubGlobal('fetch', fetcher);
 render(<EventCheckoutButton specialTicketSalesEnabled slug="rhyzology-black-friday-neon-choreo-party-mvv992kn" occurrenceId="cmvv9bp4g0001gt09ewtk8n57"/>);
 fireEvent.change(screen.getByLabelText('Ticket option'), { target: { value: 'PAIR' } });
 fireEvent.change(screen.getByLabelText('Friend’s full name'), { target: { value: 'Fresh Friend' } });
 fireEvent.change(screen.getByLabelText('Friend’s phone'), { target: { value: '2015550190' } });
 fireEvent.click(screen.getByLabelText('This is my friend’s first visit'));
 fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
 await waitFor(() => expect(screen.getByRole('button', { name: 'Continue to payment' }).hasAttribute('disabled')).toBe(false));
 expect(screen.getByRole('alert').textContent).toMatch(/connection|confirm/i);
 expect((screen.getByLabelText('Friend’s full name') as HTMLInputElement).value).toBe('Fresh Friend');
 expect(fetcher).toHaveBeenCalledTimes(1);
});

it('shows identical paid options for Fishers and does not offer regular class credits',()=>{
 render(<EventCheckoutButton specialTicketSalesEnabled slug="get-fit-with-the-fishers-mw000b75" occurrenceId="schedule-import-12cc3b9897966042d0954cb495b0"/>);
 expect(screen.getByRole('status').textContent).toContain('$25');
 fireEvent.change(screen.getByLabelText('Ticket option'),{target:{value:'CREDIT'}});
 expect(screen.getByRole('link',{name:'Continue with VIP event credit'}).getAttribute('href')).toContain('schedule-import-12cc3b9897966042d0954cb495b0');
 expect(screen.queryByRole('option',{name:/class credit/})).toBeNull();
 fireEvent.change(screen.getByLabelText('Ticket option'),{target:{value:'PAIR'}});
 expect(screen.getByRole('status').textContent).toContain('$40 total · 2 spots');
 expect(screen.getByLabelText('Friend’s full name')).toBeTruthy();
 expect(screen.getByLabelText('Friend’s phone')).toBeTruthy();
});

it.each([
  ['seat-seduction-vanessa', 'schedule-import-d7e5b1377dccf88d1d90068c557d'],
  ['hypnotic-heels-nicole', 'schedule-import-e54e7b12d550433a85e6e7f495ec'],
])('%s offers a 30-dollar single or 50-dollar pair with any named friend', async (slug, occurrenceId) => {
  const fetcher = vi.fn(async (_url: string, _options: RequestInit) => ({
    ok: false, status: 400, json: async () => ({ error: 'Internal Stripe details' }),
  }));
  vi.stubGlobal('fetch', fetcher);
  render(<EventCheckoutButton specialTicketSalesEnabled slug={slug} occurrenceId={occurrenceId} />);
  expect(screen.getByRole('status').textContent).toContain('$30 total');
  fireEvent.change(screen.getByLabelText('Ticket option'), { target: { value: 'PAIR' } });
  expect(screen.getByRole('status').textContent).toContain('$50 total');
  expect(screen.queryByLabelText(/first visit|Use one VIP event credit/)).toBeNull();
  expect(screen.getByText('Each attendee needs a signed waiver.')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Friend’s full name'), { target: { value: 'Returning Friend' } });
  fireEvent.change(screen.getByLabelText('Friend’s phone'), { target: { value: '2015550190' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/start checkout/i));
  expect(document.body.textContent).not.toContain('Internal Stripe details');
  expect(JSON.parse(String(fetcher.mock.calls[0][1].body))).toEqual({
    slug, occurrenceId, ticketType: 'PAIR', friend: { fullName: 'Returning Friend', phone: '2015550190' },
  });
});

it('keeps the December Tricia date single-ticket only', () => {
  render(<EventCheckoutButton specialTicketSalesEnabled slug="tricia" occurrenceId="tricia-dec-4" />);
  expect(screen.queryByLabelText('Ticket option')).toBeNull();
  expect(screen.getByRole('button', { name: 'Continue to payment' })).toBeTruthy();
});
