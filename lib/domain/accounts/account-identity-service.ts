import type { Role, UserStatus } from '@prisma/client';
import { z } from 'zod';
import { verifyPassword } from '@/lib/auth/password';
import { createSecureToken, hashToken, isTokenUsable } from '@/lib/auth/tokens';
import { hasPermission } from '@/lib/auth/permissions';
import { isApprovedOwnerEmail } from '@/lib/auth/owner-access';

export type IdentityUser = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  status: UserStatus;
  passwordHash: string | null;
  credentialsUpdatedAt: Date | null;
  stripeCustomerId: string | null;
};
export type EmailChangeRecord = {
  id: string;
  userId: string;
  actorId: string;
  oldEmail: string;
  newEmail: string;
  tokenHash: string;
  credentialFingerprint: string;
  role: Role;
  status: UserStatus;
  expiresAt: Date;
  usedAt: Date | null;
};
export type IdentityStore = {
  transaction<T>(
    userIds: string[],
    work: (store: IdentityStore) => Promise<T>,
  ): Promise<T>;
  findUser(id: string): Promise<IdentityUser | null>;
  takeRequestSlot(id: string, now: Date): Promise<boolean>;
  recoveryPending(id: string): Promise<boolean>;
  emailInUse(email: string, excludingId: string): Promise<boolean>;
  replaceToken(record: Omit<EmailChangeRecord, 'id' | 'usedAt'>): Promise<void>;
  findToken(hash: string): Promise<EmailChangeRecord | null>;
  saveName(id: string, name: string): Promise<void>;
  completeEmailChange(record: EmailChangeRecord, at: Date): Promise<void>;
  queueMessage(message: {
    userId: string;
    to: string;
    template: string;
    subject: string;
    payload: Record<string, string>;
    dedupeKey: string;
  }): Promise<void>;
  queueContactSync(userId: string): Promise<void>;
  audit(actorId: string, userId: string, action: string): Promise<void>;
  templatesApproved(): Promise<boolean>;
};
type ActorInput = { actorId: string; userId: string };

export class IdentityError extends Error {
  constructor(
    public readonly code:
      | 'FORBIDDEN'
      | 'CURRENT_PASSWORD'
      | 'UNAVAILABLE'
      | 'TOKEN'
      | 'RATE_LIMIT'
      | 'RECOVERY'
      | 'SUPPORT'
      | 'DELIVERY'
      | 'INVALID',
  ) {
    super(code);
  }
}

export function identityErrorMessage(code?: string) {
  switch (code) {
    case 'CURRENT_PASSWORD':
      return 'The current password is incorrect.';
    case 'RATE_LIMIT':
      return 'Please wait one minute before requesting another email change.';
    case 'RECOVERY':
      return 'Please finish your membership billing recovery before changing your email. Contact management for help.';
    case 'SUPPORT':
      return 'Contact management to change this protected account email.';
    case 'DELIVERY':
      return 'Email changes are not available until management reviews the security emails. Contact management for help.';
    case 'TOKEN':
      return 'This confirmation link is invalid or expired. Request a new link from your profile.';
    case 'INVALID':
      return 'Enter a valid name or email address.';
    default:
      return 'This change could not be completed. Check the details or contact management.';
  }
}

async function authorizedUser(input: ActorInput, store: IdentityStore) {
  const [actor, user] = await Promise.all([
    store.findUser(input.actorId),
    store.findUser(input.userId),
  ]);
  if (
    !actor ||
    actor.status !== 'ACTIVE' ||
    !user ||
    !['ACTIVE', 'INVITED'].includes(user.status) ||
    (actor.id !== user.id &&
      (!hasPermission(actor.role, 'members:manage') || user.role !== 'MEMBER'))
  ) {
    throw new IdentityError('FORBIDDEN');
  }
  return user;
}

function credentialFingerprint(user: IdentityUser) {
  return hashToken(
    `${user.passwordHash ?? ''}:${user.credentialsUpdatedAt?.toISOString() ?? ''}`,
  );
}

