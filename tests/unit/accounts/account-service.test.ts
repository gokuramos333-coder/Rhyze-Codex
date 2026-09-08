import { describe, expect, it } from 'vitest';
import {
  AccountConflictError,
  createAccount,
  type AccountRepository,
} from '@/lib/domain/accounts/account-service';

function repository(existingEmail?: string): AccountRepository & {
  created: Array<{ email: string; name: string; phone: string; dateOfBirth: Date; passwordHash: string; waiverVersionId: string; mediaConsent: boolean }>;
} {
  const created: Array<{
    email: string;
    name: string;
    phone: string;
    dateOfBirth: Date;
    passwordHash: string;
    waiverVersionId: string;
    mediaConsent: boolean;
  }> = [];

  return {
    created,
    async findByEmail(email) {
      return existingEmail === email ? { id: 'existing-user' } : null;
    },
    async createMember(input) {
      created.push(input);
      return {
        id: 'new-member',
        email: input.email,
      };
    },
  };
}

describe('createAccount', () => {
  it('normalizes an email and creates a member with a password hash', async () => {
    const repo = repository();

    const account = await createAccount(
      {
        name: '  Maya Collins ',
        email: ' MAYA@Example.COM ',
        phone: '973-555-0101',
        dateOfBirth: new Date('1990-04-12T12:00:00.000Z'),
        waiverAccepted: true,
        waiverVersionId: 'waiver-current',
        password: 'Rhyze!StrongPass2026',
      },
      repo,
    );

    expect(account).toEqual({
      id: 'new-member',
      email: 'maya@example.com',
    });
    expect(repo.created).toHaveLength(1);
    expect(repo.created[0].name).toBe('Maya Collins');
    expect(repo.created[0].email).toBe('maya@example.com');
    expect(repo.created[0].passwordHash).not.toContain('Rhyze!StrongPass2026');
  });

  it('rejects an existing normalized email', async () => {
    const repo = repository('maya@example.com');

    await expect(
      createAccount(
        {
          name: 'Maya Collins',
          email: 'MAYA@example.com',
          phone: '973-555-0101',
          dateOfBirth: new Date('1990-04-12T12:00:00.000Z'),
          waiverAccepted: true,
          waiverVersionId: 'waiver-current',
          password: 'Rhyze!StrongPass2026',
        },
        repo,
      ),
    ).rejects.toBeInstanceOf(AccountConflictError);
  });

  it('rejects a weak password before writing', async () => {
    const repo = repository();

    await expect(
      createAccount(
        {
          name: 'Maya Collins',
          email: 'maya@example.com',
          phone: '973-555-0101',
          dateOfBirth: new Date('1990-04-12T12:00:00.000Z'),
          waiverAccepted: true,
          waiverVersionId: 'waiver-current',
          password: 'weak',
        },
        repo,
      ),
    ).rejects.toThrow('Use at least 9 characters.');
    expect(repo.created).toHaveLength(0);
  });

  it('never creates an instructor application from the public member signup', async () => {
    const repo = repository();

    await createAccount(
      {
        name: 'Maya Collins',
        email: 'maya@example.com',
        phone: '973-555-0101',
        dateOfBirth: new Date('1990-04-12T12:00:00.000Z'),
        waiverAccepted: true,
        waiverVersionId: 'waiver-current',
        password: 'Rhyze!StrongPass2026',
      },
      repo,
    );

    expect(repo.created[0]).not.toHaveProperty('createInstructorApplication');
  });
});
