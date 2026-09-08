import { describe, expect, it } from 'vitest';
import {
  parseSombleInviteMode,
  runSombleAccountInviteBatch,
  type SombleInviteCandidate,
} from '@/lib/domain/accounts/somble-account-invites';

const candidates: SombleInviteCandidate[] = [
  {
    id: 'member-1',
    email: 'member@example.com',
    name: 'Maya Member',
    role: 'MEMBER',
    status: 'INVITED',
    hasPassword: false,
  },
  {
    id: 'active-1',
    email: 'active@example.com',
    name: 'Active Member',
    role: 'MEMBER',
    status: 'ACTIVE',
    hasPassword: true,
  },
  {
    id: 'instructor-1',
    email: 'instructor@example.com',
    name: 'Imported Instructor',
    role: 'INSTRUCTOR',
    status: 'INVITED',
    hasPassword: false,
  },
];

describe('Somble account invitation batch', () => {
  it('is dry-run unless --apply is explicitly present', () => {
    expect(parseSombleInviteMode([])).toEqual({ apply: false });
    expect(parseSombleInviteMode(['--dry-run'])).toEqual({ apply: false });
    expect(parseSombleInviteMode(['--apply'])).toEqual({ apply: true });
  });

  it('reports eligible and skipped accounts without writing in dry-run mode', async () => {
    const writes: string[] = [];

    const report = await runSombleAccountInviteBatch(
      { apply: false },
      {
        listCandidates: async () => candidates,
        issueClaim: async (userId) => {
          writes.push(`claim:${userId}`);
          return { rawToken: 'secret', expiresAt: new Date() };
        },
        queueInvite: async ({ userId }) => {
          writes.push(`email:${userId}`);
        },
      },
    );

    expect(report).toMatchObject({ eligible: 1, queued: 0, skipped: 2 });
    expect(report.skippedAccounts).toEqual([
      { email: 'active@example.com', reason: 'already-active' },
      { email: 'instructor@example.com', reason: 'non-member-role' },
    ]);
    expect(writes).toEqual([]);
  });

  it('issues one claim and queues one email per eligible account in apply mode', async () => {
    const writes: string[] = [];

    const report = await runSombleAccountInviteBatch(
      { apply: true },
      {
        listCandidates: async () => candidates,
        issueClaim: async (userId) => {
          writes.push(`claim:${userId}`);
          return {
            rawToken: 'private-token',
            expiresAt: new Date('2026-08-26T18:00:00.000Z'),
          };
        },
        queueInvite: async ({ userId, activationUrl }) => {
          writes.push(`email:${userId}:${activationUrl}`);
        },
      },
    );

    expect(report).toMatchObject({ eligible: 1, queued: 1, skipped: 2 });
    expect(writes).toEqual([
      'claim:member-1',
      'email:member-1:/claim-account/private-token',
    ]);
    expect(JSON.stringify(report)).not.toContain('private-token');
  });
});
