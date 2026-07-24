import { describe, expect, it } from 'vitest';
import {
  parseSombleClients,
  parseSombleTransactions,
  summarizeSombleImport,
} from '@/lib/import/somble';

const clientsCsv = `Client Name,Email Address,Status,Last Workout,Last Login,Date Joined,Total Workouts,App Downloaded,Birthday
"Rivera, Erika", ERIKA@example.com ,inactive,,2026-07-24T02:00:00.000Z,2026-07-20T12:00:00.000Z,0,true,
Melissa Llanos,melissa@rhyzefit.com,at-risk,2026-07-06T10:00:00.000Z,2026-07-21T10:00:00.000Z,2026-07-01T10:00:00.000Z,1,false,1985-05-01`;

const transactionsCsv = `transfer_date,transfer_amount,content_type,supporter,transfer_id,payment_id
2026-07-23T22:26:48.376Z,7,Classpack,"Rivera, Erika",tr_1,pi_1
2026-07-19T22:26:48.376Z,92,Subscription,Melissa Llanos,tr_2,pi_2`;

describe('Somble CSV import parsing', () => {
  it('parses quoted fields and normalizes client identity data', () => {
    const clients = parseSombleClients(clientsCsv);

    expect(clients).toHaveLength(2);
    expect(clients[0]).toMatchObject({
      name: 'Rivera, Erika',
      email: 'erika@example.com',
      sourceStatus: 'inactive',
      totalWorkouts: 0,
      appDownloaded: true,
    });
    expect(clients[1].birthday?.toISOString()).toBe(
      '1985-05-01T00:00:00.000Z',
    );
  });

  it('converts transferred dollars to integer cents and summarizes totals', () => {
    const clients = parseSombleClients(clientsCsv);
    const transactions = parseSombleTransactions(transactionsCsv);
    const summary = summarizeSombleImport(clients, transactions);

    expect(transactions.map((item) => item.amountCents)).toEqual([700, 9200]);
    expect(summary).toEqual({
      clientCount: 2,
      transactionCount: 2,
      transferredRevenueCents: 9900,
      revenueByType: {
        Classpack: 700,
        Subscription: 9200,
      },
    });
  });

  it('rejects duplicate transaction identifiers', () => {
    const duplicate = `${transactionsCsv}
2026-07-20T22:26:48.376Z,30,Event,Someone Else,tr_1,pi_3`;

    expect(() => parseSombleTransactions(duplicate)).toThrow(
      'Duplicate Somble transfer_id: tr_1',
    );
  });

  it('rejects files missing required columns', () => {
    expect(() => parseSombleClients('Client Name,Status\nName,inactive')).toThrow(
      'Missing required CSV column: Email Address',
    );
  });
});
