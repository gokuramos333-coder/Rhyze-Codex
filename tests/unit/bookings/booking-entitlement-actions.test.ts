import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(), user: { findUnique: vi.fn(), findFirst: vi.fn() },
    classOccurrence: { findUnique: vi.fn(), findFirst: vi.fn() }, waiverVersion: { findFirst: vi.fn() }, waiverAcceptance: { findUnique: vi.fn() },
    booking: { findUnique: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    membership: { findFirst: vi.fn(), findMany: vi.fn() }, creditAccount: { findMany: vi.fn() },
    creditLedgerEntry: { create: vi.fn(), findFirst: vi.fn() }, auditLog: { create: vi.fn() }, bookingTransfer: { create: vi.fn() },
  };
  return { tx, actor: { id: 'instructor', email: 'instructor@example.test', role: 'INSTRUCTOR' }, queue: vi.fn(), charge: vi.fn() };
});
vi.mock('@/lib/db/prisma', () => ({ prisma: { ...mocks.tx, $transaction: async (fn: (tx: typeof mocks.tx) => unknown) => fn(mocks.tx) } }));
vi.mock('@/lib/auth/session', () => ({ requireArea: async () => mocks.actor, requireApprovedOwner: async () => ({ id: 'admin', email: 'admin@example.test' }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw Error(url); } }));
vi.mock('@/lib/notifications/email-queue', () => ({ queueEmail: mocks.queue }));
vi.mock('@/lib/payments/attendance-fee', () => ({ chargeAttendanceFee: mocks.charge, refundAttendanceFee: vi.fn() }));
import { bookOccurrenceAction } from '@/app/(portal)/member/bookings/actions';
import { addMemberToClassAction } from '@/app/(studio)/admin/schedule/[occurrenceId]/roster/actions';
import { rescheduleMemberBookingAction } from '@/app/(portal)/member/bookings/reschedule/actions';
import { transferBookingAction } from '@/app/(portal)/instructor/classes/[occurrenceId]/transfers/actions';

const now = new Date('2026-09-21T16:00Z');
const end = new Date('2026-10-03T16:00Z');
function fixture(isEvent = false, role = 'INSTRUCTOR') {
  const membership = { id: 'vip', userId: 'instructor', purchaseId: 'paid', status: 'ACTIVE', currentPeriodEnd: end,
    product: { kind: 'VIP' }, purchase: { status: 'PAID', paidAt: now, creditAccount: { isUnlimited: true, validFrom: now, validUntil: end } } };
  const user = { ...mocks.actor, role, status: 'ACTIVE', instructorProfile: { isActive: true }, memberships: [] as typeof membership[] };
  const occurrence = { id: 'class', status: 'SCHEDULED', startAt: new Date('2026-09-22T16:00Z'), endAt: new Date('2026-09-22T16:50Z'), capacity: 25, historicalSignupCount: 0,
    template: { name: 'Test class', isEvent, durationMinutes: 50, slug: 'test' }, instructor: { name: 'Teacher' } };
  mocks.tx.user.findUnique.mockResolvedValue(user); mocks.tx.user.findFirst.mockResolvedValue(user);
  mocks.tx.classOccurrence.findUnique.mockResolvedValue(occurrence);
  mocks.tx.waiverVersion.findFirst.mockResolvedValue({ id: 'waiver' }); mocks.tx.waiverAcceptance.findUnique.mockResolvedValue({ id: 'accepted' });
  mocks.tx.booking.findUnique.mockResolvedValue(null); mocks.tx.booking.findFirst.mockResolvedValue(null); mocks.tx.booking.count.mockResolvedValue(0);
  mocks.tx.booking.create.mockResolvedValue({ id: 'booking' }); mocks.tx.booking.upsert.mockResolvedValue({ id: 'booking' });
  mocks.tx.membership.findFirst.mockResolvedValue(null);
  mocks.tx.membership.findMany.mockImplementation(async () => user.memberships);
  const accounts: any[] = [{ id: 'finite', isUnlimited: false, label: 'Manual class credit', entries: [{ quantity: 1 }], sourcePurchase: null }];
  mocks.tx.creditAccount.findMany.mockResolvedValue(accounts);
  const form = new FormData(); form.set('occurrenceId', 'class'); form.set('memberQuery', 'instructor@example.test');
  return { user, occurrence, membership, accounts, form };
}
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now); });
import { afterEach } from 'vitest';
afterEach(() => vi.useRealTimers());

