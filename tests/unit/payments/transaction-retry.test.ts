import { describe, expect, it } from 'vitest';
import { retrySerializableTransaction } from '@/lib/payments/transaction-retry';

function transactionConflict() {
  return Object.assign(new Error('Transaction write conflict'), { code: 'P2034' });
}

describe('Stripe serializable transaction retry', () => {
  it('retries a transaction conflict and returns the successful result', async () => {
    let attempts = 0;

    const result = await retrySerializableTransaction(async () => {
      attempts += 1;
      if (attempts < 3) throw transactionConflict();
      return 'processed';
    });

    expect(result).toBe('processed');
    expect(attempts).toBe(3);
  });

  it('does not retry an unrelated processing error', async () => {
    let attempts = 0;
    const failure = new Error('Invalid payment metadata');

    await expect(retrySerializableTransaction(async () => {
      attempts += 1;
      throw failure;
    })).rejects.toBe(failure);

    expect(attempts).toBe(1);
  });

  it('stops after three transaction-conflict attempts', async () => {
    let attempts = 0;

    await expect(retrySerializableTransaction(async () => {
      attempts += 1;
      throw transactionConflict();
    })).rejects.toMatchObject({ code: 'P2034' });

    expect(attempts).toBe(3);
  });
});
