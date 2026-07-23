'use server';

import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import { signIn, signOut } from '@/auth';
import {
  AccountConflictError,
  createAccount,
  InvalidInstructorCodeError,
  InvalidPasswordError,
} from '@/lib/domain/accounts/account-service';
import { prismaAccountRepository } from '@/lib/domain/accounts/prisma-account-repository';
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
import { queueInstructorApprovalNotifications } from '@/lib/domain/onboarding/instructor-approval-notifications';

export async function signInAction(formData: FormData): Promise<void> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    phone: formData.get('phone'),
    referralCode: formData.get('referralCode'),
    instructorCode: formData.get('instructorCode'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    redirect('/sign-in?error=invalid');
  }

  try {
    await signIn('credentials', {
      ...parsed.data,
      redirectTo: '/continue',
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
    const account = await createAccount(parsed.data, prismaAccountRepository);
    await queueEmail(prisma, {
      userId: account.id,
      to: account.email,
      subject: 'Welcome to Rhyze Fitness',
      template: 'WELCOME',
      payload: { name: parsed.data.name },
    });
    if (account.instructorApplicationId) {
      await queueInstructorApprovalNotifications(prisma, {
        applicationId: account.instructorApplicationId,
        applicantName: parsed.data.name,
        applicantEmail: account.email,
      });
    }
  } catch (error) {
    if (error instanceof AccountConflictError) {
      redirect('/sign-up?error=exists');
    }
    if (error instanceof InvalidPasswordError) {
      redirect('/sign-up?error=password');
    }
    if (error instanceof InvalidInstructorCodeError) {
      redirect('/sign-up?error=instructor');
    }
    throw error;
  }

  await signIn('credentials', {
    email: parsed.data.email,
    password: parsed.data.password,
    redirectTo: '/continue',
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

  try {
    await resetPassword(
      parsed.data.token,
      parsed.data.password,
      prismaPasswordResetRepository,
    );
  } catch {
    redirect(`/reset-password/${parsed.data.token}?error=token`);
  }

  redirect('/sign-in?reset=1');
}