async function assertEmailAllowed(
  user: IdentityUser,
  email: string,
  store: IdentityStore,
) {
  if (user.role === 'OWNER' || isApprovedOwnerEmail(user.email))
    throw new IdentityError('SUPPORT');
  if (await store.recoveryPending(user.id)) throw new IdentityError('RECOVERY');
  if (
    email === user.email.toLowerCase() ||
    isApprovedOwnerEmail(email) ||
    (await store.emailInUse(email, user.id))
  )
    throw new IdentityError('UNAVAILABLE');
}

export async function changeAccountName(
  input: ActorInput & { name: string },
  store: IdentityStore,
) {
  const name = z.string().trim().min(1).max(120).safeParse(input.name);
  if (!name.success) throw new IdentityError('INVALID');
  await store.transaction([input.actorId, input.userId], async (tx) => {
    const user = await authorizedUser(input, tx);
    await tx.saveName(user.id, name.data);
    if (user.stripeCustomerId) await tx.queueContactSync(user.id);
    await tx.audit(input.actorId, user.id, 'account.name.updated');
  });
}

export async function requestAccountEmailChange(
  input: ActorInput & { email: string; currentPassword: string },
  store: IdentityStore,
  now = new Date(),
) {
  await authorizedUser(input, store);
  // Persist attempts outside the subsequent transaction: failed reauthentication
  // must not roll back the per-account throttle.
  if (!(await store.takeRequestSlot(input.userId, now)))
    throw new IdentityError('RATE_LIMIT');
  const email = z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .max(254)
    .safeParse(input.email);
  if (!email.success) throw new IdentityError('INVALID');
  await store.transaction([input.actorId, input.userId], async (tx) => {
    const user = await authorizedUser(input, tx);
    if (
      input.actorId === user.id &&
      (!user.passwordHash ||
        input.currentPassword.length > 1024 ||
        !(await verifyPassword(user.passwordHash, input.currentPassword)))
    )
      throw new IdentityError('CURRENT_PASSWORD');
    await assertEmailAllowed(user, email.data, tx);
    if (!(await tx.templatesApproved())) throw new IdentityError('DELIVERY');
    const { token, tokenHash } = createSecureToken();
    await tx.replaceToken({
      userId: user.id,
      actorId: input.actorId,
      oldEmail: user.email,
      newEmail: email.data,
      tokenHash,
      credentialFingerprint: credentialFingerprint(user),
      role: user.role,
      status: user.status,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    });
    await tx.queueMessage({
      userId: user.id,
      to: email.data,
      template: 'ACCOUNT_EMAIL_CONFIRMATION',
      subject: 'Confirm your new Rhyze email',
      payload: {
        name: user.name || 'Rhyzer',
        confirmUrl: `/confirm-email/${token}`,
      },
      dedupeKey: `email-confirmation:${tokenHash}`,
    });
    await tx.audit(input.actorId, user.id, 'account.email.requested');
  });
}

export async function confirmAccountEmailChange(
  presentedToken: string,
  store: IdentityStore,
  now = new Date(),
) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(presentedToken))
    throw new IdentityError('TOKEN');
  const hash = hashToken(presentedToken);
  const initial = await store.findToken(hash);
  if (!initial) throw new IdentityError('TOKEN');
  await store.transaction([initial.actorId, initial.userId], async (tx) => {
    // Reread after the row lock so two confirmations cannot consume one token.
    const record = await tx.findToken(hash);
    if (!record || !isTokenUsable(record, now))
      throw new IdentityError('TOKEN');
    const user = await authorizedUser(
      { actorId: record.actorId, userId: record.userId },
      tx,
    );
    if (
      user.email !== record.oldEmail ||
      user.role !== record.role ||
      user.status !== record.status ||
      credentialFingerprint(user) !== record.credentialFingerprint
    )
      throw new IdentityError('TOKEN');
    await assertEmailAllowed(user, record.newEmail, tx);
    await tx.completeEmailChange(record, now);
    await tx.queueMessage({
      userId: user.id,
      to: record.oldEmail,
      template: 'ACCOUNT_EMAIL_CHANGED',
      subject: 'Your Rhyze email was changed',
      payload: { name: user.name || 'Rhyzer', contactUrl: '/contact' },
      dedupeKey: `email-changed:${record.id}`,
    });
    if (user.stripeCustomerId) await tx.queueContactSync(user.id);
    await tx.audit(record.actorId, user.id, 'account.email.confirmed');
  });
}
