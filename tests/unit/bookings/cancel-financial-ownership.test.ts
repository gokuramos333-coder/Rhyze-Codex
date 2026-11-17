import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  db: null as any,
  refunded: vi.fn(async () => {}),
}));
vi.mock('@/lib/db/prisma', () => ({
  get prisma() {
    return state.db;
  },
}));
vi.mock('@/lib/auth/session', () => ({
  requireArea: async () => ({
    id: 'u',
    email: 'member@example.test',
    name: 'Member',
  }),
}));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw Error(path);
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/payments/attendance-fee', () => ({
  chargeAttendanceFee: async () => ({
    status: 'SUCCEEDED',
    paymentIntentId: 'fee',
  }),
  refundAttendanceFee: state.refunded,
}));
vi.mock('@/lib/payments/refund-review', () => ({
  confirmAttendanceService: vi.fn(),
}));
vi.mock('@/lib/notifications/email-queue', () => ({ queueEmail: vi.fn() }));
vi.mock('@/lib/notifications/admin-booking-cancellations', () => ({
  notifyAdminBookingCancellation: vi.fn(),
}));
vi.mock('@/lib/domain/bookings/waitlist', () => ({
  notifyWaitlistOpening: vi.fn(),
}));
import { cancelBookingAction } from '@/app/(portal)/member/bookings/actions';
it('does not cancel a transferred booking using the stale charged cancellation policy', async () => {
  const initial = {
    id: 'b',
    userId: 'u',
    occurrenceId: 'before',
    status: 'CONFIRMED',
    updatedAt: new Date(0),
    policySnapshot: { accessType: 'INTRO_TRIAL' },
    occurrence: {
      startAt: new Date(Date.now() + 3600000),
      template: { name: 'Class', isEvent: false },
    },
    user: { stripeCustomerId: 'cus', memberships: [] },
  };
  const current = {
    ...initial,
    occurrenceId: 'after',
    updatedAt: new Date(1000),
  };
  const tx: any = {
    $executeRaw: vi.fn(),
    booking: { findFirst: async () => current, update: vi.fn() },
    attendanceRecord: { deleteMany: vi.fn() },
    emailMessage: { updateMany: vi.fn() },
    creditLedgerEntry: { findFirst: async () => null },
  };
  state.db = {
    booking: { findFirst: async () => initial },
    creditLedgerEntry: { findFirst: async () => null },
    $transaction: async (fn: any) => fn(tx),
  };
  const form = new FormData();
  form.set('bookingId', 'b');
  await expect(cancelBookingAction(form)).rejects.toThrow(/Booking changed/);
  expect(tx.booking.update).not.toHaveBeenCalled();
  expect(state.refunded).toHaveBeenCalledWith(
    expect.objectContaining({ paymentIntentId: 'fee' }),
  );
});
