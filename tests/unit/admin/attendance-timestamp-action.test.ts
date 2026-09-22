import { beforeEach, describe, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ booking: null as any, prisma: null as any }));
vi.mock('@/lib/auth/session', () => ({ requireActiveUser: async () => ({ id: 'admin', role: 'ADMIN' }) }));
vi.mock('@/lib/db/prisma', () => ({ get prisma() { return f.prisma; } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw Error(url); } }));
vi.mock('@/lib/payments/attendance-fee', () => ({ chargeAttendanceFee: vi.fn(), refundAttendanceFee: vi.fn() }));
vi.mock('@/lib/notifications/email-queue', () => ({ queueEmail: vi.fn() }));
import { markAttendanceAction } from '@/app/(portal)/instructor/classes/[occurrenceId]/roster/actions';
const original = new Date('2026-09-14T16:23:45Z');
beforeEach(() => {
  f.booking = { id: 'b', userId: 'u', occurrenceId: 'o', source: 'MEMBER', status: 'LATE_CANCELLED', cancelledAt: original,
    attendance: { status: 'LATE_CANCELLED' }, policySnapshot: { accessType: 'STANDARD' },
    user: { email: 'test@example.test', name: 'Test', memberships: [] }, occurrence: { startAt: original, timezone: 'America/New_York', template: { name: 'Class' } } };
  f.prisma = { classOccurrence: { findUnique: async () => ({ instructorId: 'teacher' }) },
    booking: { findFirst: async () => f.booking, update: async ({ data }: any) => Object.assign(f.booking, data) },
    attendanceRecord: { count: async () => 0, deleteMany: async () => { f.booking.attendance = null; }, upsert: async ({ update }: any) => { f.booking.attendance = update; } },
    creditLedgerEntry: { findFirst: async () => null }, paymentRecord: { findFirst: async () => null },
    $transaction: async (fn: any) => fn(f.prisma) };
});
describe('attendance changes retain original cancellation history', () => {
  it.each(['NO_SHOW', 'CHECKED_IN', 'LATE_CANCELLED'])('preserves timestamp through late → %s → late', async (status) => {
    const form = new FormData(); form.set('bookingId', 'b'); form.set('occurrenceId', 'o'); form.set('status', status);
    await markAttendanceAction(form).catch(error => { if (!String(error).includes('result=')) throw error; });
    expect(f.booking.cancelledAt).toEqual(original);
    form.set('status', 'LATE_CANCELLED');
    await markAttendanceAction(form).catch(error => { if (!String(error).includes('result=')) throw error; });
    expect(f.booking.cancelledAt).toEqual(original);
  });
});
