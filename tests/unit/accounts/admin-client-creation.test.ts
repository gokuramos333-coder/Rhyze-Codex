import { describe, expect, it, vi } from 'vitest';
import {
  AdminClientConflictError,
  createAdminClient,
  parseAdminClientInput,
} from '@/lib/domain/accounts/admin-client-creation';

describe('admin client creation', () => {
  it('normalizes identity details and stores birthday without a year supplied by admin', () => {
    const parsed = parseAdminClientInput({
      firstName: '  Avery ',
      lastName: ' Decker ',
      email: ' AVERY@EXAMPLE.COM ',
      phone: ' 973-555-1212 ',
      birthdayMonth: '9',
      birthdayDay: '8',
    });

    expect(parsed).toMatchObject({
      name: 'Avery Decker',
      email: 'avery@example.com',
      phone: '973-555-1212',
    });
    expect(parsed.dateOfBirth.getUTCMonth()).toBe(8);
    expect(parsed.dateOfBirth.getUTCDate()).toBe(8);
  });

  it('rejects an impossible birthday', () => {
    expect(() => parseAdminClientInput({
      firstName: 'Avery',
      lastName: 'Decker',
      email: 'avery@example.com',
      phone: '9735551212',
      birthdayMonth: '2',
      birthdayDay: '31',
    })).toThrow('Enter a valid birthday');
  });

  it('creates an invited passwordless member through the repository', async () => {
    const repository = {
      findByEmail: vi.fn().mockResolvedValue(null),
      createInvitedMember: vi.fn().mockResolvedValue({ id: 'member-1', email: 'avery@example.com' }),
    };

    await expect(createAdminClient({
      actorId: 'owner-1',
      input: parseAdminClientInput({
        firstName: 'Avery',
        lastName: 'Decker',
        email: 'avery@example.com',
        phone: '9735551212',
        birthdayMonth: '9',
        birthdayDay: '8',
      }),
      repository,
    })).resolves.toEqual({ id: 'member-1', email: 'avery@example.com' });

    expect(repository.createInvitedMember).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'owner-1',
      name: 'Avery Decker',
      email: 'avery@example.com',
    }));
  });

  it('refuses an existing email without creating a duplicate', async () => {
    const repository = {
      findByEmail: vi.fn().mockResolvedValue({ id: 'existing' }),
      createInvitedMember: vi.fn(),
    };

    await expect(createAdminClient({
      actorId: 'owner-1',
      input: parseAdminClientInput({
        firstName: 'Avery', lastName: 'Decker', email: 'avery@example.com',
        phone: '9735551212', birthdayMonth: '9', birthdayDay: '8',
      }),
      repository,
    })).rejects.toBeInstanceOf(AdminClientConflictError);
    expect(repository.createInvitedMember).not.toHaveBeenCalled();
  });
});