describe.each([['self', bookOccurrenceAction], ['admin', addMemberToClassAction]] as const)('%s booking entitlement', (_label, action) => {
  it.each(['within', 'end', 'before-start'])('enforces the selected class date for a corrected manual assignment: %s', async position => {
    const f = fixture(false, 'MEMBER');
    const giftEnd = new Date('2027-02-02T04:59:59.999Z');
    const giftStart = position === 'before-start' ? new Date('2026-09-23T16:00Z') : now;
    f.occurrence.startAt = position === 'end' ? giftEnd : position === 'within' ? new Date('2027-02-01T17:00Z') : new Date('2026-09-22T16:00Z');
    f.occurrence.endAt = new Date(f.occurrence.startAt.getTime() + 50 * 60_000);
    f.accounts.splice(0, f.accounts.length, { id: 'gift', label: 'Complimentary regular classes', isUnlimited: true, validFrom: giftStart, validUntil: giftEnd,
      sourcePurchase: { policyAcceptance: { source: 'ADMIN_ASSIGNMENT', accessEndsAt: giftEnd.toISOString() }, product: { kind: 'VIP' },
        membership: { id: 'manual', status: 'ACTIVE', product: { kind: 'MONTHLY_UNLIMITED', customPlanType: 'COMPLIMENTARY_STANDARD' } } } });
    await expect(action(f.form)).rejects.toThrow(position === 'within' ? /confirmed|member-added/ : /access|member-no-credit/);
    if (position !== 'within') {
      expect(mocks.tx.booking.create).not.toHaveBeenCalled(); expect(mocks.tx.booking.upsert).not.toHaveBeenCalled();
    }
  });
  it('uses a September-paid ticket only for its purchased October occurrence, preserving scope in the booking', async () => {
    const f = fixture(false, 'MEMBER');
    f.occurrence.startAt = new Date('2026-10-16T23:30:00Z');
    f.occurrence.endAt = new Date('2026-10-17T00:20:00Z');
    const classTicket = { occurrenceId: 'class', name: 'Soul Line', startAt: f.occurrence.startAt.toISOString(), endAt: f.occurrence.endAt.toISOString(), amountCents: 1500 };
    f.accounts.splice(0, f.accounts.length, { id: 'ticket', label: 'Single-class ticket', isUnlimited: false, validUntil: f.occurrence.endAt, entries: [{ quantity: 1 }], sourcePurchase: { status: 'PAID', refundedAmountCents: 0, paidAt: now, policyAcceptance: { classTicket }, product: { kind: 'DROP_IN', includedCredits: 1 }, membership: null } });
    await expect(action(f.form)).rejects.toThrow(/confirmed|member-added/);
    const saved = _label === 'self' ? mocks.tx.booking.create.mock.calls[0][0].data : mocks.tx.booking.upsert.mock.calls[0][0].create;
    expect(saved.policySnapshot.classTicket).toEqual(classTicket);
    expect(mocks.tx.creditLedgerEntry.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ creditAccountId: 'ticket', quantity: -1 }) }));
  });
  it.each(['REFUNDED', 'PARTIALLY_REFUNDED', 'FAILED', 'REVIEW', 'RESCHEDULED'])('rejects a bound ticket with %s history before reserving credit', async (history) => {
    const f = fixture(false, 'MEMBER');
    const classTicket = { occurrenceId: 'class', name: 'Soul Line', startAt: f.occurrence.startAt.toISOString(), endAt: f.occurrence.endAt.toISOString(), amountCents: 1500 };
    const policy: any = { classTicket };
    if (history === 'REVIEW') policy.classTicketFulfillment = { status: 'REVIEW', reason: 'Class filled' };
    if (history === 'RESCHEDULED') classTicket.startAt = new Date(f.occurrence.startAt.getTime() - 86400000).toISOString();
    f.accounts.splice(0, f.accounts.length, { id: 'ticket', label: 'Single-class ticket', isUnlimited: false, validUntil: null, entries: [{ quantity: 1 }], sourcePurchase: { status: ['REVIEW', 'RESCHEDULED'].includes(history) ? 'PAID' : history, refundedAmountCents: history.includes('REFUNDED') ? 1500 : 0, paidAt: now, policyAcceptance: policy, product: { kind: 'DROP_IN', includedCredits: 1 }, membership: null } });
    await expect(action(f.form)).rejects.toThrow(/access|member-no-credit/);
    expect(mocks.tx.creditLedgerEntry.create).not.toHaveBeenCalled();
    expect(mocks.tx.booking.create).not.toHaveBeenCalled();
    expect(mocks.tx.booking.upsert).not.toHaveBeenCalled();
  });
  it('does not spend a discounted or cancellation-released ticket on another class', async () => {
    const f = fixture(false, 'MEMBER');
    f.accounts.splice(0, f.accounts.length, { id: 'ticket', label: 'Single-class ticket', isUnlimited: false, entries: [{ quantity: 1 }, { quantity: -1 }, { quantity: 1 }], sourcePurchase: { status: 'PAID', refundedAmountCents: 0, paidAt: now, policyAcceptance: { classTicket: { occurrenceId: 'another-class', name: 'Soul Line', startAt: f.occurrence.startAt.toISOString(), endAt: f.occurrence.endAt.toISOString(), amountCents: 1500 } }, product: { kind: 'DROP_IN', includedCredits: 1 }, membership: null } });
    await expect(action(f.form)).rejects.toThrow(/access|member-no-credit/);
    expect(mocks.tx.creditLedgerEntry.create).not.toHaveBeenCalled();
    expect(mocks.tx.booking.create).not.toHaveBeenCalled();
    expect(mocks.tx.booking.upsert).not.toHaveBeenCalled();
  });
  it.each([rescheduleMemberBookingAction, transferBookingAction])('rejects transferring an occurrence-bound ticket before any fee or booking mutation', async (transfer) => {
    const f = fixture(false, 'MEMBER');
    const booking = { id: 'booking', source: 'MEMBER', status: 'CONFIRMED', occurrenceId: 'class', userId: mocks.actor.id, user: f.user, policySnapshot: { classTicket: { occurrenceId: 'class' } }, occurrence: { ...f.occurrence, instructorId: mocks.actor.id } };
    mocks.tx.booking.findUnique.mockResolvedValue(booking);
    mocks.tx.booking.findFirst.mockResolvedValue(booking);
    mocks.tx.creditLedgerEntry.findFirst.mockResolvedValue(null);
    const form = new FormData(); form.set('bookingId', 'booking'); form.set('destinationId', 'expensive-class');
    await expect(transfer(form)).rejects.toThrow(/class-ticket/);
    expect(mocks.charge).not.toHaveBeenCalled();
    expect(mocks.tx.booking.update).not.toHaveBeenCalled();
  });
  it('records bounded gifted VIP provenance without turning the gift into paid VIP or event access', async () => {
    const f = fixture(false, 'MEMBER');
    Object.assign(f.membership, { id: 'rhyze-erika-gifted-vip-membership-2026', purchaseId: null,
      currentPeriodEnd: new Date('2027-02-02T04:59:59.999Z'), product: { kind: 'VIP', slug: 'erika-rivera-gifted-vip' } });
    f.user.memberships.push(f.membership);
    f.accounts.splice(0, 1, { id: 'rhyze-erika-gifted-vip-credit-2026', label: 'UNLIMITED CREDITS VIP', isUnlimited: true, sourcePurchase: null });
    await expect(action(f.form)).rejects.toThrow(/confirmed|member-added/);
    const saved = _label === 'self' ? mocks.tx.booking.create.mock.calls[0][0].data : mocks.tx.booking.upsert.mock.calls[0][0].create;
    expect(saved.policySnapshot.accessType).toBe('VIP');
    f.occurrence.template.isEvent = true;
    await expect(action(f.form)).rejects.toThrow(/access|member-no-credit/);
  });
  it.each([rescheduleMemberBookingAction, transferBookingAction])('keeps approved unlinked September VIP provenance through transfer expiry', async (transfer) => {
    const f = fixture(false, 'MEMBER');
    Object.assign(f.user, { id: 'cmryg3hyn000uw9wrjgudtj7l', instructorProfile: null });
    Object.assign(f.membership, { id: 'cms446vbs006fl709vf1ay2ev', userId: f.user.id, purchaseId: null });
    f.user.memberships.push(f.membership);
    f.accounts.splice(0, 1, { id: 'legacy', isUnlimited: true, label: 'VIP membership — unlimited standard class credits — September 2026', sourcePurchase: null });
    await expect(action(f.form)).rejects.toThrow(/confirmed|member-added/);
    const saved = _label === 'self' ? mocks.tx.booking.create.mock.calls[0][0].data : mocks.tx.booking.upsert.mock.calls[0][0].create;
    const booking = { ...saved, id: 'booking', source: 'MEMBER', status: 'CONFIRMED', occurrenceId: 'class', user: f.user,
      occurrence: { ...f.occurrence, instructorId: mocks.actor.id } };
    mocks.tx.booking.findUnique.mockResolvedValue(booking);
    mocks.tx.booking.findFirst.mockImplementation(async ({ where }: any) => where.id === 'booking' ? booking : null);
    mocks.tx.creditLedgerEntry.findFirst.mockResolvedValue(null);
    mocks.tx.classOccurrence.findFirst.mockResolvedValue({ ...f.occurrence, id: 'destination', startAt: new Date('2026-10-02T16:00Z'), endAt: new Date('2026-10-02T16:50Z') });
    const form = new FormData(); form.set('bookingId', 'booking'); form.set('destinationId', 'destination'); form.set('occurrenceId', 'class');
    await expect(transfer(form)).rejects.toThrow(/reschedule-destination|error=destination/);
    expect(mocks.tx.booking.update).not.toHaveBeenCalled();
    expect(saved.policySnapshot.accessType).toBe('VIP');
  });
  it('books approved instructors free in September without consuming their paid credit', async () => {
    const f = fixture();
    await expect(action(f.form)).rejects.toThrow(/confirmed|member-added/);
    expect(mocks.tx.creditLedgerEntry.create).not.toHaveBeenCalled();
    const call = _label === 'self' ? mocks.tx.booking.create.mock.calls[0][0].data : mocks.tx.booking.upsert.mock.calls[0][0].create;
    expect(call.policySnapshot.accessType).toBe('COMPLIMENTARY');
  });
  it('does not give instructors free events', async () => {
    const f = fixture(true);
    await expect(action(f.form)).rejects.toThrow(/access|member-no-credit/);
    expect(mocks.tx.booking.create).not.toHaveBeenCalled(); expect(mocks.tx.booking.upsert).not.toHaveBeenCalled();
  });
  it('does not give a revoked instructor free access', async () => {
    const f = fixture(); f.user.instructorProfile.isActive = false; f.accounts.length = 0;
    await expect(action(f.form)).rejects.toThrow(/access|member-no-credit/);
  });
  it('rejects stale unlimited credits once a VIP paid period ends', async () => {
    const f = fixture(false, 'MEMBER'); f.membership.currentPeriodEnd = now; f.user.memberships.push(f.membership);
    f.accounts.splice(0, f.accounts.length, { id: 'old-calendar', isUnlimited: true, label: 'VIP membership — unlimited standard class credits — September 2026', sourcePurchase: null });
    await expect(action(f.form)).rejects.toThrow(/access|member-no-credit/);
    expect(mocks.tx.booking.create).not.toHaveBeenCalled(); expect(mocks.tx.booking.upsert).not.toHaveBeenCalled();
  });
  it('allows an actually paid VIP period without charging or reserving another credit', async () => {
    const f = fixture(false, 'MEMBER'); f.user.memberships.push(f.membership);
    f.accounts.splice(0, f.accounts.length, { id: 'paid-account', isUnlimited: true, label: 'VIP', sourcePurchase: { product: { kind: 'VIP' }, membership: { id: 'vip', status: 'ACTIVE' } } });
    await expect(action(f.form)).rejects.toThrow(/confirmed|member-added/);
    expect(mocks.tx.creditLedgerEntry.create).not.toHaveBeenCalled();
  });
});

