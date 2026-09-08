import { describe, expect, it } from 'vitest';
import {
  manualCreditAccountCanBeDeleted,
  manualCreditKindForLabel,
  manualCreditLabel,
} from '@/lib/domain/credits/manual-credit';

describe('manual credit types', () => {
  it('creates event-credit labels that remain event-only in booking rules', () => {
    const label = manualCreditLabel('EVENT', '2026-09-09');

    expect(label).toBe('Event credit — Manual admin grant — expires 2026-09-09');
    expect(manualCreditKindForLabel(label)).toBe('EVENT');
  });

  it('keeps manually granted class credits separate from event credits', () => {
    const label = manualCreditLabel('CLASS', '2026-09-09');

    expect(label).toBe('Class credit — Manual admin grant — expires 2026-09-09');
    expect(manualCreditKindForLabel(label)).toBe('CLASS');
  });

  it('allows deletion only for unused standalone manual grants', () => {
    expect(
      manualCreditAccountCanBeDeleted({
        isUnlimited: false,
        sourcePurchaseId: null,
        entries: [
          {
            type: 'GRANT',
            quantity: 3,
            bookingId: null,
            reason: 'Manual admin credit grant: test',
          },
        ],
      }),
    ).toBe(true);

    expect(
      manualCreditAccountCanBeDeleted({
        isUnlimited: false,
        sourcePurchaseId: null,
        entries: [
          {
            type: 'GRANT',
            quantity: 3,
            bookingId: null,
            reason: 'Manual admin credit grant: test',
          },
          {
            type: 'RESERVE',
            quantity: -1,
            bookingId: 'booking_1',
            reason: 'Class booking',
          },
        ],
      }),
    ).toBe(false);
  });

  it('never deletes purchased, unlimited, or non-manual credit accounts', () => {
    const manualEntry = {
      type: 'GRANT',
      quantity: 3,
      bookingId: null,
      reason: 'Manual admin credit grant: test',
    };

    expect(
      manualCreditAccountCanBeDeleted({
        isUnlimited: false,
        sourcePurchaseId: 'purchase_1',
        entries: [manualEntry],
      }),
    ).toBe(false);
    expect(
      manualCreditAccountCanBeDeleted({
        isUnlimited: true,
        sourcePurchaseId: null,
        entries: [manualEntry],
      }),
    ).toBe(false);
    expect(
      manualCreditAccountCanBeDeleted({
        isUnlimited: false,
        sourcePurchaseId: null,
        entries: [
          {
            ...manualEntry,
            reason: 'Purchase',
          },
        ],
      }),
    ).toBe(false);
  });
});
