import { describe, expect, it } from 'vitest';
import { evaluateTransferWindow } from '@/lib/domain/transfers/transfer-policy';

describe('class transfer policy', () => {
  const start = new Date('2026-07-24T14:00:00Z');

  it('is free more than six hours before class', () => {
    expect(evaluateTransferWindow(start, new Date('2026-07-24T07:59:00Z'), 'STANDARD')).toBe('FREE');
  });

  it('charges standard clients five dollars from six to two hours before class', () => {
    expect(evaluateTransferWindow(start, new Date('2026-07-24T08:00:00Z'), 'STANDARD')).toBe('FEE_500');
    expect(evaluateTransferWindow(start, new Date('2026-07-24T11:59:00Z'), 'STANDARD')).toBe('FEE_500');
  });

  it('blocks transfers two hours or less before class', () => {
    expect(evaluateTransferWindow(start, new Date('2026-07-24T12:00:00Z'), 'STANDARD')).toBe('BLOCKED');
  });

  it('keeps VIP transfers free but blocks them at two hours', () => {
    expect(evaluateTransferWindow(start, new Date('2026-07-24T10:00:00Z'), 'VIP')).toBe('FREE');
    expect(evaluateTransferWindow(start, new Date('2026-07-24T12:30:00Z'), 'VIP')).toBe('BLOCKED');
  });

  it('keeps trial and complimentary rescheduling fee-free until the two-hour block', () => {
    expect(evaluateTransferWindow(start, new Date('2026-07-24T10:00:00Z'), 'INTRO_TRIAL')).toBe('FREE');
    expect(evaluateTransferWindow(start, new Date('2026-07-24T10:00:00Z'), 'COMPLIMENTARY')).toBe('FREE');
  });
});