describe.each([['member', rescheduleMemberBookingAction], ['instructor', transferBookingAction]] as const)('%s transfer fresh entitlement', (_label, transfer) => {
  function transferFixture(snapshot: unknown = { accessType: 'STANDARD', accessProductKind: null }) {
    const f = fixture(false, 'MEMBER'); f.user.memberships.push(f.membership);
    const booking = { id: 'booking', userId: f.user.id, source: 'MEMBER', status: 'CONFIRMED', occurrenceId: 'class', user: f.user, policySnapshot: snapshot,
      occurrence: { ...f.occurrence, instructorId: mocks.actor.id } };
    mocks.tx.booking.findUnique.mockResolvedValue(booking);
    mocks.tx.booking.findFirst.mockImplementation(async ({ where }: any) => where.id === 'booking' ? booking : null);
    mocks.tx.creditLedgerEntry.findFirst.mockResolvedValue(null);
    mocks.tx.classOccurrence.findFirst.mockResolvedValue({ ...f.occurrence, id: 'destination', startAt: new Date('2026-10-04T16:00Z'), endAt: new Date('2026-10-04T16:50Z') });
    const form = new FormData(); form.set('bookingId', 'booking'); form.set('destinationId', 'destination'); form.set('occurrenceId', 'class');
    return { ...f, booking, transferForm: form };
  }
  it('rejects a manual-assignment transfer at expiry before fees or booking mutation', async () => {
    const f = transferFixture({ accessType: 'STANDARD', accessProductKind: 'MONTHLY_UNLIMITED', creditAccountId: 'gift-credit' });
    const giftEnd = new Date('2026-09-30T16:00Z');
    Object.assign(f.membership, { currentPeriodEnd: giftEnd, product: { kind: 'MONTHLY_UNLIMITED', customPlanType: 'COMPLIMENTARY_STANDARD' },
      purchase: { status: 'PAID', paidAt: now, policyAcceptance: { source: 'ADMIN_ASSIGNMENT', accessEndsAt: giftEnd.toISOString() },
        creditAccount: { id: 'gift-credit', isUnlimited: true, validFrom: now, validUntil: giftEnd } } });
    mocks.tx.classOccurrence.findFirst.mockResolvedValue({ ...f.occurrence, id: 'destination', startAt: giftEnd, endAt: new Date(giftEnd.getTime() + 50 * 60_000) });
    await expect(transfer(f.transferForm)).rejects.toThrow(/reschedule-destination|error=destination/);
    expect(mocks.charge).not.toHaveBeenCalled(); expect(mocks.tx.booking.update).not.toHaveBeenCalled();
  });
  it.each([null, { accessType: 'STANDARD', accessProductKind: null }])('rejects expired historic VIP without trustworthy provenance', async snapshot => {
    const f = transferFixture(snapshot); f.membership.status = 'EXPIRED';
    await expect(transfer(f.transferForm)).rejects.toThrow(/reschedule-destination|error=destination/);
    expect(mocks.tx.booking.update).not.toHaveBeenCalled();
  });
  it('allows a finite manual-credit booking despite an unrelated expired VIP', async () => {
    const f = transferFixture(); f.membership.status = 'EXPIRED';
    mocks.tx.creditLedgerEntry.findFirst.mockResolvedValue({ creditAccount: { label: 'Manual credit', sourcePurchase: null } });
    await expect(transfer(f.transferForm)).rejects.toThrow(/rescheduled|transfer=complete/);
    expect(mocks.tx.booking.update).toHaveBeenCalled();
  });
  it('checks fresh member status before charging a transfer fee', async () => {
    const f = transferFixture({ accessType: 'STANDARD', accessProductKind: 'CLASS_PACK' });
    f.booking.occurrence.startAt = new Date(now.getTime() + 3 * 60 * 60_000);
    mocks.tx.user.findUnique.mockResolvedValue({ ...f.user, status: 'DISABLED' });
    await expect(transfer(f.transferForm)).rejects.toThrow(/reschedule-destination|error=destination/);
    expect(mocks.charge).not.toHaveBeenCalled();
  });
  it('rechecks entitlement inside the transfer transaction after a valid preflight', async () => {
    const f = transferFixture({ accessType: 'VIP', accessProductKind: 'VIP' });
    mocks.tx.classOccurrence.findFirst.mockResolvedValue({ ...f.occurrence, id: 'destination' });
    mocks.tx.user.findUnique.mockResolvedValueOnce(f.user).mockResolvedValue({ ...f.user, status: 'DISABLED' });
    await expect(transfer(f.transferForm)).rejects.toThrow(/reschedule-destination|error=destination/);
    expect(mocks.tx.booking.update).not.toHaveBeenCalled();
  });
});
