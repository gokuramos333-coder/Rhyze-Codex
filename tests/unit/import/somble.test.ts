import { describe, expect, it } from 'vitest';
import {
  groupSombleAttendees,
  parseSombleAttendees,
  parseSombleClients,
  parseSombleMemberships,
  parseSombleTransactions,
  sombleImportedCreditEntitlement,
  sombleMembershipStatus,
  sombleProductDefaults,
  summarizeSombleImport,
} from '@/lib/import/somble';

const clientsCsv = `Client Name,Email Address,Status,Last Workout,Last Login,Date Joined,Total Workouts,App Downloaded,Birthday
"Rivera, Erika", ERIKA@example.com ,inactive,,2026-07-24T02:00:00.000Z,2026-07-20T12:00:00.000Z,0,true,
Melissa Llanos,melissa@rhyzefit.com,at-risk,2026-07-06T10:00:00.000Z,2026-07-21T10:00:00.000Z,2026-07-01T10:00:00.000Z,1,false,1985-05-01`;

const transactionsCsv = `transfer_date,transfer_amount,content_type,supporter,transfer_id,payment_id
2026-07-23T22:26:48.376Z,7,Classpack,"Rivera, Erika",tr_1,pi_1
2026-07-19T22:26:48.376Z,92,Subscription,Melissa Llanos,tr_2,pi_2`;

const membershipsCsv = `membership_name,supporter_name,supporter_email,payment_structure,payment_structure_amount,credits_remaining,status,payment_amount,access_method,purchase_date,expiration_date,pause_date,unsubscribe_date
"Intro Offer 7-Days ","Melody  Lopez",MELODY@example.com,credits,7,4,active,8.55,card payment,2026-07-27T15:16:42.940Z,2026-08-03T15:16:42.940Z,,
"The VIP Access Pass",Amy Anjum,amy@example.com,duration,monthly,,active,199,card payment,2026-07-17T23:16:36.399Z,2026-08-16T23:16:36.399Z,,`;

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

  it('parses attendee exports and normalizes names, email, and check-in state', () => {
    const attendees = parseSombleAttendees(
      '\uFEFF"display_name","email_address","access_type","checked_in_status"\n"Staci  Johnson","STACI@example.com","purchased","false"',
    );

    expect(attendees).toEqual([
      {
        name: 'Staci Johnson',
        email: 'staci@example.com',
        accessType: 'purchased',
        checkedIn: false,
      },
    ]);
  });

  it('rejects duplicate attendee emails in one roster', () => {
    expect(() =>
      parseSombleAttendees(
        'display_name,email_address,access_type,checked_in_status\nOne,member@example.com,purchased,false\nTwo,MEMBER@example.com,purchased,false',
      ),
    ).toThrow('Duplicate attendee email: member@example.com');
  });

  it('rejects guest rows that reuse a member email because guests need their own accounts', () => {
    expect(() =>
      parseSombleAttendees(
        'display_name,email_address,access_type,checked_in_status\nAlexis Caslander,alexis@example.com,purchased,false\nAlexis Caslander Guest 1,alexis@example.com,purchased,',
      ),
    ).toThrow('Duplicate attendee email: alexis@example.com');
  });

  it('parses current Somble memberships without inventing unlimited credits', () => {
    const memberships = parseSombleMemberships(membershipsCsv);

    expect(memberships).toHaveLength(2);
    expect(memberships[0]).toMatchObject({
      planName: 'Intro Offer 7-Days',
      supporterName: 'Melody Lopez',
      supporterEmail: 'melody@example.com',
      paymentStructure: 'credits',
      paymentStructureAmount: 7,
      creditsRemaining: 4,
      status: 'active',
      paymentAmountCents: 855,
    });
    expect(memberships[0].expiresAt?.toISOString()).toBe(
      '2026-08-03T15:16:42.940Z',
    );
    expect(memberships[1].creditsRemaining).toBeNull();
    expect(memberships[1].paymentStructureAmount).toBe('monthly');
  });

  it('rejects negative remaining credits in a Somble membership export', () => {
    expect(() =>
      parseSombleMemberships(membershipsCsv.replace(',4,active,',',-1,active,')),
    ).toThrow('Invalid credits_remaining: -1');
  });

  it('maps Somble membership state to a supported Rhyze state', () => {
    expect(sombleMembershipStatus('active')).toBe('ACTIVE');
    expect(sombleMembershipStatus('inactive')).toBe('EXPIRED');
    expect(sombleMembershipStatus('paused')).toBe('PAUSED');
    expect(() => sombleMembershipStatus('mystery')).toThrow(
      'Unsupported Somble membership status: mystery',
    );
  });

  it('preserves the promised eight monthly credits for OG Rhyze Tribe', () => {
    expect(
      sombleProductDefaults({
        planName: 'OG Rhyze Tribe',
        paymentStructure: 'duration',
        paymentStructureAmount: 'monthly',
        paymentAmountCents: 9200,
      }),
    ).toEqual({
      slug: 'somble-og-rhyze-tribe',
      description: 'Legacy Somble plan preserved for transferred members.',
      kind: 'LIMITED_MEMBERSHIP',
      priceCents: 9200,
      billingInterval: 'MONTHLY',
      includedCredits: 8,
      isUnlimited: false,
      isPublic: false,
      isActive: false,
      alwaysAvailable: false,
    });
  });

  it('maps known transferred plans to their promised monthly access', () => {
    expect(
      sombleProductDefaults({
        planName: 'Ritual',
        paymentStructure: 'duration',
        paymentStructureAmount: 'monthly',
        paymentAmountCents: 16800,
      }),
    ).toMatchObject({ includedCredits: 8, isUnlimited: false });

    expect(
      sombleProductDefaults({
        planName: 'Elevate',
        paymentStructure: 'duration',
        paymentStructureAmount: 'monthly',
        paymentAmountCents: 9200,
      }),
    ).toMatchObject({ includedCredits: 4, isUnlimited: false });

    expect(
      sombleProductDefaults({
        planName: 'The VIP Access Pass',
        paymentStructure: 'duration',
        paymentStructureAmount: 'monthly',
        paymentAmountCents: 19900,
      }),
    ).toMatchObject({ kind: 'VIP', includedCredits: null, isUnlimited: true });

    expect(
      sombleProductDefaults({
        planName: 'Intro Offer 7-Days',
        paymentStructure: 'credits',
        paymentStructureAmount: 7,
        paymentAmountCents: 700,
      }),
    ).toMatchObject({ kind: 'INTRO_TRIAL', includedCredits: null, isUnlimited: true });
  });

  it('uses an exported remaining balance before a known plan allowance', () => {
    expect(
      sombleImportedCreditEntitlement({
        creditsRemaining: 6,
        includedCredits: 8,
        isUnlimited: false,
      }),
    ).toEqual({ shouldCreate: true, isUnlimited: false, balance: 6 });

    expect(
      sombleImportedCreditEntitlement({
        creditsRemaining: null,
        includedCredits: 8,
        isUnlimited: false,
      }),
    ).toEqual({ shouldCreate: true, isUnlimited: false, balance: 8 });

    expect(
      sombleImportedCreditEntitlement({
        creditsRemaining: null,
        includedCredits: null,
        isUnlimited: true,
      }),
    ).toEqual({ shouldCreate: true, isUnlimited: true, balance: null });
  });
});
