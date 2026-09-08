'use server';

import { AuthError } from 'next-auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { signIn, signOut } from '@/auth';
import {
  AccountConflictError,
  AgreementRequiredError,
  createAccount,
  InvalidPasswordError,
} from '@/lib/domain/accounts/account-service';
import { prismaAccountRepository } from '@/lib/domain/accounts/prisma-account-repository';
import { issueAccountClaim } from '@/lib/domain/accounts/account-claim-service';
import { prismaAccountClaimRepository } from '@/lib/domain/accounts/prisma-account-claim-repository';
import {
  requestPasswordReset,
  resetPassword,
} from '@/lib/domain/accounts/password-reset-service';
import { prismaPasswordResetRepository } from '@/lib/domain/accounts/prisma-password-reset-repository';
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpInputFromFormData,
  signUpSchema,
} from '@/lib/validation/auth';
import { prisma } from '@/lib/db/prisma';
import { queueEmail } from '@/lib/notifications/email-queue';

export async function signInAction(formData: FormData): Promise<void> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    phone: formData.get('phone'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    redirect('/sign-in?error=invalid');
  }

  try {
    const requestedCallback = String(formData.get('callbackUrl') ?? '');
    const redirectTo =
      requestedCallback.startsWith('/') && !requestedCallback.startsWith('//')
        ? requestedCallback
        : '/continue';
    await signIn('credentials', {
      ...parsed.data,
      redirectTo,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect('/sign-in?error=credentials');
    }
    throw error;
  }
}

export async function signUpAction(formData: FormData): Promise<void> {
  const parsed = signUpSchema.safeParse(signUpInputFromFormData(formData));

  if (!parsed.success) {
    redirect('/sign-up?error=invalid');
  }

  try {
    const activeWaiver = await prisma.waiverVersion.findFirst({
      where: { isActive: true, requiresSign: true },
      select: { id: true },
      orderBy: { effectiveAt: 'desc' },
    });
    if (!activeWaiver) redirect('/sign-up?error=agreement');
    const requestHeaders = await headers();
    const forwardedFor = requestHeaders.get('x-forwarded-for');
    const account = await createAccount(
      {
        ...parsed.data,
        waiverVersionId: activeWaiver.id,
        ipAddress: forwardedFor?.split(',')[0]?.trim() || null,
        userAgent: requestHeaders.get('user-agent'),
      },
      prismaAccountRepository,
    );
    await queueEmail(prisma, {
      userId: account.id,
      to: account.email,
      subject: 'Welcome to Rhyze Fitness',
      template: 'WELCOME',
      payload: { name: parsed.data.name, memberUrl: '/member' },
      dedupeKey: `welcome:${account.id}`,
    });
    await queueEmail(prisma, {
      to: 'melissa@rhyzefit.com',
      cc: ['vanessa@rhyzefit.com'],
      subject: `New Rhyze signup: ${parsed.data.name}`,
      template: 'NEW_SIGNUP_ADMIN',
      payload: {
        memberName: parsed.data.name,
        memberEmail: account.email,
        memberPhone: parsed.data.phone,
        adminUrl: `/admin/members/${account.id}`,
      },
      dedupeKey: `new-signup-admin:${account.id}`,
    });
  } catch (error) {
    if (error instanceof AccountConflictError) {
      redirect('/sign-up?error=exists');
    }
    if (error instanceof InvalidPasswordError) {
      redirect('/sign-up?error=password');
    }
    if (error instanceof AgreementRequiredError) {
      redirect('/sign-up?error=agreement');
    }
    throw error;
  }

  const requestedCallback = String(formData.get('callbackUrl') ?? '');
  const redirectTo =
    requestedCallback.startsWith('/') && !requestedCallback.startsWith('//')
      ? requestedCallback
      : '/continue';
  await signIn('credentials', {
    email: parsed.data.email,
    password: parsed.data.password,
    redirectTo,
  });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/' });
}

export async function forgotPasswordAction(formData: FormData): Promise<void> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get('email'),
  });
  if (!parsed.success) redirect('/forgot-password?error=invalid');

  const token = await requestPasswordReset(
    parsed.data.email,
    prismaPasswordResetRepository,
  );

  if (token) {
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, name: true, email: true },
    });
    if (user) {
      await queueEmail(prisma, {
        userId: user.id,
        to: user.email,
        subject: 'Reset your Rhyze password',
        template: 'PASSWORD_RESET',
        payload: {
          name: user.name || 'Rhyzer',
          resetUrl: `/reset-password/${token}`,
        },
        dedupeKey: `password-reset:${token}`,
      });
    }
  } else {
    const invitedUser = await prisma.user.findUnique({
      where: { email: parsed.data.email.trim().toLowerCase() },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        passwordHash: true,
      },
    });
    if (
      invitedUser?.role === 'MEMBER' &&
      invitedUser.status === 'INVITED' &&
      !invitedUser.passwordHash
    ) {
      const claim = await issueAccountClaim(invitedUser.id, prismaAccountClaimRepository);
      await queueEmail(prisma, {
        userId: invitedUser.id,
        to: invitedUser.email,
        subject: 'Your new My Rhyze Fitness account is ready!',
        template: 'ACCOUNT_ACTIVATION',
        payload: {
          name: invitedUser.name?.split(/\s+/)[0] || 'Rhyzer',
          activationUrl: `/claim-account/${encodeURIComponent(claim.rawToken)}`,
        },
        dedupeKey: `account-activation-reminder:${invitedUser.id}:${Date.now()}`,
      });
    }
  }

  if (process.env.NODE_ENV !== 'production' && token) {
    redirect(`/reset-password/${token}`);
  }

  redirect('/forgot-password?sent=1');
}

export async function resetPasswordAction(formData: FormData): Promise<void> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get('token'),
    password: formData.get('password'),
    passwordConfirmation: formData.get('passwordConfirmation'),
  });
  if (!parsed.success) {
    redirect(
      `/reset-password/${String(formData.get('token') || '')}?error=password`,
    );
  }

  let resetUserId: string;
  try {
    const result = await resetPassword(
      parsed.data.token,
      parsed.data.password,
      prismaPasswordResetRepository,
    );
    resetUserId = result.userId;
  } catch {
    redirect(`/reset-password/${parsed.data.token}?error=token`);
  }

  const user = await prisma.user.findUnique({
    where: { id: resetUserId },
    select: { id: true, email: true, name: true },
  });
  if (user) {
    try {
      await queueEmail(prisma, {
        userId: user.id,
        to: user.email,
        subject: 'Your Rhyze password was changed',
        template: 'PASSWORD_CHANGED',
        payload: { name: user.name || 'Rhyzer', contactUrl: '/contact' },
        dedupeKey: `password-changed:${user.id}:${Date.now()}`,
      });
    } catch (error) {
      console.error('Unable to queue password change confirmation', error);
    }
  }

  redirect('/sign-in?reset=1');
}
