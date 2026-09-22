import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NextAuthConfig } from 'next-auth';
import { createIdentityStore } from '@/lib/domain/accounts/prisma-account-identity-repository';
import {
  requestAccountEmailChange,
  confirmAccountEmailChange,
  changeAccountName,
} from '@/lib/domain/accounts/account-identity-service';
import { hashPassword } from '@/lib/auth/password';
import { EMAIL_TEMPLATE_REVISION } from '@/lib/notifications/email-templates';
import { syncAccountContacts } from '@/lib/domain/accounts/account-contact-sync';
import { createAccountClaimRepository } from '@/lib/domain/accounts/prisma-account-claim-repository';
import { createPasswordResetRepository } from '@/lib/domain/accounts/prisma-password-reset-repository';
import { issueAccountClaim } from '@/lib/domain/accounts/account-claim-service';
import {
  requestPasswordReset,
  resetPassword,
} from '@/lib/domain/accounts/password-reset-service';
import { accountTokenEmailIsDeliverable } from '@/lib/domain/accounts/account-token-delivery';
import { claimImportedAccount } from '@/lib/domain/accounts/account-claim-service';
import { accountTokenSnapshot } from '@/lib/domain/accounts/account-token-security';
import { prisma as applicationDb } from '@/lib/db/prisma';
import '@/auth';

const capturedAuth = vi.hoisted(() => ({
  config: null as NextAuthConfig | null,
}));
vi.mock('next-auth', () => ({
  default: (config: NextAuthConfig) => {
    capturedAuth.config = config;
    return {};
  },
}));
vi.mock('@/lib/db/prisma', async () => {
  const { PrismaClient } = await import('@prisma/client');
  return {
    prisma: new PrismaClient({
      datasourceUrl: process.env.IDENTITY_TEST_DATABASE_URL,
    }),
  };
});

