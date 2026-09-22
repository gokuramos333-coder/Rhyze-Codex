import type { PrismaClient } from '@prisma/client';
import { hashToken, isTokenUsable } from '@/lib/auth/tokens';
import {
  accountTokenMatchesUser,
  withAccountTokenLock,
} from './account-token-security';

export async function accountTokenEmailIsDeliverable(
  client: PrismaClient,
  message: {
    userId: string | null;
    template: string;
    to: string;
    toList: string[];
    cc: string[];
    bcc: string[];
    payload: unknown;
  },
) {
  const reset = message.template === 'PASSWORD_RESET';
  const claim = [
    'ACCOUNT_ACTIVATION',
    'ADMIN_CLIENT_INVITATION',
    'INSTRUCTOR_WELCOME_INVITE',
  ].includes(message.template);
  if (!reset && !claim) return true;
  const payload =
    message.payload && typeof message.payload === 'object'
      ? (message.payload as Record<string, unknown>)
      : {};
  const path = payload[reset ? 'resetUrl' : 'activationUrl'];
  // Existing active instructors receive a welcome link, not a credential token.
  if (
    message.template === 'INSTRUCTOR_WELCOME_INVITE' &&
    path === '/member/instructor-access'
  )
    return true;
  if (
    !message.userId ||
    typeof path !== 'string' ||
    message.cc.length ||
    message.bcc.length
  )
    return false;
  let rawToken: string;
  try {
    const pathname = new URL(path, 'https://www.rhyzefitness.com').pathname;
    const match = pathname.match(
      reset
        ? /^\/reset-password\/([A-Za-z0-9_-]{43})$/
        : /^\/claim-account\/([A-Za-z0-9_-]{43})$/,
    );
    if (!match) return false;
    rawToken = match[1];
  } catch {
    return false;
  }
  return withAccountTokenLock(client, message.userId, async (tx) => {
    const token = reset
      ? await tx.passwordResetToken.findUnique({
          where: { tokenHash: hashToken(rawToken) },
          include: { user: true },
        })
      : await tx.accountClaimToken.findUnique({
          where: { tokenHash: hashToken(rawToken) },
          include: { user: true },
        });
    if (
      !token ||
      token.userId !== message.userId ||
      !isTokenUsable(token) ||
      !accountTokenMatchesUser(token, token.user)
    )
      return false;
    const recipients = message.toList.length ? message.toList : [message.to];
    return (
      message.to === token.emailSnapshot &&
      recipients.length === 1 &&
      recipients[0] === token.emailSnapshot
    );
  });
}
