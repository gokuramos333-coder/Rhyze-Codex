import { beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '@/lib/auth/password';
import { hashToken } from '@/lib/auth/tokens';
import {
  changeAccountName,
  requestAccountEmailChange,
  confirmAccountEmailChange,
  type IdentityUser,
  type IdentityStore,
  type EmailChangeRecord,
} from '@/lib/domain/accounts/account-identity-service';

let passwordHash: string;
const now = new Date('2026-09-21T12:00:00Z');
beforeAll(async () => {
  passwordHash = await hashPassword('CurrentPass1!');
});

function fixture() {
  const user: IdentityUser = {
    id: 'member',
    name: 'Old Name',
    email: 'old@example.com',
    role: 'MEMBER',
    status: 'ACTIVE',
    passwordHash,
    credentialsUpdatedAt: null,
    stripeCustomerId: 'cus_history',
  };
  const users = new Map<string, IdentityUser>([
    [user.id, user],
    [
      'staff',
      { ...user, id: 'staff', email: 'staff@example.com', role: 'MANAGER' },
    ],
  ]);
  const tokens: EmailChangeRecord[] = [];
  const messages: Array<{
    to: string;
    template: string;
    payload: Record<string, string>;
  }> = [];
  const history = {
    bookings: ['booking1'],
    purchases: ['purchase1'],
    membershipId: 'membership1',
  };
  const state = {
    pendingRecovery: false,
    throttled: false,
    invalidated: false,
    syncPending: false,
  };
  const store: IdentityStore = {
    async transaction(_ids, work) {
      return work(store);
    },
    async findUser(id) {
      return users.get(id) ?? null;
    },
    async takeRequestSlot() {
      if (state.throttled) return false;
      state.throttled = true;
      return true;
    },
    async recoveryPending() {
      return state.pendingRecovery;
    },
    async emailInUse(email, id) {
      return [...users.values()].some(
        (u) => u.id !== id && u.email.toLowerCase() === email,
      );
    },
    async replaceToken(record) {
      tokens.splice(0, tokens.length, {
        ...record,
        id: 'token1',
        usedAt: null,
      });
    },
    async findToken(hash) {
      return tokens.find((t) => t.tokenHash === hash) ?? null;
    },
    async saveName(id, name) {
      users.get(id)!.name = name;
    },
    async completeEmailChange(record, at) {
      users.get(record.userId)!.email = record.newEmail;
      users.get(record.userId)!.credentialsUpdatedAt = at;
      record.usedAt = at;
      state.invalidated = true;
    },
    async queueMessage(message) {
      messages.push(message);
    },
    async queueContactSync() {
      state.syncPending = true;
    },
    async audit() {},
    async templatesApproved() {
      return true;
    },
  };
  const request = (overrides = {}) =>
    requestAccountEmailChange(
      {
        actorId: 'member',
        userId: 'member',
        email: 'new@example.com',
        currentPassword: 'CurrentPass1!',
        ...overrides,
      },
      store,
      now,
    );
  return { user, users, tokens, messages, history, state, store, request };
}

describe('account identity edits', () => {
  it('updates the actual account name without requiring birthday or emergency details', async () => {
    const f = fixture();
    await changeAccountName(
      { actorId: 'member', userId: 'member', name: '  New Name  ' },
      f.store,
    );
    expect(f.user.name).toBe('New Name');
    expect(f.user.id).toBe('member');
    expect(f.user.stripeCustomerId).toBe('cus_history');
    expect(f.history).toEqual({
      bookings: ['booking1'],
      purchases: ['purchase1'],
      membershipId: 'membership1',
    });
    expect(f.state.syncPending).toBe(true);
  });
  it('allows authorized staff to edit member names and request new-address verification', async () => {
    const f = fixture();
    await changeAccountName(
      { actorId: 'staff', userId: 'member', name: 'Correct Name' },
      f.store,
    );
    await f.request({ actorId: 'staff', currentPassword: '' });
    expect(f.user.name).toBe('Correct Name');
    expect(f.messages[0].to).toBe('new@example.com');
    expect(f.user.email).toBe('old@example.com');
  });
  it.each(['INSTRUCTOR', 'MEMBER'] as const)(
    'rejects arbitrary-client edits by %s',
    async (role) => {
      const f = fixture();
      f.users.get('staff')!.role = role;
      await expect(
        changeAccountName(
          { actorId: 'staff', userId: 'member', name: 'Bad' },
          f.store,
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(f.request({ actorId: 'staff' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(f.user.name).toBe('Old Name');
      expect(f.tokens).toHaveLength(0);
    },
  );
  it('does not let management edit another privileged account', async () => {
    const f = fixture();
    f.user.role = 'OWNER';
    await expect(f.request({ actorId: 'staff' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
  it('rejects incorrect current password before issuing a token', async () => {
    const f = fixture();
    await expect(
      f.request({ currentPassword: 'Wrong1!' }),
    ).rejects.toMatchObject({ code: 'CURRENT_PASSWORD' });
    expect(f.tokens).toHaveLength(0);
    expect(f.messages).toHaveLength(0);
  });
  it('rejects case-insensitive duplicate email without identifying its owner', async () => {
    const f = fixture();
    await expect(
      f.request({ email: ' STAFF@EXAMPLE.COM ' }),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(f.tokens).toHaveLength(0);
  });
  it('keeps old login until confirmation, then preserves identity and notifies the old address', async () => {
    const f = fixture();
    await f.request({ email: ' NEW@EXAMPLE.COM ' });
    expect(f.user.email).toBe('old@example.com');
    expect(f.messages).toHaveLength(1);
    const token = f.messages[0].payload.confirmUrl.split('/').at(-1)!;
    expect(f.tokens[0].tokenHash).toBe(hashToken(token));
    expect(f.tokens[0].tokenHash).not.toBe(token);
    await confirmAccountEmailChange(
      token,
      f.store,
      new Date(now.getTime() + 1000),
    );
    expect(f.user.email).toBe('new@example.com');
    expect(f.user.role).toBe('MEMBER');
    expect(f.user.id).toBe('member');
    expect(f.user.stripeCustomerId).toBe('cus_history');
    expect(f.messages[1]).toMatchObject({
      to: 'old@example.com',
      template: 'ACCOUNT_EMAIL_CHANGED',
    });
    expect(f.state).toMatchObject({ invalidated: true, syncPending: true });
    await expect(
      confirmAccountEmailChange(token, f.store, now),
    ).rejects.toMatchObject({ code: 'TOKEN' });
  });
  it('rejects expired tokens at the exact expiry', async () => {
    const f = fixture();
    await f.request();
    const token = f.messages[0].payload.confirmUrl.split('/').at(-1)!;
    await expect(
      confirmAccountEmailChange(token, f.store, f.tokens[0].expiresAt),
    ).rejects.toMatchObject({ code: 'TOKEN' });
    expect(f.user.email).toBe('old@example.com');
  });
  it('rejects confirmation after password credentials change', async () => {
    const f = fixture();
    await f.request();
    const token = f.messages[0].payload.confirmUrl.split('/').at(-1)!;
    f.user.passwordHash = 'changed-password-hash';
    await expect(
      confirmAccountEmailChange(token, f.store, now),
    ).rejects.toMatchObject({ code: 'TOKEN' });
  });
  it('rechecks target uniqueness at confirmation', async () => {
    const f = fixture();
    await f.request();
    const token = f.messages[0].payload.confirmUrl.split('/').at(-1)!;
    f.users.get('staff')!.email = 'NEW@example.com';
    await expect(
      confirmAccountEmailChange(token, f.store, now),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(f.user.email).toBe('old@example.com');
  });
  it('rate limits repeated requests, including unsuccessful reauthentication', async () => {
    const f = fixture();
    await expect(f.request({ currentPassword: 'wrong' })).rejects.toMatchObject(
      { code: 'CURRENT_PASSWORD' },
    );
    await expect(f.request()).rejects.toMatchObject({ code: 'RATE_LIMIT' });
  });
  it('blocks changes while exact-account billing recovery is pending', async () => {
    const f = fixture();
    f.state.pendingRecovery = true;
    await expect(f.request()).rejects.toMatchObject({ code: 'RECOVERY' });
    expect(f.messages).toHaveLength(0);
  });
  it.each([
    'vanessa@rhyzefit.com',
    'melissa@rhyzefit.com',
    'gui@westaffnj.com',
    'automation-admin@rhyze.local',
  ])('does not grant owner identity via %s', async (email) => {
    const f = fixture();
    await expect(f.request({ email })).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    expect(f.user.role).toBe('MEMBER');
  });
  it('does not change allowlisted owner login addresses through self-service', async () => {
    const f = fixture();
    f.user.role = 'OWNER';
    await expect(f.request()).rejects.toMatchObject({ code: 'SUPPORT' });
  });
  it('requires security templates to be reviewed before requesting a change', async () => {
    const f = fixture();
    f.store.templatesApproved = async () => false;
    await expect(f.request()).rejects.toMatchObject({ code: 'DELIVERY' });
    expect(f.tokens).toHaveLength(0);
  });
});