// Never fall back to the application DATABASE_URL. Run only against an explicit
// disposable local database; fixtures contain no production identities.
const url = process.env.IDENTITY_TEST_DATABASE_URL;
if (url && !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
  throw new Error('Identity tests require a disposable local database');
describe.skipIf(!url)('identity repository on PostgreSQL', () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const store = createIdentityStore(db);
  const prefix = `identity-test-${randomUUID()}`;
  let passwordHash: string;
  beforeAll(async () => {
    passwordHash = await hashPassword('CurrentPass1!');
    for (const template of [
      'ACCOUNT_EMAIL_CONFIRMATION',
      'ACCOUNT_EMAIL_CHANGED',
    ]) {
      await db.emailTemplateReview.upsert({
        where: { template },
        update: {},
        create: {
          template,
          revision: EMAIL_TEMPLATE_REVISION,
          approvedById: prefix,
          approvedByEmail: 'reviewer@example.test',
        },
      });
    }
  });
  afterAll(async () => {
    await db.auditLog.deleteMany({
      where: { actorId: { startsWith: prefix } },
    });
    await db.emailMessage.deleteMany({
      where: { userId: { startsWith: prefix } },
    });
    await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
    await db.emailTemplateReview.deleteMany({
      where: { approvedById: prefix },
    });
    await db.$disconnect();
    await applicationDb.$disconnect();
  });
  async function member() {
    const id = `${prefix}-${randomUUID()}`;
    return db.user.create({
      data: {
        id,
        name: 'Original',
        email: `${id}@example.test`,
        passwordHash,
        stripeCustomerId: `cus_${id}`,
        memberProfile: { create: { preferredName: 'History' } },
      },
    });
  }
  async function request(
    user: { id: string },
    email = `${randomUUID()}@example.test`,
  ) {
    await requestAccountEmailChange(
      {
        actorId: user.id,
        userId: user.id,
        email,
        currentPassword: 'CurrentPass1!',
      },
      store,
    );
    const message = await db.emailMessage.findFirstOrThrow({
      where: { userId: user.id, template: 'ACCOUNT_EMAIL_CONFIRMATION' },
      orderBy: { createdAt: 'desc' },
    });
    return (message.payload as { confirmUrl: string }).confirmUrl
      .split('/')
      .at(-1)!;
  }
  async function invited() {
    const user = await member();
    return db.user.update({
      where: { id: user.id },
      data: { status: 'INVITED', passwordHash: null },
    });
  }
  async function staffEmailRequest(user: { id: string }) {
    const actor = await member();
    await db.user.update({
      where: { id: actor.id },
      data: { role: 'MANAGER' },
    });
    await requestAccountEmailChange(
      {
        actorId: actor.id,
        userId: user.id,
        email: `${randomUUID()}@example.test`,
        currentPassword: '',
      },
      store,
    );
    const message = await db.emailMessage.findFirstOrThrow({
      where: { userId: user.id, template: 'ACCOUNT_EMAIL_CONFIRMATION' },
    });
    return (message.payload as { confirmUrl: string }).confirmUrl
      .split('/')
      .at(-1)!;
  }
  it('rejects a claim requested for the old address when confirmation wins before issuance', async () => {
    const user = await invited();
    const token = await staffEmailRequest(user);
    await confirmAccountEmailChange(token, store);
    await expect(
      issueAccountClaim(
        user.id,
        createAccountClaimRepository(db),
        new Date(),
        user.email,
      ),
    ).rejects.toThrow();
    expect(
      await db.accountClaimToken.count({ where: { userId: user.id } }),
    ).toBe(0);
  });
  it('serializes claim issuance after its identity read with a competing confirmation', async () => {
    const user = await invited();
    const token = await staffEmailRequest(user);
    const claims = createAccountClaimRepository(db);
    const racing = {
      ...claims,
      async findEligibleUserById(id: string) {
        const snapshot = await claims.findEligibleUserById(id);
        await confirmAccountEmailChange(token, store);
        return snapshot;
      },
    };
    await expect(issueAccountClaim(user.id, racing)).rejects.toThrow();
    expect(
      await db.accountClaimToken.count({ where: { userId: user.id } }),
    ).toBe(0);
  });
  it('serializes password reset issuance after its old-address lookup with competing confirmation', async () => {
    const user = await member();
    const token = await request(user);
    const resets = createPasswordResetRepository(db);
    const racing = {
      ...resets,
      async findActiveUserByEmail(email: string) {
        const snapshot = await resets.findActiveUserByEmail(email);
        await confirmAccountEmailChange(token, store);
        return snapshot;
      },
    };
    await expect(requestPasswordReset(user.email, racing)).resolves.toBeNull();
    expect(
      await db.passwordResetToken.count({ where: { userId: user.id } }),
    ).toBe(0);
  });
  it('never delivers a new-identity claim to a stale recipient captured before confirmation', async () => {
    const user = await invited();
    const token = await staffEmailRequest(user);
    await confirmAccountEmailChange(token, store);
    const claim = await issueAccountClaim(
      user.id,
      createAccountClaimRepository(db),
    );
    const current = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(claim.email).toBe(current.email);
    const message = {
      userId: user.id,
      template: 'ACCOUNT_ACTIVATION',
      to: user.email,
      toList: [user.email],
      cc: [],
      bcc: [],
      payload: { activationUrl: `/claim-account/${claim.rawToken}` },
    };
    expect(await accountTokenEmailIsDeliverable(db, message)).toBe(false);
    expect(
      await accountTokenEmailIsDeliverable(db, {
        ...message,
        to: current.email,
        toList: [current.email],
      }),
    ).toBe(true);
  });
  it('consumes a password reset only once under concurrent requests', async () => {
    const user = await member();
    const repo = createPasswordResetRepository(db);
    const token = await requestPasswordReset(user.email, repo);
    const results = await Promise.allSettled([
      resetPassword(token!, 'SecureNew1!', repo),
      resetPassword(token!, 'OtherNew1!', repo),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('uses the real credentials authorizer: old login before confirmation, only new login afterward', async () => {
    const user = await member();
    const email = `${randomUUID()}@example.test`;
    const provider = capturedAuth.config!.providers[0] as unknown as {
      options: {
        authorize(credentials: {
          email: string;
          password: string;
        }): Promise<{ id?: string; email?: string | null } | null>;
      };
    };
    const login = (address: string) =>
      provider.options.authorize({ email: address, password: 'CurrentPass1!' });
    const token = await request(user, email);
    expect(await login(user.email)).toMatchObject({
      id: user.id,
      email: user.email,
    });
    expect(await login(email)).toBeNull();
    await confirmAccountEmailChange(token, store);
    expect(await login(user.email)).toBeNull();
    expect(await login(email)).toMatchObject({ id: user.id, email });
  });
  it('revalidates claim consumption after a pre-read races with email confirmation', async () => {
    const user = await invited();
    const emailToken = await staffEmailRequest(user);
    const claims = createAccountClaimRepository(db);
    const claim = await issueAccountClaim(user.id, claims);
    const racing = {
      ...claims,
      async findTokenByHash(hash: string) {
        const token = await claims.findTokenByHash(hash);
        await confirmAccountEmailChange(emailToken, store);
        return token;
      },
    };
    await expect(
      claimImportedAccount(
        claim.rawToken,
        'NewSecure1!',
        new Date('2000-04-12'),
        true,
        'never-written-waiver',
        racing,
      ),
    ).rejects.toThrow('invalid or expired');
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: user.id } }))
        .passwordHash,
    ).toBeNull();
  });
  it('migration fingerprint backfill matches runtime snapshots, including millisecond credentials timestamps', async () => {
    const user = await member();
    const updated = await db.user.update({
      where: { id: user.id },
      data: { credentialsUpdatedAt: new Date('2026-09-21T15:22:33.123Z') },
    });
    const rows = await db.$queryRaw<
      Array<{ fingerprint: string }>
    >`SELECT encode(sha256(convert_to(COALESCE("passwordHash", '') || ':' || COALESCE(to_char("credentialsUpdatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '') || ':' || "role"::text || ':' || "status"::text, 'UTF8')), 'hex') AS fingerprint FROM "User" WHERE "id" = ${user.id}`;
    expect(rows[0].fingerprint).toBe(
      accountTokenSnapshot(updated).credentialFingerprint,
    );
  });
  it('retains profile and Stripe identity; deletes old reset/claim/session access and durably queues notices/contact sync', async () => {
    const user = await member();
    const expiry = new Date(Date.now() + 60_000);
    await db.passwordResetToken.create({
      data: { userId: user.id, tokenHash: randomUUID(), expiresAt: expiry },
    });
    await db.accountClaimToken.create({
      data: { userId: user.id, tokenHash: randomUUID(), expiresAt: expiry },
    });
    await db.session.create({
      data: { userId: user.id, sessionToken: randomUUID(), expires: expiry },
    });
    await changeAccountName(
      { actorId: user.id, userId: user.id, name: 'Corrected' },
      store,
    );
    const email = `${randomUUID()}@example.test`;
    const token = await request(user, email);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: user.id } })).email,
    ).toBe(user.email);
    await confirmAccountEmailChange(token, store);
    const actual = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      include: {
        memberProfile: true,
        sessions: true,
        accountClaimTokens: true,
        passwordResetTokens: true,
      },
    });
    expect(actual).toMatchObject({
      id: user.id,
      name: 'Corrected',
      email,
      stripeCustomerId: user.stripeCustomerId,
      role: 'MEMBER',
      memberProfile: { preferredName: 'History' },
      sessions: [],
      accountClaimTokens: [],
      passwordResetTokens: [],
    });
    expect(actual.credentialsUpdatedAt).toBeInstanceOf(Date);
    expect(
      await db.emailMessage.count({
        where: {
          userId: user.id,
          to: user.email,
          template: 'ACCOUNT_EMAIL_CHANGED',
        },
      }),
    ).toBe(1);
    expect(
      await db.accountContactSync.count({ where: { userId: user.id } }),
    ).toBe(1);
  });
  it('allows only one concurrent confirmation for the same token', async () => {
    const user = await member();
    const token = await request(user);
    const results = await Promise.allSettled([
      confirmAccountEmailChange(token, store),
      confirmAccountEmailChange(token, store),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(
      await db.emailMessage.count({
        where: { userId: user.id, template: 'ACCOUNT_EMAIL_CHANGED' },
      }),
    ).toBe(1);
  });
  it('allows only one concurrent claim of a case-insensitive address, including non-identity user creation', async () => {
    const [one, two] = await Promise.all([member(), member()]);
    const email = `${randomUUID()}@example.test`;
    const [a, b] = await Promise.all([
      request(one, email),
      request(two, email.toUpperCase()),
    ]);
    const results = await Promise.allSettled([
      confirmAccountEmailChange(a, store),
      confirmAccountEmailChange(b, store),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      await db.user.count({
        where: { email: { equals: email, mode: 'insensitive' } },
      }),
    ).toBe(1);
    await expect(
      db.user.create({
        data: { id: `${prefix}-duplicate`, email: email.toUpperCase() },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
  it('enforces request rate limiting atomically and does not roll it back after a wrong password', async () => {
    const user = await member();
    await expect(
      requestAccountEmailChange(
        {
          actorId: user.id,
          userId: user.id,
          email: 'next@example.test',
          currentPassword: 'wrong',
        },
        store,
      ),
    ).rejects.toMatchObject({ code: 'CURRENT_PASSWORD' });
    await expect(request(user)).rejects.toMatchObject({ code: 'RATE_LIMIT' });
    const another = await member();
    const results = await Promise.allSettled([
      request(another),
      request(another),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('coalesces contact updates to the current identity and retries provider failures durably', async () => {
    // Isolate due jobs from earlier cases without dropping any pending records.
    await db.accountContactSync.updateMany({
      where: { userId: { startsWith: prefix } },
      data: { nextAttemptAt: new Date('2099-01-01') },
    });
    const user = await member();
    await changeAccountName(
      { actorId: user.id, userId: user.id, name: 'First' },
      store,
    );
    await changeAccountName(
      { actorId: user.id, userId: user.id, name: 'Latest' },
      store,
    );
    const now = new Date(Date.now() + 1000);
    const failed = await syncAccountContacts(
      db,
      async () => {
        throw new Error('Provider unavailable');
      },
      now,
    );
    expect(failed).toEqual({ succeeded: 0, failed: 1 });
    const queued = await db.accountContactSync.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(queued.attempts).toBe(1);
    expect(queued.nextAttemptAt.getTime()).toBeGreaterThan(now.getTime());
    expect(
      await syncAccountContacts(
        db,
        async () => {
          throw new Error('Must not retry early');
        },
        now,
      ),
    ).toEqual({ succeeded: 0, failed: 0 });
    const sent: unknown[] = [];
    const result = await syncAccountContacts(
      db,
      async (customerId, contact) => {
        sent.push({ customerId, ...contact });
      },
      queued.nextAttemptAt,
    );
    expect(result).toEqual({ succeeded: 1, failed: 0 });
    expect(sent).toEqual([
      { customerId: user.stripeCustomerId, name: 'Latest', email: user.email },
    ]);
    expect(
      await db.accountContactSync.findUnique({ where: { userId: user.id } }),
    ).toBeNull();
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: user.id } }))
        .stripeCustomerId,
    ).toBe(user.stripeCustomerId);
  });
});
