import { describe, expect, it } from 'vitest';
import {
  isSombleImportAuthorized,
  parseSombleImportJobPayload,
  parseSombleRosterJobPayload,
  shouldPreserveExistingBooking,
} from '@/lib/import/somble-import-job';

describe('Somble production import job payload', () => {
  it('accepts the three reconciled CSV exports with audit file names', () => {
    expect(
      parseSombleImportJobPayload({
        clientsCsv: 'Client Name,Email Address\nMember,member@example.com',
        transactionsCsv: 'transfer_id,payment_id\ntr_1,pay_1',
        membershipsCsv: 'membership_name,supporter_email\nPlan,member@example.com',
        clientSourceFile: 'Somble_Clients_20260727.csv',
        transactionSourceFile: 'Somble_TransactionsData_20260727.csv',
        membershipSourceFile: 'Rhyze_Fitness_MembershipData_20260727.csv',
      }),
    ).toMatchObject({
      clientSourceFile: 'Somble_Clients_20260727.csv',
      transactionSourceFile: 'Somble_TransactionsData_20260727.csv',
      membershipSourceFile: 'Rhyze_Fitness_MembershipData_20260727.csv',
    });
  });

  it('rejects paths so an import cannot read arbitrary server files', () => {
    expect(() =>
      parseSombleImportJobPayload({
        clientsCsv: 'clients',
        transactionsCsv: 'transactions',
        clientSourceFile: '../clients.csv',
        transactionSourceFile: 'transactions.csv',
      }),
    ).toThrow('clientSourceFile must be a file name, not a path');
  });

  it('accepts a temporary import-only secret without replacing the job secret', () => {
    expect(
      isSombleImportAuthorized('Bearer import-once', {
        jobSecret: 'scheduled-jobs',
        importSecret: 'import-once',
      }),
    ).toBe(true);
    expect(
      isSombleImportAuthorized('Bearer wrong', {
        jobSecret: 'scheduled-jobs',
        importSecret: 'import-once',
      }),
    ).toBe(false);
  });

  it('accepts audited attendee exports for exact class occurrences', () => {
    expect(
      parseSombleRosterJobPayload({
        rosters: [
          {
            occurrenceId: 'owned-mon-pilates-0',
            attendeesCsv:
              'display_name,email_address,access_type,checked_in_status\nMember,member@example.com,membership,false',
            sourceFile: 'RhyzeFitness_Attendees_20260803.csv',
          },
        ],
      }),
    ).toMatchObject({
      rosters: [
        {
          occurrenceId: 'owned-mon-pilates-0',
          sourceFile: 'RhyzeFitness_Attendees_20260803.csv',
        },
      ],
    });
  });

  it('creates a booking when the attendee has no existing booking', () => {
    expect(shouldPreserveExistingBooking(null)).toBe(false);
    expect(shouldPreserveExistingBooking({ source: 'RHYZE' })).toBe(true);
    expect(shouldPreserveExistingBooking({ source: 'SOMBLE_IMPORT' })).toBe(
      false,
    );
  });
});
