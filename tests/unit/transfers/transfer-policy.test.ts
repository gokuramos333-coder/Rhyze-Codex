import { describe, expect, it } from 'vitest';
import { evaluateTransferWindow } from '@/lib/domain/transfers/transfer-policy';

describe('class transfer policy', () => {
  const start = new Date('2026-07-24T14:00:00Z');

  it('is free more than six hours before class', () => {
    expect(evaluateTransferWindow(start, new Date('2026-07-24T07:59:00Z'), false)).toBe('FREE');
  });

  it('charges ten dollars from six to two hours before class', () => {
    expect(evaluateTransferWindow(start, new Date('2026-07-24T08:00:00Z'), false)).toBe('FEE_1000');
    expect(evaluateTransferWindow(start, new Date('2026-07-24T11:59:00Z'), false)).toBe('FEE_1000');
  });

  it('blocks transfers two hours or less before class', () => {
    expect(evaluateTransferWindow(start, new Date('2026-07-24T12:00:00Z'), false)).toBe('BLOCKED');
  });

  it('waives the transfer fee for VIP members but not the two-hour block', () => {
    expect(evaluateTransferWindow(start, new Date('2026-07-24T10:00:00Z'), true)).toBe('FREE');
    expect(evaluateTransferWindow(start, new Date('2026-07-24T12:30:00Z'), true)).toBe('BLOCKED');
  });
});
