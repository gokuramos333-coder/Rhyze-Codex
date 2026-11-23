import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ findOccurrence: vi.fn(), create: vi.fn(), order: vi.fn(), update: vi.fn() }));
vi.mock('@/auth', () => ({ auth: async () => ({ user: { id: 'member' } }) }));
vi.mock('@/lib/payments/stripe', () => ({ stripeIsConfigured: () => true, getStripe: () => ({ checkout: { sessions: { create: mocks.create } } }) }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  classOccurrence: { findFirst: async (args: unknown) => { mocks.findOccurrence(args); return ({ id: (args as {where:{id?:string}}).where.id ?? 'event', startAt: new Date('2099-01-01'), status: 'SCHEDULED', capacity: 20, priceCents: 3000, historicalSignupCount: 0, template: { name: 'Hip Hop', slug: 'hip-hop', isEvent: true }, _count: { bookings: 0 } }); } },
  user: { findUniqueOrThrow: async () => ({ id: 'member', name: 'Member', email: 'member@example.test', stripeCustomerId: 'cus_existing' }) },
  waiverVersion: { findFirst: async () => ({ id: 'waiver' }) }, waiverAcceptance: { findUnique: async () => ({ id: 'accepted' }) },
  booking: { findUnique: async () => null }, commerceOrder: { create: mocks.order, update: mocks.update },
} }));
import { POST } from '@/app/api/checkout/event/route';
beforeEach(() => { vi.clearAllMocks(); mocks.order.mockResolvedValue({ id: 'order' }); mocks.create.mockResolvedValue({ id: 'cs_session', url: 'https://checkout.stripe.com/example' }); mocks.update.mockResolvedValue({}); });
afterEach(()=>vi.unstubAllEnvs());
it.each([{}, {ticketType:'PAIR',friend:{fullName:'New Friend',phone:'2015550189'},firstVisitDeclared:true}])('keeps canonical sales closed without falling back to a legacy single when disabled: %j',async extra=>{
 vi.stubEnv('RHYZE_BLACK_FRIDAY_SALES_ENABLED','false');
 const response=await POST(new Request('https://rhyzefitness.com/api/checkout/event',{method:'POST',body:JSON.stringify({slug:'rhyzology-black-friday-neon-choreo-party-mvv992kn',occurrenceId:'cmvv9bp4g0001gt09ewtk8n57',...extra})}));
 expect(response.status).toBe(503);
 expect(mocks.order).not.toHaveBeenCalled();
 expect(mocks.create).not.toHaveBeenCalled();
});
it('omits Link on the actual event Checkout request while preserving its amount and member/order metadata', async () => {
  const response = await POST(new Request('https://rhyzefitness.com/api/checkout/event', { method: 'POST', body: JSON.stringify({ slug: 'hip-hop' }) }));
  expect(response.status).toBe(200);
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ wallet_options: { link: { display: 'never' } }, mode: 'payment', customer: 'cus_existing', metadata: expect.objectContaining({ commerceOrderId: 'order', occurrenceId: 'event', userId: 'member' }), line_items: [expect.objectContaining({ price_data: expect.objectContaining({ unit_amount: 3000 }) })] }), { idempotencyKey: 'event-checkout-order' });
  expect(mocks.create.mock.calls[0][0]).not.toHaveProperty('payment_method_types');
});

it.each([
  { ticketType: 'PAIR', friend: { fullName: 'New Friend', phone: '(201) 555-0123' } },
  { amountCents: 1 },
  { useEventCredit: true },
])('never silently downgrades unsupported pair/credit/price input to a charged single: %j', async extra => {
  const response = await POST(new Request('https://rhyzefitness.com/api/checkout/event', { method: 'POST', body: JSON.stringify({ slug: 'hip-hop', ...extra }) }));
  expect(response.status).toBe(400);
  expect(mocks.order).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});

it('pins checkout to the selected date instead of silently buying the earliest event', async () => {
 const response = await POST(new Request('https://rhyzefitness.com/api/checkout/event', { method: 'POST', body: JSON.stringify({ slug: 'hip-hop', occurrenceId: 'later-event' }) }));
 expect(response.status).toBe(200);
 expect(mocks.findOccurrence).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'later-event', template: expect.objectContaining({ slug: 'hip-hop' }), status: 'SCHEDULED' }) }));
});

it('keeps provider diagnostics out of the buyer checkout error',async()=>{
  mocks.create.mockRejectedValueOnce(new Error('private provider diagnostic: pi_synthetic_secret'));
  const response=await POST(new Request('http://localhost/api/checkout/event',{method:'POST',body:JSON.stringify({slug:'hip-hop'})}));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({error:'We couldn’t start checkout. Please check your bookings or contact the studio for help.'});
});
