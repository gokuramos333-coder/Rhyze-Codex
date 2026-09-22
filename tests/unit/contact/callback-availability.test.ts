import { describe, expect, it } from 'vitest';
import {
  buildCallbackAvailability,
  callbackWindow,
  callbackDateKey,
} from '@/lib/domain/contact/callback-availability';

const now = new Date('2026-09-21T09:00:00Z'); // Monday, 5 AM Eastern
const slots = (
  date: string,
  busy: Parameters<typeof buildCallbackAvailability>[1] = [],
  reserved: Parameters<typeof buildCallbackAvailability>[2] = [],
) =>
  buildCallbackAvailability(now, busy, reserved).days.find(
    (day) => day.date === date,
  )!.slots;

describe('callback availability', () => {
  it('offers 15-minute calls from 9 AM until the weekday closing time', () => {
    const monday = slots('2026-09-21');
    expect(monday).toHaveLength(44);
    expect(monday[0]).toBe('2026-09-21T13:00:00.000Z');
    expect(monday.at(-1)).toBe('2026-09-21T23:45:00.000Z');
  });
  it('uses shorter weekend hours', () => {
    const saturday = slots('2026-09-26');
    expect(saturday).toHaveLength(20);
    expect(saturday[0]).toBe('2026-09-26T13:00:00.000Z');
    expect(saturday.at(-1)).toBe('2026-09-26T17:45:00.000Z');
    expect(slots('2026-09-27')).toHaveLength(20);
  });
  it.each([
    '2026-09-21',
    '2026-09-22',
    '2026-09-23',
    '2026-09-24',
    '2026-09-25',
    '2026-09-26',
    '2026-09-27',
  ])('never offers a callback before 9 AM Eastern on %s', (date) => {
    const available = slots(date);
    expect(available[0]).toBe(`${date}T13:00:00.000Z`);
    expect(available.some((time) => time < `${date}T13:00:00.000Z`)).toBe(
      false,
    );
  });
  it('blocks classes and events with a 15-minute buffer on either side', () => {
    const available = slots('2026-09-21', [
      {
        startAt: new Date('2026-09-21T15:00Z'),
        endAt: new Date('2026-09-21T15:50Z'),
        status: 'SCHEDULED',
      },
    ]);
    expect(available).toContain('2026-09-21T14:30:00.000Z');
    for (const time of ['14:45', '15:00', '15:15', '15:30', '15:45', '16:00']) {
      expect(available).not.toContain(`2026-09-21T${time}:00.000Z`);
    }
    expect(available).toContain('2026-09-21T16:15:00.000Z');
  });
  it('allows exact buffer boundaries and ignores explicitly cancelled classes', () => {
    const available = slots('2026-09-21', [
      {
        startAt: new Date('2026-09-21T15:00Z'),
        endAt: new Date('2026-09-21T16:00Z'),
        status: 'SCHEDULED',
      },
      {
        startAt: new Date('2026-09-21T17:00Z'),
        endAt: new Date('2026-09-21T18:00Z'),
        status: 'CANCELLED',
      },
    ]);
    expect(available).toContain('2026-09-21T14:30:00.000Z');
    expect(available).toContain('2026-09-21T16:15:00.000Z');
    expect(available).toContain('2026-09-21T17:00:00.000Z');
  });
  it('removes occupied callback slots without adding an unnecessary buffer', () => {
    const available = slots(
      '2026-09-21',
      [],
      [
        {
          startAt: new Date('2026-09-21T15:00Z'),
          endAt: new Date('2026-09-21T15:15Z'),
        },
      ],
    );
    expect(available).not.toContain('2026-09-21T15:00:00.000Z');
    expect(available).toContain('2026-09-21T14:45:00.000Z');
    expect(available).toContain('2026-09-21T15:15:00.000Z');
  });
  it('requires at least one hour of notice, rounded up to a real slot', () => {
    const availability = buildCallbackAvailability(
      new Date('2026-09-21T14:07Z'),
      [],
      [],
    );
    expect(availability.days[0].slots[0]).toBe('2026-09-21T15:15:00.000Z');
  });
  it('covers 30 local dates even at a UTC date boundary', () => {
    const availability = buildCallbackAvailability(
      new Date('2026-09-22T02:00Z'),
      [],
      [],
    );
    expect(availability.days).toHaveLength(30);
    expect(availability.days[0]).toEqual({ date: '2026-09-21', slots: [] });
    expect(availability.days.at(-1)?.date).toBe('2026-10-20');
    expect(callbackWindow(now).end.toISOString()).toBe(
      '2026-10-21T04:00:00.000Z',
    );
  });
  it('keeps local office hours correct across daylight saving time', () => {
    const availability = buildCallbackAvailability(
      new Date('2026-10-31T08:00Z'),
      [],
      [],
    );
    expect(availability.days[0].slots[0]).toBe('2026-10-31T13:00:00.000Z');
    expect(availability.days[1].slots[0]).toBe('2026-11-01T14:00:00.000Z');
    expect(callbackDateKey(new Date('2026-11-02T03:00Z'))).toBe('2026-11-01');
  });
  it('blocks cross-midnight classes through the next office opening', () => {
    expect(
      slots('2026-09-22', [
        {
          startAt: new Date('2026-09-22T02:00Z'),
          endAt: new Date('2026-09-22T13:00Z'),
          status: 'SCHEDULED',
        },
      ])[0],
    ).toBe('2026-09-22T13:15:00.000Z');
  });
});
