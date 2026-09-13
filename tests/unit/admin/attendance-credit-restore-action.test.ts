import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    attendanceRecord: { deleteMany: vi.fn() },
    booking: { findFirst: vi.fn(), update: vi.fn() },
    creditAccount: { create: vi.fn() },
    creditLedgerEntry: { findFirst: vi.fn(), create: vi.fn() },
    emailMessage: { updateMany: vi.fn() },
  };
  return {
    tx,
    queueEmail: vi.fn(),
    revalidatePath: vi.fn(),
    transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
});

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({
  redirect: (destination: string) => {
    throw new Error(`redirect:${destination}`);
  },
}));
vi.mock('@/lib/auth/session', () => ({
  requireActiveUser: vi.fn(),
  requireArea: async () => ({ id: 'admin_1', email: 'admin@rhyzefit.com', role: 'ADMIN' }),
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: { $transaction: mocks.transaction },
}));
vi.mock('@/lib/notifications/email-queue', () => ({ queueEmail: mocks.queueEmail }));

import { restoreCreditAction } from '@/app/(portal)/instructor/classes/[occurrenceId]/roster/actions';

describe('admin attendance credit restore action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const booking = {
      id: 'booking_1',
      occurrenceId: 'occurrence_1',
      userId: 'member_1',
      status: 'CONFIRMED',
      cancelledAt: null,
      user: { name: 'Rhyze Member', email: 'member@example.com' },
      occurrence: {
        startAt: new Date('2026-09-15T13:00:00.000Z'),
        timezone: 'America/New_York',
        template: { name: 'Power Yoga with Kenzie', isEvent: false },
      },
    };
    mocks.tx.booking.findFirst.mockResolvedValue(booking);
    mocks.tx.creditLedgerEntry.findFirst
      .mockResolvedValueOnce({ id: 'reserve_1', creditAccountId: 'original_credit_1' })
      .mockResolvedValueOnce(null);
    mocks.tx.creditAccount.create.mockResolvedValue({ id: 'restored_credit_1' });
  });

  it('removes the member from the class and restores one reusable credit atomically', async () => {
    const formData = new FormData();
    formData.set('occurrenceId', 'occurrence_1');
    formData.set('bookingId', 'booking_1');

    await expect(restoreCreditAction(formData)).rejects.toThrow(
      'redirect:/admin/members/member_1?sent=attendance-credit-restored#credits',
    );

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.tx.booking.update).toHaveBeenCalledWith({
      where: { id: 'booking_1' },
      data: { status: 'CANCELLED', cancelledAt: expect.any(Date) },
    });
    expect(mocks.tx.attendanceRecord.deleteMany).toHaveBeenCalledWith({
      where: { bookingId: 'booking_1' },
    });
    expect(mocks.tx.emailMessage.updateMany).toHaveBeenCalledWith({
      where: {
        dedupeKey: 'class-reminder:booking_1:occurrence_1',
        template: 'CLASS_REMINDER',
        status: { in: ['QUEUED', 'PROCESSING'] },
      },
      data: { status: 'CANCELLED' },
    });
    expect(mocks.tx.creditAccount.create).not.toHaveBeenCalled();
    expect(mocks.tx.creditLedgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        creditAccountId: 'original_credit_1',
        bookingId: 'booking_1',
        sourceReturnKey: 'attendance-restore:booking_1',
        type: 'RELEASE',
        quantity: 1,
      }),
    });
  });

  it('creates an event credit when an event booking has no original reservation', async () => {
    mocks.tx.booking.findFirst.mockResolvedValue({
      id: 'booking_event_1',
      occurrenceId: 'occurrence_event_1',
      userId: 'member_1',
      status: 'CONFIRMED',
      cancelledAt: null,
      user: { name: 'Rhyze Member', email: 'member@example.com' },
      occurrence: {
        startAt: new Date('2026-09-15T13:00:00.000Z'),
        timezone: 'America/New_York',
        template: { name: 'TCJ Hip-Hop Happy Hour with Tricia', isEvent: true },
      },
    });
    mocks.tx.creditLedgerEntry.findFirst.mockReset();
    mocks.tx.creditLedgerEntry.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mocks.tx.creditAccount.create.mockReset();
    mocks.tx.creditAccount.create.mockResolvedValue({ id: 'restored_event_credit_1' });

    const formData = new FormData();
    formData.set('occurrenceId', 'occurrence_event_1');
    formData.set('bookingId', 'booking_event_1');

    await expect(restoreCreditAction(formData)).rejects.toThrow(
      'redirect:/admin/members/member_1?sent=attendance-credit-restored#credits',
    );

    expect(mocks.tx.creditAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'member_1',
        label: 'Event credit — TCJ Hip-Hop Happy Hour with Tricia',
      }),
    });
    expect(mocks.tx.creditLedgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        creditAccountId: 'restored_event_credit_1',
        bookingId: 'booking_event_1',
        sourceReturnKey: 'event-cancellation:booking_event_1',
        type: 'GRANT',
        quantity: 1,
      }),
    });
  });
});
