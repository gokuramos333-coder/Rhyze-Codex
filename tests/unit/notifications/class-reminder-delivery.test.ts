import { describe, expect, it } from 'vitest';
import {
  classReminderIsDeliverable,
  type ClassReminderLookup,
} from '@/lib/notifications/class-reminder-delivery';

const scheduledFor = new Date('2026-08-25T13:00:00.000Z');

describe('class reminder delivery', () => {
  it('does not deliver when the referenced booking is no longer active', async () => {
    const lookup: ClassReminderLookup = async () => false;

    const deliverable = await classReminderIsDeliverable(
      {
        template: 'CLASS_REMINDER',
        userId: 'member-1',
        scheduledFor,
        payload: {
          bookingId: 'booking-1',
          occurrenceId: 'occurrence-1',
          className: 'Power Yoga',
        },
      },
      lookup,
    );

    expect(deliverable).toBe(false);
  });

  it('uses the scheduled class time to protect legacy reminders without booking ids', async () => {
    const seen: Array<{
      userId: string;
      bookingId?: string;
      occurrenceId?: string;
      className?: string;
      classStartsAt?: Date;
    }> = [];
    const lookup: ClassReminderLookup = async (reference) => {
      seen.push(reference);
      return false;
    };

    await classReminderIsDeliverable(
      {
        template: 'CLASS_REMINDER',
        userId: 'member-legacy',
        scheduledFor,
        payload: { className: 'Rhyze Ritmo' },
      },
      lookup,
    );

    expect(seen).toEqual([
      {
        userId: 'member-legacy',
        className: 'Rhyze Ritmo',
        classStartsAt: new Date('2026-08-26T13:00:00.000Z'),
      },
    ]);
  });

  it('blocks a legacy reminder that cannot identify its class', async () => {
    const lookup: ClassReminderLookup = async () => true;

    await expect(
      classReminderIsDeliverable(
        {
          template: 'CLASS_REMINDER',
          userId: 'member-legacy',
          scheduledFor,
          payload: {},
        },
        lookup,
      ),
    ).resolves.toBe(false);
  });

  it('delivers a reminder only while its booking remains active', async () => {
    const lookup: ClassReminderLookup = async (reference) =>
      reference.bookingId === 'booking-active' &&
      reference.occurrenceId === 'occurrence-active';

    await expect(
      classReminderIsDeliverable(
        {
          template: 'CLASS_REMINDER',
          userId: 'member-2',
          scheduledFor,
          payload: {
            bookingId: 'booking-active',
            occurrenceId: 'occurrence-active',
          },
        },
        lookup,
      ),
    ).resolves.toBe(true);
  });

  it('does not apply booking checks to other transactional emails', async () => {
    const lookup: ClassReminderLookup = async () => {
      throw new Error('booking lookup should not run');
    };

    await expect(
      classReminderIsDeliverable(
        {
          template: 'BOOKING_CANCELLATION',
          userId: 'member-1',
          scheduledFor,
          payload: {},
        },
        lookup,
      ),
    ).resolves.toBe(true);
  });
});
